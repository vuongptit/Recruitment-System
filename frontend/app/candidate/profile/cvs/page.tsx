"use client";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, EllipsisVertical, Eye, FileText, Files, LayoutGrid, List, Monitor, Pencil, Plus, Search, Upload } from "lucide-react";
import { EmptyState, LoadingState, PageHeader } from "@/components/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { UploadProgress } from "../../../../components/UploadProgress";
import { FilePicker } from "../../../../components/FilePicker";
import type { UploadStep } from "../../../../lib/signedFileUpload";
import { requestApi } from "../../../../lib/apiClient";
import {
  person1Error,
  person1FormError,
  uploadPersonalFile,
  type PersonalUploadCheckpoint,
  type CandidateCv,
} from "../../../../lib/person1Api";
import { ConfirmationDialog } from "../../../../components/ConfirmationDialog";
import styles from "./CvLibrary.module.css";

const filters = [["ALL", "Tất cả CV"], ["UPLOAD", "CV tải lên"], ["ONLINE", "CV trực tuyến"]] as const;
type CvFilter = (typeof filters)[number][0];

export default function CvsPage() {
  const [cvs, setCvs] = useState<CandidateCv[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const checkpoint = useRef<PersonalUploadCheckpoint | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [rename, setRename] = useState<CandidateCv | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [deleting, setDeleting] = useState<CandidateCv | null>(null);
  const [filter, setFilter] = useState<CvFilter>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [listView, setListView] = useState(false);
  const uploadPanel = useRef<HTMLDetailsElement>(null);
  const uploadName = useRef<HTMLInputElement>(null);
  const renameForm = useRef<HTMLFormElement>(null);

  function showUpload(focus = true) {
    if (!uploadPanel.current) return;
    uploadPanel.current.open = true;
    uploadPanel.current.scrollIntoView({ block: "nearest" });
    if (focus) uploadName.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    function openLinkedUpload() {
      if (window.location.hash === "#upload-cv") showUpload(false);
    }
    openLinkedUpload();
    window.addEventListener("hashchange", openLinkedUpload);
    return () => window.removeEventListener("hashchange", openLinkedUpload);
  }, []);
  useEffect(() => {
    if (rename) renameForm.current?.querySelector("input")?.focus();
  }, [rename]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    requestApi<CandidateCv[]>("/api/profile/cvs", {
      privateData: true,
      signal: controller.signal,
    })
      .then((r) => { if (!controller.signal.aborted) setCvs(r.data); })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(person1Error(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formIssue = person1FormError(e.currentTarget);
    if (formIssue) { setUploadError(formIssue); return; }
    if (pending || !file) return;
    setPending(true);
    setUploadError("");
    setNotice("");
    try {
      const fileId = uploaded ?? await uploadPersonalFile(file, "CV", undefined, {
        checkpoint: checkpoint.current,
        onCheckpoint: value => { checkpoint.current = value; },
        onStep: setUploadStep,
      });
      setUploaded(fileId);
      setUploadStep("saving");
      await requestApi("/api/profile/cvs", {
        method: "POST",
        privateData: true,
        body: { title: title.trim(), fileId },
      });
      setFile(null);
      setUploaded(null);
      checkpoint.current = null;
      if (fileInput.current) fileInput.current.value = "";
      setTitle("");
      setQuery("");
      setFilter("ALL");
      setNotice("Đã lưu CV.");
      setReload((n) => n + 1);
    } catch (e) {
      setUploadError(person1Error(e));
    } finally {
      setPending(false);
      setUploadStep(null);
    }
  }
  async function mutate(
    cv: CandidateCv,
    kind: "rename" | "default" | "delete",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await requestApi<{ deletionMode?: string }>(
        `/api/profile/cvs/${cv.id}${kind === "default" ? "/default" : ""}`,
        {
          method: kind === "delete" ? "DELETE" : "PATCH",
          privateData: true,
          body: {
            expectedAggregateVersion: cv.aggregateVersion,
            ...(kind === "rename" ? { title: newTitle.trim() } : {}),
          },
        },
      );
      setNotice(
        result.data.deletionMode === "PENDING"
          ? "CV đã được ẩn. Hệ thống đang kiểm tra tham chiếu ứng tuyển trước khi hoàn tất xóa."
          : "Đã cập nhật CV.",
      );
      setDeleting(null);
      setRename(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setPending(false);
    }
  }
  async function download(cv: CandidateCv) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const r = await requestApi<{ url: string }>(
        `/api/profile/cvs/${cv.id}/download-url`,
        { method: "POST", privateData: true },
      );
      const url = new URL(r.data.url);
      if (url.protocol !== "https:")
        throw new Error("Liên kết tải không hợp lệ.");
      const link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setPending(false);
    }
  }
  const uploadedCount = cvs.filter(cv => cv.type === "UPLOAD").length;
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  const visibleCvs = cvs.filter(cv => (filter === "ALL" || filter === cv.type) && cv.title.toLocaleLowerCase("vi-VN").includes(normalizedQuery));
  visibleCvs.sort((left, right) => sort === "name" ? left.title.localeCompare(right.title, "vi-VN") :
    Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt));
  return (
    <main className={styles.page}>
      <PageHeader title="Quản lý CV" description="Quản lý và lựa chọn CV phù hợp cho từng cơ hội nghề nghiệp."
        action={<div className="btn-group">
          <button className="btn" type="button" aria-controls="upload-cv" onClick={() => showUpload()}><Upload size={17} aria-hidden="true" /> Tải CV lên</button>
          <Link className="btn btn-primary" href="/candidate/profile/cvs/builder"><Plus size={17} aria-hidden="true" /> Tạo CV mới</Link>
        </div>} />

      <section className={styles.metrics} aria-label="Thống kê CV">
        {[
          { label: "Tổng số CV", value: cvs.length, Icon: Files, tone: "all" },
          { label: "CV đã tải lên", value: uploadedCount, Icon: Upload, tone: "upload" },
          { label: "CV tạo trực tuyến", value: cvs.length - uploadedCount, Icon: Monitor, tone: "online" },
        ].map(({ label, value, Icon, tone }) => (
          <div className={styles.metric} data-tone={tone} key={label}>
            <div><span>{label}</span><strong>{loading || loadError ? "—" : value}</strong></div>
            <span className={styles.metricIcon}><Icon size={21} aria-hidden="true" /></span>
          </div>
        ))}
      </section>

      <details id="upload-cv" ref={uploadPanel} className={styles.uploadPanel}>
        <summary>Tải CV PDF</summary>
        <form className="form-stack" noValidate onSubmit={upload}>
            <p className={styles.muted}>Mỗi tài khoản có thể lưu tối đa 5 CV hoạt động.</p>
        <fieldset
          disabled={pending || loading || !!loadError || cvs.length >= 5}
          className="form-grid person1-fieldset"
        >
          <label className="field">
            Tên CV
            <input
              className="input"
              ref={uploadName}
              value={title}
              maxLength={160}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="field">
            <label htmlFor="candidate-cv-file">Tệp PDF, tối đa 5 MB</label>
            <FilePicker
              id="candidate-cv-file"
              fileName={file?.name}
              ref={fileInput}
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUploaded(null);
                checkpoint.current = null;
                setUploadError("");
              }}
            />
          </div>
          <div className="btn-group span-2"><button className="btn btn-primary" disabled={!file}>
            {pending ? "Đang lưu…" : "Tải lên và lưu CV"}
          </button></div>
        </fieldset>
        <UploadProgress step={uploadStep} />
        {uploadError ? <p className="notice notice-danger" role="alert">{uploadError}</p> : null}
        {cvs.length >= 5 ? (
          <p className="notice notice-warning">
            Bạn đã có 5 CV. Xóa bớt trước khi thêm mới.
          </p>
        ) : null}
        </form>
      </details>

      <nav className={styles.tabs} aria-label="Loại CV">
        {filters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key}
          onClick={() => setFilter(key)}>{label}{key === "ALL" && !loading && !loadError ? ` (${cvs.length})` : ""}</button>)}
      </nav>

      <section className={styles.toolbar} aria-label="Tìm và sắp xếp CV">
        <label className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <input className="input" type="search" aria-label="Tìm kiếm CV" placeholder="Tìm kiếm CV…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className={styles.viewControls}>
          <select className="select" aria-label="Sắp xếp CV" value={sort} onChange={event => setSort(event.target.value)}>
            <option value="recent">Cập nhật mới nhất</option><option value="name">Tên CV A–Z</option>
          </select>
          <div className={styles.viewToggle} role="group" aria-label="Bố cục thư viện CV">
            <button type="button" aria-label="Dạng lưới" title="Dạng lưới" aria-pressed={!listView} onClick={() => setListView(false)}><LayoutGrid size={17} aria-hidden="true" /></button>
            <button type="button" aria-label="Dạng danh sách" title="Dạng danh sách" aria-pressed={listView} onClick={() => setListView(true)}><List size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </section>
      {loadError ? <div role="alert" className="notice notice-danger">
        {loadError} <button className="btn" type="button" onClick={() => setReload(n => n + 1)}>Tải lại danh sách</button>
      </div> : null}
      {notice ? <p role="status" className="notice notice-success">{notice}</p> : null}
      {error && !rename && !deleting ? <p role="alert" className="notice notice-danger">{error}</p> : null}
      {loading ? <LoadingState label="Đang tải CV…" /> : !loadError && (visibleCvs.length ? (
        <section className={listView ? styles.list : styles.grid} aria-label="Danh sách CV">
          {visibleCvs.map(cv => {
            const preview = `/api/cv-preview/candidate/${encodeURIComponent(cv.id)}`;
            const date = new Date(cv.updatedAt ?? cv.createdAt);
            return <article className={styles.card} key={cv.id} data-type={cv.type}>
              <div className={styles.cover}>
                {cv.isDefault ? <span className={styles.defaultBadge}>Mặc định</span> : null}
                <div className={styles.paper} aria-hidden="true"><span /><FileText size={30} /><i /><i /><i /><i /></div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2>{cv.title}</h2>
                    <p className={styles.muted}>{cv.type === "ONLINE" ? "CV trực tuyến" : "Tệp PDF"}</p>
                    {Number.isFinite(date.getTime()) ? <p className={styles.date}>{cv.updatedAt ? "Cập nhật" : "Ngày tạo"}: {date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p> : null}
                  </div>
                  <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger asChild>
                      <button className={styles.menuTrigger} type="button" disabled={pending} aria-label={`Thao tác với ${cv.title}`} title="Thao tác CV"><EllipsisVertical size={20} aria-hidden="true" /></button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
                        {cv.type === "ONLINE" ? <DropdownMenu.Item className={styles.menuItem} asChild><a href={preview} target="_blank" rel="noopener noreferrer">Xem CV</a></DropdownMenu.Item> : null}
                        <DropdownMenu.Item className={styles.menuItem} onSelect={() => { setError(""); setRename(cv); setNewTitle(cv.title); }}>Đổi tên</DropdownMenu.Item>
                        {!cv.isDefault ? <DropdownMenu.Item className={styles.menuItem} onSelect={() => void mutate(cv, "default")}>Đặt mặc định</DropdownMenu.Item> : null}
                        <DropdownMenu.Separator className={styles.menuSeparator} />
                        <DropdownMenu.Item className={`${styles.menuItem} ${styles.danger}`} onSelect={() => { setError(""); setDeleting(cv); }}>Xóa CV</DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
                <div className={styles.cardActions}>
                  {cv.type === "ONLINE"
                    ? <Link className="btn btn-secondary" href={`/candidate/profile/cvs/builder?id=${encodeURIComponent(cv.id)}`}><Pencil size={15} aria-hidden="true" /> Chỉnh sửa</Link>
                    : <a className="btn btn-secondary" href={preview} target="_blank" rel="noopener noreferrer"><Eye size={15} aria-hidden="true" /> Xem CV</a>}
                  <button className="btn" type="button" disabled={pending} onClick={() => void download(cv)}><Download size={15} aria-hidden="true" /> Tải xuống</button>
                </div>
              </div>
            </article>;
          })}
        </section>
      ) : (
        <section className="card">
          <EmptyState title={cvs.length ? "Không tìm thấy CV phù hợp" : "Chưa có CV"}
            description={cvs.length ? "Thử đổi từ khóa hoặc chọn loại CV khác." : "Tải PDF hoặc tạo CV trực tuyến để bắt đầu ứng tuyển."} />
          {cvs.length ? <button className="btn" type="button" onClick={() => { setFilter("ALL"); setQuery(""); }}>Xóa bộ lọc</button> : null}
        </section>
      ))}
      {rename ? (
        <form
          ref={renameForm}
          className="card form-stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const formIssue = person1FormError(e.currentTarget);
            if (formIssue) { setError(formIssue); return; }
            void mutate(rename, "rename");
          }}
        >
          <h2>Đổi tên CV</h2>
          <label className="field">
            Tên mới
            <input
              className="input"
              autoFocus
              required
              maxLength={160}
              disabled={pending}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          {error ? <p className="notice notice-danger" role="alert">{error}</p> : null}
          <div className="btn-group">
            <button className="btn btn-primary" disabled={pending}>
              Lưu tên
            </button>
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => { setRename(null); setError(""); }}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : null}
      <ConfirmationDialog
        open={!!deleting}
        title={"Xóa " + (deleting?.title ?? "CV")}
        description="CV đã dùng ứng tuyển được giữ lại cho hồ sơ ứng tuyển. Nếu xóa CV mặc định, một CV còn lại sẽ được chọn thay thế."
        confirmLabel="Xóa CV"
        pending={pending}
        error={deleting ? error : undefined}
        onConfirm={() => {
          if (deleting) void mutate(deleting, "delete");
        }}
        onCancel={() => { setDeleting(null); setError(""); }}
      />
    </main>
  );
}
