"use client";
import Link from "next/link";
import { Check, FileText } from "lucide-react";
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
        }).then((r) => setContent(contentFromProfile(r.data)));
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
  function change(name: keyof Omit<BuilderContent, "sections">, value: string) {
    setContent((c) => ({ ...c, [name]: value }));
  }
  async function currentPdf(): Promise<Blob> {
    const fingerprint = JSON.stringify({ content, template });
    if (pdfCache.current?.fingerprint === fingerprint) return pdfCache.current.blob;
    const blob = await renderCvPdf(content, template);
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
    if (formIssue) { setError(formIssue); return; }
    if (pending) return;
    setPending(true);
    setError("");
    try {
      // The title is metadata: renaming must not regenerate or resend the PDF.
      const fingerprint = JSON.stringify({ content, template });
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
        contentJson: content,
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
        <section className={styles.templateGallery} aria-labelledby="cv-template-heading">
          <h2 id="cv-template-heading">Thư viện mẫu CV</h2>
          <div className={styles.templateGrid} role="group" aria-label="Mẫu CV">
            {(Object.entries(cvTemplates) as [CvTemplateId, typeof cvTemplates[CvTemplateId]][]).map(([id, sample]) => (
              <button className={styles.templateCard} type="button" key={id} aria-pressed={template === id} disabled={pending || loadFailed} onClick={() => setTemplate(id)}>
                <span className={styles.templateArt} data-template={id} style={{ color: sample.accent }} aria-hidden="true"><span className={styles.templateSheet}><FileText size={21} /><i /><i /><i /></span>{template === id ? <Check size={16} /> : null}</span>
                <strong>{sample.label}</strong><span className={styles.muted}>{sample.description}</span>
              </button>
            ))}
          </div>
        </section>
        <div className={styles.builderGrid}>
        <form className="card form-stack" noValidate onSubmit={save}>
          <h2 className={styles.builderTitle}>Nội dung CV</h2>
          <UploadProgress step={uploadStep} />
          <fieldset
            disabled={pending || loadFailed}
            className="person1-fieldset form-grid"
          >
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
            <div className="btn-group span-2">
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
        {!loadFailed ? <aside className={styles.livePreview} aria-labelledby="cv-live-preview">
          <div className={styles.dialogHeader}><h2 id="cv-live-preview">Xem trước trực tiếp</h2><span className={styles.muted}>{cvTemplates[template].label}</span></div>
          <article className={styles.livePaper} style={{ borderTopColor: cvTemplates[template].accent, lineHeight: cvTemplates[template].lineHeight }}>
            <h3 style={{ color: cvTemplates[template].accent, fontSize: cvTemplates[template].nameSize }}>{content.fullName || "Họ và tên"}</h3>
            <p className={styles.liveHeadline}>{content.headline || "Vị trí mong muốn"}</p>
            {content.contact ? <p className={styles.muted}>{content.contact}</p> : null}
            {content.summary ? <p>{content.summary}</p> : null}
            {content.sections.filter(section => section.text.trim()).map((section, index) => <section key={index}>
              <h4 style={{ color: cvTemplates[template].accent }}>{section.title}</h4><p>{section.text}</p>
            </section>)}
          </article>
          <p className={styles.muted}>Chọn “Xem trước PDF” để kiểm tra bố cục và ngắt trang của bản xuất.</p>
        </aside> : null}
        </div>
        </>
      )}
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
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
