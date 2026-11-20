"use client";
import Link from "next/link";
import { Check, Circle, ClipboardCheck, FileText, SlidersHorizontal } from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadProgress } from "../../../../../components/UploadProgress";
import type { UploadStep } from "../../../../../lib/signedFileUpload";
import { ApiClientError, requestApi } from "../../../../../lib/apiClient";
import { useCurrentAccount } from "../../../../../components/SessionGate";
import {
  contentFromProfile,
  cvTemplates,
  type CvTemplateId,
  renderCvPdf,
  resolveCvDesign,
  validateBuilder,
} from "../../../../../lib/cvPdf";
import {
  person1Error,
  person1FormError,
  saveBlob,
  uploadPersonalFile,
  type BuilderContent,
  type CandidateCv,
  type CandidateProfile,
  type PersonalUploadCheckpoint,
} from "../../../../../lib/person1Api";
import styles from "../CvLibrary.module.css";
import builder from "./CvBuilder.module.css";
import { CvDesignTools } from "./CvDesignTools";
import { CvLiveDocument } from "./CvLiveDocument";

const panels = [["content", "Nội dung", FileText], ["design", "Thiết kế", SlidersHorizontal], ["review", "Kiểm tra", ClipboardCheck]] as const;
const empty: BuilderContent = {
  fullName: "",
  headline: "",
  contact: "",
  summary: "",
  sections: [
    { title: "Kinh nghiệm", text: "" },
    { title: "Học vấn", text: "" },
    { title: "Kỹ năng", text: "" },
  ],
};
export default function BuilderPage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const [content, setContent] = useState<BuilderContent>(empty);
  const [title, setTitle] = useState("CV của tôi");
  const [template, setTemplate] = useState<CvTemplateId>("modern");
  const [panel, setPanel] = useState<(typeof panels)[number][0]>("content");
  const [original, setOriginal] = useState<CandidateCv | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const pdfDialog = useRef<HTMLDialogElement>(null);
  const lastPreview = useRef("");
  const pdfCache = useRef<{ fingerprint: string; blob: Blob } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const staged = useRef<{ fingerprint: string; file: File; fileId?: string; checkpoint: PersonalUploadCheckpoint | null } | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    const id = new URLSearchParams(location.search).get("id");
    const load = id
      ? requestApi<CandidateCv>(
          `/api/profile/cvs/${encodeURIComponent(id)}/builder`,
          { privateData: true, signal: controller.signal },
        ).then((r) => {
          setOriginal(r.data);
          setTitle(r.data.title);
          setContent(validateBuilder(r.data.contentJson));
          const savedTemplate = r.data.templateId;
          setTemplate(savedTemplate && Object.hasOwn(cvTemplates, savedTemplate) ? savedTemplate as CvTemplateId : "modern");
        })
      : requestApi<CandidateProfile>("/api/profile/" + account.id, {
          privateData: true,
          signal: controller.signal,
        }).then((r) => { if (!controller.signal.aborted) setContent(contentFromProfile(r.data)); });
    load
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          !(id === null && e instanceof ApiClientError && e.status === 404)
        ) {
          setError(person1Error(e));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [account]);
  useEffect(
    () => () => {
      if (lastPreview.current) URL.revokeObjectURL(lastPreview.current);
    },
    [],
  );
  useEffect(() => {
    if (preview && pdfDialog.current && !pdfDialog.current.open) pdfDialog.current.showModal();
  }, [preview]);
  function change(name: "fullName" | "headline" | "contact" | "summary", value: string) {
    setContent((c) => ({ ...c, [name]: value }));
  }
  const design = resolveCvDesign(template, content.design);
  const snapshot = { ...content, design };
  const checks = [
    { label: "Họ và tên", complete: !!content.fullName.trim(), hint: "Thêm họ tên để nhà tuyển dụng nhận diện bạn." },
    { label: "Vị trí mong muốn", complete: !!content.headline.trim(), hint: "Thêm tên vị trí phù hợp với công việc bạn ứng tuyển." },
    { label: "Thông tin liên hệ", complete: !!content.contact.trim(), hint: "Bổ sung email hoặc số điện thoại để nhà tuyển dụng liên hệ." },
    { label: "Giới thiệu", complete: !!content.summary.trim(), hint: "Tóm tắt kinh nghiệm và điểm mạnh liên quan đến vị trí." },
    { label: "Nội dung chuyên môn", complete: content.sections.some(section => section.title.trim() && section.text.trim()), hint: "Thêm kinh nghiệm, học vấn, dự án hoặc kỹ năng." },
  ];
  async function currentPdf(): Promise<Blob> {
    const fingerprint = JSON.stringify({ snapshot, template });
    if (pdfCache.current?.fingerprint === fingerprint) return pdfCache.current.blob;
    const blob = await renderCvPdf(snapshot, template);
    pdfCache.current = { fingerprint, blob };
    return blob;
  }
  async function pdf(download = false) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const blob = await currentPdf();
      if (download) saveBlob(blob, "cv.pdf");
      else {
        if (lastPreview.current) URL.revokeObjectURL(lastPreview.current);
        lastPreview.current = URL.createObjectURL(blob);
        setPreview(lastPreview.current);
      }
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setPending(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formIssue = person1FormError(e.currentTarget);
    if (formIssue) { setPanel("content"); setError(formIssue); return; }
    if (pending) return;
    setPending(true);
    setError("");
    try {
      // The title is metadata: renaming must not regenerate or resend the PDF.
      const fingerprint = JSON.stringify({ snapshot, template });
      if (staged.current?.fingerprint !== fingerprint) {
        setUploadStep("preparing");
        const blob = await currentPdf();
        staged.current = { fingerprint, file: new File([blob], "cv.pdf", { type: "application/pdf" }), checkpoint: null };
      }
      const attempt = staged.current!;
      const fileId = attempt.fileId ?? await uploadPersonalFile(attempt.file, "CV", undefined, {
        checkpoint: attempt.checkpoint,
        onCheckpoint: value => { attempt.checkpoint = value; },
        onStep: setUploadStep,
      });
      attempt.fileId = fileId;
      setUploadStep("saving");
      const body = {
        title: title.trim(),
        templateId: template,
        contentSchemaVersion: 1,
        contentJson: snapshot,
        fileId,
        ...(original
          ? { expectedAggregateVersion: original.aggregateVersion }
          : {}),
      };
      await requestApi(
        original
          ? `/api/profile/cvs/${original.id}/revisions`
          : "/api/profile/cvs/online",
        { method: "POST", privateData: true, body },
      );
      router.push("/candidate/profile/cvs");
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setPending(false);
      setUploadStep(null);
    }
  }
  function move(index: number, delta: number) {
    setContent((c) => {
      const sections = [...c.sections];
      [sections[index], sections[index + delta]] = [
        sections[index + delta],
        sections[index],
      ];
      return { ...c, sections };
    });
  }
  return (
    <main className={styles.page}>
      <PageHeader title={original ? "Chỉnh sửa CV" : "Tạo CV trực tuyến"} description="Chọn mẫu, chỉnh nội dung và xem bản PDF trước khi lưu."
        action={<div className="btn-group">{!loading && !loadFailed ? <a className={`btn ${styles.previewJump}`} href="#cv-live-preview">Xem trước trực tiếp</a> : null}<Link className="btn" href="/candidate/profile/cvs">Danh sách CV</Link></div>} />
      {loading ? (
        <LoadingState label="Đang tải nội dung…" />
      ) : (
        <>
        <div className={builder.workbench}>
        <form className={`card form-stack ${builder.editor}`} noValidate onSubmit={save}>
          <nav className={builder.panels} aria-label="Công cụ tạo CV">
            {panels.map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={panel === key} onClick={() => setPanel(key)}><Icon size={17} aria-hidden="true" /> {label}</button>)}
          </nav>
          <UploadProgress step={uploadStep} />
          {error ? <p className="notice notice-danger" role="alert">{error}</p> : null}
          <fieldset
            hidden={panel !== "content"}
            disabled={pending || loadFailed}
            className="person1-fieldset form-grid"
          >
            <h2 className={`${builder.editorHeading} span-2`}>Nội dung CV</h2>
            <label className="field">
              Tên CV
              <input
                className="input"
                value={title}
                required
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {(["fullName", "headline", "contact", "summary"] as const).map(
              (key, index) => (
                <label className={key === "summary" ? "field span-2" : "field"} key={key}>
                  {
                    [
                      "Họ tên",
                      "Vị trí mong muốn",
                      "Thông tin liên hệ",
                      "Giới thiệu",
                    ][index]
                  }
                  <textarea
                    className="textarea resize-none"
                    required={key === "fullName"}
                    maxLength={key === "summary" ? 5000 : 1000}
                    value={content[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />
                </label>
              ),
            )}
            {content.sections.map((section, index) => (
              <section className="person1-builder-section span-2 stack" key={index}>
                <label className="field">
                  Tên mục
                  <input
                    className="input"
                    required
                    maxLength={100}
                    value={section.title}
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        sections: c.sections.map((s, i) =>
                          i === index ? { ...s, title: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Nội dung
                  <textarea
                    className="textarea resize-none"
                    rows={5}
                    maxLength={5000}
                    value={section.text}
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        sections: c.sections.map((s, i) =>
                          i === index ? { ...s, text: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                </label>
                <div className="btn-group">
                  <button
                    className="btn"
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Lên
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={index === content.sections.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Xuống
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      setContent((c) => ({
                        ...c,
                        sections: c.sections.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Bỏ mục
                  </button>
                </div>
              </section>
            ))}
            <button
              className="btn"
              type="button"
              disabled={content.sections.length >= 10}
              onClick={() =>
                setContent((c) => ({
                  ...c,
                  sections: [...c.sections, { title: "Mục mới", text: "" }],
                }))
              }
            >
              Thêm mục
            </button>
          </fieldset>
          {panel === "design" ? <fieldset className="person1-fieldset" disabled={pending || loadFailed}>
            <CvDesignTools template={template} design={design}
              onDesign={next => setContent(current => ({ ...current, design: next }))}
              onTemplate={next => { setTemplate(next); setContent(current => ({ ...current, design: resolveCvDesign(next) })); }} />
          </fieldset> : null}
          {panel === "review" ? <section className={builder.review} aria-labelledby="cv-review-heading">
            <h2 id="cv-review-heading">Kiểm tra trước khi lưu</h2>
            <p>{checks.filter(check => check.complete).length} / {checks.length} mục nội dung đã có thông tin.</p>
            <ul>{checks.map(check => <li key={check.label} data-complete={check.complete}>
              {check.complete ? <Check size={17} aria-hidden="true" /> : <Circle size={17} aria-hidden="true" />}
              <div><strong>{check.label}</strong><p>{check.complete ? "Đã có thông tin" : check.hint}</p></div>
            </li>)}</ul>
            <button className="btn" type="button" onClick={() => setPanel("content")}>Quay lại chỉnh nội dung</button>
          </section> : null}
          <fieldset className={`person1-fieldset ${builder.actions}`} disabled={pending || loadFailed}>
            <div className="btn-group">
              <button className="btn" type="button" onClick={() => void pdf()}>
                Xem trước PDF
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => void pdf(true)}
              >
                Xuất PDF
              </button>
              <button className="btn btn-primary">
                {pending ? "Đang lưu…" : "Lưu CV"}
              </button>
            </div>
          </fieldset>
          {original ? (
            <p className="help">
              Lưu tạo phiên bản CV mới. Bản đã dùng trong đơn ứng tuyển được giữ
              nguyên.
            </p>
          ) : null}
        </form>
        {!loadFailed ? <aside className={builder.preview} aria-labelledby="cv-live-preview">
          <div className={styles.dialogHeader}><h2 id="cv-live-preview">Xem trước trực tiếp</h2><span className={styles.muted}>{cvTemplates[template].label}</span></div>
          <div className={builder.previewStage}><CvLiveDocument content={snapshot} template={template} /></div>
          <div className={builder.previewFooter}><p className={styles.muted}>Xem bản PDF để kiểm tra ngắt trang.</p><button className="btn" type="button" disabled={pending} onClick={() => void pdf()}>Mở bản PDF</button></div>
        </aside> : null}
        </div>
        </>
      )}
      <dialog ref={pdfDialog} className={`${styles.dialog} ${styles.pdfDialog}`} aria-labelledby="builder-pdf-title" onClose={() => {
        if (lastPreview.current) URL.revokeObjectURL(lastPreview.current);
        lastPreview.current = "";
        setPreview("");
      }}>
        {preview ? <>
          <div className={styles.dialogHeader}><h2 id="builder-pdf-title">Bản xem trước PDF</h2><button className="btn" type="button" onClick={() => pdfDialog.current?.close()}>Đóng</button></div>
          <div className="btn-group"><button className="btn" type="button" onClick={() => void pdf(true)}>Tải PDF xuống</button></div>
          <iframe className={styles.pdfFrame} src={preview} title="Bản xem trước CV PDF" />
        </> : null}
      </dialog>
    </main>
  );
}
