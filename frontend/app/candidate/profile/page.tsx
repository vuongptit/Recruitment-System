"use client";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowRight, BriefcaseBusiness, Camera, CheckCircle2, Circle, Ellipsis, Eye, FileText, LoaderCircle, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { UploadProgress } from "../../../components/UploadProgress";
import type { UploadStep } from "../../../lib/signedFileUpload";
import { useCurrentAccount } from "../../../components/SessionGate";
import { ConfirmationDialog } from "../../../components/ConfirmationDialog";
import { ApiClientError, requestApi } from "../../../lib/apiClient";
import {
  person1Error,
  person1FormError,
  profileDateError,
  profileSectionLabels,
  uploadPersonalFile,
  type CandidateProfile,
  type CandidateCv,
  type ProfileBlock,
  type PersonalUploadCheckpoint,
} from "../../../lib/person1Api";
import styles from "./CandidateProfile.module.css";
import { BlockItemDetails, ProfileSections, blockTitles, profileBlockOrder } from "./ProfileSections";
import { ProfileViewActivity } from "./ProfileViewActivity";
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  max?: number;
  disabled?: boolean;
};
const general: Field[] = [
  { name: "fullName", label: "Họ tên", max: 160 },
  { name: "headline", label: "Vị trí mong muốn", max: 200 },
  { name: "summary", label: "Giới thiệu", type: "textarea", max: 5000 },
  { name: "phone", label: "Điện thoại", max: 32 },
  { name: "address", label: "Địa chỉ", max: 500 },
  { name: "githubUrl", label: "GitHub", type: "url" },
  { name: "linkedinUrl", label: "LinkedIn", type: "url" },
  { name: "portfolioUrl", label: "Trang giới thiệu cá nhân", type: "url" },
];
const blocks: {
  key: "educations" | "experiences" | "skills" | "certificates" | "projects";
  label: string;
  fields: Field[];
}[] = [
  {
    key: "educations",
    label: "Học vấn",
    fields: [
      { name: "school", label: "Trường", required: true, max: 200 },
      { name: "major", label: "Chuyên ngành", max: 160 },
      { name: "degree", label: "Bằng cấp", max: 120 },
      {
        name: "startDate",
        label: "Ngày bắt đầu",
        type: "date",
        required: true,
      },
      { name: "endDate", label: "Ngày kết thúc", type: "date" },
      { name: "description", label: "Mô tả", type: "textarea", max: 5000 },
    ],
  },
  {
    key: "experiences",
    label: "Kinh nghiệm",
    fields: [
      { name: "companyName", label: "Công ty", required: true, max: 160 },
      { name: "position", label: "Vị trí", required: true, max: 160 },
      {
        name: "startDate",
        label: "Ngày bắt đầu",
        type: "date",
        required: true,
      },
      { name: "endDate", label: "Ngày kết thúc", type: "date" },
      { name: "isCurrent", label: "Đang làm việc", type: "checkbox" },
      { name: "description", label: "Mô tả", type: "textarea", max: 5000 },
    ],
  },
  {
    key: "skills",
    label: "Kỹ năng",
    fields: [
      { name: "name", label: "Tên kỹ năng", required: true, max: 120 },
      { name: "level", label: "Mức độ", max: 40 },
    ],
  },
  {
    key: "certificates",
    label: "Chứng chỉ",
    fields: [
      { name: "name", label: "Tên chứng chỉ", required: true, max: 160 },
      { name: "issuer", label: "Đơn vị cấp", required: true, max: 160 },
      { name: "issuedAt", label: "Ngày cấp", type: "date", required: true },
      { name: "credentialUrl", label: "Liên kết chứng chỉ", type: "url" },
    ],
  },
  {
    key: "projects",
    label: "Dự án",
    fields: [
      { name: "name", label: "Tên dự án", required: true, max: 160 },
      { name: "role", label: "Vai trò", max: 160 },
      { name: "description", label: "Mô tả", type: "textarea", max: 5000 },
      { name: "url", label: "Liên kết", type: "url" },
    ],
  },
];
const profileTabs = [
  ["overview", "Tổng quan"], ["experiences", "Kinh nghiệm"], ["educations", "Học vấn"],
  ["skills", "Kỹ năng"], ["projects", "Dự án"], ["certificates", "Chứng chỉ"],
] as const;
type ProfileTab = (typeof profileTabs)[number][0];
function Fields({
  fields,
  value,
  set,
}: {
  fields: Field[];
  value: Record<string, unknown>;
  set: (name: string, value: unknown) => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <label className={f.type === "checkbox" ? "row" : `field${f.type === "textarea" ? " span-2" : ""}`} key={f.name}>
          {f.label}
          {f.required ? " *" : ""}
          {f.type === "textarea" ? (
            <textarea
              className="textarea resize-none"
              maxLength={f.max}
              required={f.required}
              value={String(value[f.name] ?? "")}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : (
            <input
              className={f.type === "checkbox" ? undefined : "input"}
              type={f.type ?? "text"}
              required={f.required}
              disabled={f.disabled}
              min={f.name === "endDate" ? String(value.startDate ?? "") : undefined}
              maxLength={f.max ?? 2048}
              checked={
                f.type === "checkbox" ? Boolean(value[f.name]) : undefined
              }
              value={
                f.type === "checkbox" ? undefined : String(value[f.name] ?? "")
              }
              onChange={(e) =>
                set(
                  f.name,
                  f.type === "checkbox" ? e.target.checked : e.target.value,
                )
              }
            />
          )}
        </label>
      ))}
    </>
  );
}
function BlockEditor({
  block,
  items,
  onSaved,
}: {
  block: (typeof blocks)[number];
  items: ProfileBlock[];
  onSaved: (p: CandidateProfile) => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function edit(item: ProfileBlock) {
    setEditing(item.id);
    setDraft(item);
    setError("");
    setOpen(true);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formIssue = person1FormError(e.currentTarget);
    if (formIssue) { setError(formIssue); return; }
    if (busy) return;
    const dateIssue = profileDateError(block.key, draft);
    if (dateIssue) { setError(dateIssue); return; }
    setBusy(true);
    setError("");
    const body = Object.fromEntries(
      block.fields.map((f) => [
        f.name,
        f.type === "checkbox"
          ? Boolean(draft[f.name])
          : f.name === "endDate" && draft.isCurrent
            ? null
            : String(draft[f.name] ?? "").trim() || null,
      ]),
    );
    try {
      const result = await requestApi<CandidateProfile>(
        `/api/profile/${block.key}${editing ? "/" + editing : ""}`,
        { method: editing ? "PUT" : "POST", body, privateData: true },
      );
      onSaved(result.data);
      setDraft({});
      setEditing(null);
      setOpen(false);
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestApi<CandidateProfile>(
        `/api/profile/${block.key}/${deleting}`,
        { method: "DELETE", privateData: true },
      );
      onSaved(result.data);
      if (editing === deleting) { setEditing(null); setDraft({}); }
      setDeleting(null);
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card} aria-label={block.label}>
      <div className={styles.sectionHead}>
        <h2>{blockTitles[block.key]}</h2>
        <button className={`btn btn-ghost ${styles.addButton}`} type="button" disabled={busy} aria-expanded={open}
          aria-label={`Thêm ${block.label.toLowerCase()}`} title={`Thêm ${block.label.toLowerCase()}`} onClick={() => {
          setDraft({}); setEditing(null); setError(""); setOpen(true);
        }}><Plus size={20} aria-hidden="true" /></button>
      </div>
      {items.length ? (
        <ul className={block.key === "skills" ? styles.skills : styles.items}>
          {items.map((item) => (
            <li
              key={item.id}
              className={editing === item.id ? "person1-item-editing" : undefined}
            >
              {block.key === "skills" ? <>
                <strong>{item.name}{item.level ? ` · ${item.level}` : ""}</strong>
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button type="button" className={styles.skillMenuTrigger} disabled={busy} aria-label={`Thao tác với kỹ năng ${item.name}`}>
                      <Ellipsis size={18} aria-hidden="true" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className={styles.skillMenu} align="end" sideOffset={6} collisionPadding={12}>
                      <DropdownMenu.Item className={styles.skillMenuItem} onSelect={() => edit(item)}><Pencil size={15} aria-hidden="true" /> Sửa kỹ năng</DropdownMenu.Item>
                      <DropdownMenu.Item className={`${styles.skillMenuItem} ${styles.skillMenuDanger}`} onSelect={() => setDeleting(item.id)}><Trash2 size={15} aria-hidden="true" /> Xóa kỹ năng</DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </> : <>
                <div className={styles.entry}>
                  {block.key === "experiences" ? <span className={styles.entryIcon}><BriefcaseBusiness size={18} aria-hidden="true" /></span> : null}
                  <BlockItemDetails blockKey={block.key} item={item} />
                </div>
                <div className={styles.itemActions}>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => edit(item)}>
                    {editing === item.id ? "Đang sửa" : "Sửa"}
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setDeleting(item.id)}>
                    Xóa
                  </button>
                </div>
              </>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Chưa có {block.label.toLowerCase()} trong hồ sơ.</p>
      )}
      {open ? <form className={styles.blockForm} noValidate onSubmit={save}>
        <fieldset disabled={busy} className="form-stack person1-fieldset">
          <h3>{editing ? `Chỉnh sửa ${block.label.toLowerCase()}` : `Thêm ${block.label.toLowerCase()}`}</h3>
          <Fields
            fields={block.fields.map((field) => field.name === "endDate" && block.key === "experiences" ? { ...field, disabled: Boolean(draft.isCurrent) } : field)}
            value={draft}
            set={(name, value) => {
              setError("");
              setDraft((d) => ({ ...d, [name]: value, ...(name === "isCurrent" && value ? { endDate: null } : {}) }));
            }}
          />
          <div className="btn-group">
            <button className="btn btn-primary">
              {busy ? "Đang lưu…" : "Lưu " + block.label.toLowerCase()}
            </button>
            <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditing(null);
                  setDraft({});
                  setError("");
                  setOpen(false);
                }}
              >
                Hủy
            </button>
          </div>
        </fieldset>
      </form> : null}
      {error ? (
        <p role="alert" className="notice notice-danger">
          {error}
        </p>
      ) : null}
      <ConfirmationDialog
        open={!!deleting}
        title={"Xóa " + block.label.toLowerCase()}
        description="Thông tin này sẽ được xóa khỏi hồ sơ."
        confirmLabel="Xóa"
        pending={busy}
        error={deleting ? error : undefined}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
export default function ProfilePage() {
  const account = useCurrentAccount();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [editingGeneral, setEditingGeneral] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [cvs, setCvs] = useState<CandidateCv[]>([]);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvError, setCvError] = useState(false);
  const previewRef = useRef<HTMLDialogElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarNotice, setAvatarNotice] = useState("");
  const [avatarStep, setAvatarStep] = useState<UploadStep | null>(null);
  const avatarAttempt = useRef<{ source: File; checkpoint: PersonalUploadCheckpoint | null; fileId?: string } | null>(null);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    requestApi<CandidateProfile>("/api/profile/" + account.id, {
      privateData: true,
      signal: controller.signal,
    })
      .then((r) => {
        setProfile(r.data);
        setDraft({ ...r.data });
      })
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          !(e instanceof ApiClientError && e.status === 404)
        )
          setLoadError(person1Error(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [account, reload]);
  useEffect(() => {
    if (!account?.id) return;
    const controller = new AbortController();
    setCvLoading(true);
    setCvError(false);
    requestApi<CandidateCv[]>("/api/profile/cvs", { privateData: true, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setCvs(result.data); })
      .catch(() => { if (!controller.signal.aborted) setCvError(true); })
      .finally(() => { if (!controller.signal.aborted) setCvLoading(false); });
    return () => controller.abort();
  }, [account?.id, reload]);
  useEffect(() => {
    if (editingGeneral && tab === "overview") document.getElementById("profile-editor")?.focus();
  }, [editingGeneral, tab]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formIssue = person1FormError(e.currentTarget);
    if (formIssue) { setError(formIssue); return; }
    if (busy || !account) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = Object.fromEntries(
        general.map((f) => [
          f.name,
          String(draft[f.name] ?? "").trim() || null,
        ]),
      );
      const result = await requestApi<CandidateProfile>(
        "/api/profile/" + account.id,
        { method: "PUT", privateData: true, body },
      );
      setProfile(result.data);
      setDraft({ ...result.data });
      setEditingGeneral(false);
      setNotice("Đã lưu hồ sơ.");
      window.dispatchEvent(
        new CustomEvent("candidate-profile-updated", {
          detail: {
            fullName: result.data.fullName,
            avatarUrl: result.data.avatarUrl,
          },
        })
      );
    } catch (e) {
      setError(person1Error(e));
    } finally {
      setBusy(false);
    }
  }
  async function avatar(file?: File) {
    if (!file || !account || busy) return;
    setBusy(true);
    setAvatarBusy(true);
    setAvatarError("");
    setAvatarNotice("");
    try {
      if (avatarAttempt.current?.source !== file) avatarAttempt.current = { source: file, checkpoint: null };
      const attempt = avatarAttempt.current!;
      const fileId = attempt.fileId ?? await uploadPersonalFile(file, "AVATAR", undefined, {
        checkpoint: attempt.checkpoint,
        onCheckpoint: value => { attempt.checkpoint = value; },
        onStep: setAvatarStep,
      });
      attempt.fileId = fileId;
      setAvatarStep("saving");
      const result = await requestApi<CandidateProfile>(
        `/api/profile/${account.id}/avatar`,
        { method: "PUT", privateData: true, body: { fileId } },
      );
      setProfile(result.data);
      setAvatarNotice("Đã cập nhật ảnh đại diện.");
      avatarAttempt.current = null;
      window.dispatchEvent(
        new CustomEvent("candidate-profile-updated", {
          detail: {
            fullName: result.data.fullName,
            avatarUrl: result.data.avatarUrl,
          },
        })
      );
    } catch (e) {
      setAvatarError(person1Error(e));
    } finally {
      setBusy(false);
      setAvatarBusy(false);
      setAvatarStep(null);
    }
  }
  const missing = profile?.missingSections ?? [];
  const completion = profile?.completionPercent ?? 0;
  const cv = cvs.find((item) => item.isDefault) ?? cvs[0];
  const openEditor = () => { setTab("overview"); setEditingGeneral(true); };
  const completionItems = [
    { label: "Thông tin cá nhân", complete: Boolean(profile?.fullName && profile.headline && profile.phone && profile.address) },
    { label: "Giới thiệu bản thân", complete: Boolean(profile?.summary) },
    { label: "Kinh nghiệm làm việc", complete: Boolean(profile?.experiences?.length) },
    { label: "Kỹ năng chuyên môn", complete: Boolean(profile?.skills?.length) },
    { label: "Chứng chỉ", complete: Boolean(profile?.certificates?.length) },
  ] as const;
  const name = profile?.fullName || "Tên của bạn";
  const initials = (profile?.fullName?.trim() || account?.email || "UV").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  return (
    <main className={styles.page}>
      <PageHeader title="Hồ sơ cá nhân" description="Xây dựng hồ sơ và tiếp cận cơ hội nghề nghiệp phù hợp."
        action={<button className="btn" type="button" disabled={loading || !!loadError} onClick={() => previewRef.current?.showModal()}><Eye size={17} aria-hidden="true" /> Xem trước hồ sơ</button>} />
      {loadError ? <div className={styles.sectionHead} role="alert">
        <p>{loadError}</p><button className="btn" type="button" onClick={() => setReload(n => n + 1)}>Tải lại hồ sơ</button>
      </div> : null}
      {notice ? <p role="status" className="notice notice-success">{notice}</p> : null}
      {loading ? <LoadingState label="Đang tải hồ sơ…" /> : !loadError ? <>
        <div className={styles.layout}>
          <section className={styles.hero} aria-label="Thông tin ứng viên">
            <div className={styles.cover} aria-hidden="true" />
            <div className={styles.heroBody}>
              <div className={styles.heroActions}>
                <div className={styles.avatarWrap}>
                  {profile?.avatarUrl ? <img className={styles.avatar} src={profile.avatarUrl} alt="Ảnh đại diện" /> : <span className={styles.avatar} aria-label="Chưa có ảnh đại diện">{initials}</span>}
                  <label className={styles.avatarUpload} title="Thay ảnh đại diện" aria-disabled={busy}>
                    {avatarBusy ? <LoaderCircle size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                    <span className="sr-only">Thay ảnh đại diện</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-describedby="avatar-hint" onChange={(event) => { void avatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  </label>
                </div>
                <button className="btn btn-primary" type="button" disabled={busy} onClick={openEditor}><Pencil size={16} aria-hidden="true" /> Chỉnh sửa hồ sơ</button>
              </div>
              <h2>{name}</h2>
              <p className={styles.headline}>{profile?.headline || "Thêm vị trí mong muốn"}</p>
              <div className={styles.contacts}>
                {profile?.address ? <span><MapPin size={15} aria-hidden="true" /> {profile.address}</span> : null}
                {account?.email ? <span><Mail size={15} aria-hidden="true" /> {account.email}</span> : null}
                {profile?.phone ? <span><Phone size={15} aria-hidden="true" /> {profile.phone}</span> : null}
              </div>
              <span className="sr-only" id="avatar-hint">JPG, PNG hoặc WEBP. Ảnh gốc tối đa 20 MiB, 25 triệu điểm ảnh.</span>
              <div id="avatar-feedback" aria-busy={avatarBusy}>
                <UploadProgress step={avatarStep} />
                {avatarError ? <p className="notice notice-danger" role="alert">{avatarError} Bạn có thể chọn lại ảnh bằng nút máy ảnh.</p> : null}
                {avatarError && !busy && (avatarAttempt.current?.checkpoint || avatarAttempt.current?.fileId) ? <button className="btn" type="button" onClick={() => void avatar(avatarAttempt.current?.source)}>Thử lưu lại ảnh</button> : null}
                {avatarNotice ? <p className="notice" role="status">{avatarNotice}</p> : null}
              </div>
            </div>
          </section>

          <div className={styles.content}>
            <nav id="profile-section-tabs" className={styles.tabs} aria-label="Các mục hồ sơ">
              {profileTabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
            </nav>
            <div className={styles.stack} hidden={tab !== "overview"}>
              <section className={styles.card}>
                <div className={styles.sectionHead}>
                  <h2>Giới thiệu bản thân</h2>
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={openEditor}><Pencil size={16} aria-hidden="true" /> Sửa giới thiệu</button>
                </div>
                <p className={profile?.summary ? styles.summary : styles.muted}>{profile?.summary || "Thêm giới thiệu ngắn về kinh nghiệm và mục tiêu nghề nghiệp của bạn."}</p>
              </section>
              {editingGeneral ? <section className={styles.card} id="profile-editor" tabIndex={-1} aria-labelledby="profile-editor-title">
                <h2 id="profile-editor-title">Thông tin cá nhân</h2>
                <form className="form-stack" noValidate onSubmit={save}>
                  <fieldset className="person1-fieldset form-grid" disabled={busy}><Fields fields={general} value={draft} set={(field, value) => setDraft(d => ({ ...d, [field]: value }))} /></fieldset>
                  {error ? <p className="notice notice-danger" role="alert">{error}</p> : null}
                  <div className="btn-group">
                    <button className="btn btn-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thông tin chung"}</button>
                    <button className="btn" type="button" disabled={busy} onClick={() => { setEditingGeneral(false); setDraft(profile ? { ...profile } : {}); setError(""); }}>Hủy</button>
                  </div>
                </form>
              </section> : null}
              {profile?.githubUrl || profile?.linkedinUrl || profile?.portfolioUrl ? <section className={styles.card}>
                <h2>Liên kết cá nhân</h2>
                <div className={styles.links}>
                  {([["GitHub", profile.githubUrl], ["LinkedIn", profile.linkedinUrl], ["Trang cá nhân", profile.portfolioUrl]] as const).map(([label, url]) =>
                    url ? <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="btn">{label} <ArrowRight size={15} aria-hidden="true" /></a> : null)}
                </div>
              </section> : null}
            </div>
            {profileBlockOrder.map(key => {
              const block = blocks.find(item => item.key === key)!;
              return <div key={key} hidden={tab !== "overview" && tab !== key}>
                <BlockEditor block={block} items={profile?.[key] ?? []} onSaved={setProfile} />
              </div>;
            })}
          </div>

          <aside className={styles.aside} aria-label="Tóm tắt hồ sơ và CV">
            <section className={styles.card}>
              <h2>Mức độ hoàn thiện hồ sơ</h2>
              <div className={styles.score}><strong>{completion}%</strong><span>{completion === 100 ? "Đã hoàn thiện" : "Đã hoàn thành"}</span></div>
              <progress className={styles.progress} max={100} value={completion} aria-label="Mức độ hoàn thiện hồ sơ" />
              <ul className={styles.checklist}>
                {completionItems.map(item => {
                  const complete = item.complete;
                  const Icon = complete ? CheckCircle2 : Circle;
                  return <li key={item.label} data-complete={complete}><Icon size={16} aria-hidden="true" /><span><span className="sr-only">{complete ? "Đã hoàn thành: " : "Chưa hoàn thành: "}</span>{item.label}</span></li>;
                })}
              </ul>
              {missing.length ? <p className={styles.muted}>Còn thiếu: {missing.map(section => profileSectionLabels[section] ?? "Thông tin bổ sung").join(", ")}</p> : null}
              {completion < 100 ? <button className={styles.textAction} type="button" disabled={busy} onClick={() => {
                const next = missing[0];
                const section = profileTabs.find(([key]) => key === next);
                if (!section) openEditor();
                else { setTab(section[0]); document.getElementById("profile-section-tabs")?.scrollIntoView({ block: "nearest" }); }
              }}>Hoàn thiện hồ sơ <ArrowRight size={16} aria-hidden="true" /></button> : null}
            </section>
            <section className={styles.card}>
              <div className={styles.sectionHead}><h2>CV của tôi</h2><Link className={styles.textAction} href="/candidate/profile/cvs">Quản lý CV</Link></div>
              {cvError ? <p className={styles.muted}>Chưa tải được danh sách CV. Mở trang quản lý để thử lại.</p> :
                cvLoading ? <p className={styles.muted} role="status">Đang tải CV…</p> :
                cv ? <div className={styles.cvRow}>
                  <span className={styles.fileIcon}><FileText size={21} aria-hidden="true" /></span>
                  <div><strong>{cv.title}</strong><p className={styles.muted}>{cv.isDefault ? "CV mặc định · " : ""}{cv.type === "UPLOAD" ? "Tệp PDF" : "CV trực tuyến"}</p></div>
                </div> : <p className={styles.muted}>Bạn chưa có CV. Tải lên một bản PDF hoặc tạo CV trực tuyến.</p>}
              <Link className={styles.textAction} href="/candidate/profile/cvs#upload-cv"><Plus size={16} aria-hidden="true" /> Tải CV mới lên</Link>
            </section>
            {account?.role === "CANDIDATE" ? <ProfileViewActivity key={account.id} /> : null}
          </aside>
        </div>
        <dialog ref={previewRef} className={styles.preview} aria-labelledby="profile-preview-title">
          <div className={styles.sectionHead}>
            <h2 id="profile-preview-title">Xem trước hồ sơ</h2>
            <button className="btn" type="button" onClick={() => previewRef.current?.close()}>Đóng</button>
          </div>
          <div className={styles.stack}>
            <div><h3>{name}</h3><p className={styles.muted}>{[profile?.headline, profile?.address].filter(Boolean).join(" · ")}</p></div>
            {profile ? <ProfileSections profile={profile} /> : null}
          </div>
        </dialog>
      </> : null}
    </main>
  );
}
