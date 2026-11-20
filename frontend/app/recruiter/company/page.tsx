"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  UsersRound,
  FileText,
  Globe,
  MapPin,
  CalendarDays,
  ExternalLink,
  Eye,
  ShieldCheck,
  Edit3,
  Clock,
  AlertCircle,
} from "lucide-react";
import { CompanyMark } from "@/components/discovery/CompanyMark";
import styles from "@/components/discovery/Discovery.module.css";
import { companyMemberRoleLabel } from "@/lib/recruitmentLabels";
import { ConflictRecoveryPanel } from "@/components/ConflictRecoveryPanel";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { CompanyMediaUploader } from "@/components/CompanyMediaUploader";
import { CompanyMediaLibrary } from "@/components/CompanyMediaLibrary";
import { CompanyMemberInvitation } from "@/components/CompanyMemberInvitation";
import { CompanyMemberManagement } from "@/components/CompanyMemberManagement";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import {
  type ConflictSnapshot,
  isOptimisticConflict,
  prepareConflictSnapshot,
} from "@/lib/conflictRecovery";
import {
  companyVerificationView,
  isInvalidResubmissionTransition,
  requiresCompanyReverification,
} from "@/lib/companyVerification";
import {
  type Company,
  type CompanyMemberRole,
  getCompany,
  resubmitCompanyVerification,
  updateCompany,
} from "@/lib/person2Api";
import {
  emptyCompanyCreateValues,
  type CompanyCreateErrors,
  type CompanyCreateField,
} from "@/lib/companyForm";
import {
  buildCompanyEditUpdate,
  COMPANY_EDIT_CONFLICT_FIELDS,
  companyEditValues,
  isCompanyEditDirty,
  validateCompanyEdit,
  type CompanyEditValues,
} from "@/lib/companyEditForm";

type CompanyDraft = CompanyEditValues;

function safeWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function RecruiterCompanyPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "media" | "members">("overview");
  const [status, setStatus] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // Keep the form's original version separate from updates made by media controls.
  const [formSnapshot, setFormSnapshot] = useState<Company | null>(null);
  const [values, setValues] = useState<CompanyDraft>(emptyCompanyCreateValues);
  const [errors, setErrors] = useState<CompanyCreateErrors>({});
  const [discarding, setDiscarding] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [resubmitting, setResubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmationDraft, setConfirmationDraft] = useState<CompanyDraft | null>(null);
  const [conflict, setConflict] = useState<ConflictSnapshot<CompanyDraft, Company> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [memberRole, setMemberRole] = useState<CompanyMemberRole | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoadError(null);
    getCompany(controller.signal)
      .then((response) => {
        if (!active) return;
        setCompany(response.data);
        setFormSnapshot(response.data);
        setValues(companyEditValues(response.data));
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  async function persistCompany(draft: CompanyDraft, needsReview: boolean) {
    if (!company || !formSnapshot || saving || conflict || memberRole !== "OWNER") return;
    const snapshot = formSnapshot;
    setSaving(true);
    setSaveError("");
    setStatus("");
    setConflict(null);
    try {
      const response = await updateCompany(company.id, buildCompanyEditUpdate(draft, snapshot));
      setCompany(response.data);
      setFormSnapshot(response.data);
      setValues(companyEditValues(response.data));
      setErrors({});
      setEditing(false);
      setTimeout(() => editButtonRef.current?.focus(), 0);
      setStatus(needsReview
        ? "Thông tin pháp lý đã đổi. Hồ sơ được chuyển về chờ xác minh."
        : "Đã lưu thông tin công ty.");
    } catch (reason: unknown) {
      if (isOptimisticConflict(reason)) {
        try {
          const recovered = await prepareConflictSnapshot({
            error: reason,
            localDraft: draft,
            localVersion: snapshot.aggregateVersion,
            reload: async () => (await getCompany()).data,
            serverVersion: (server) => server.aggregateVersion,
            fields: COMPANY_EDIT_CONFLICT_FIELDS,
          });
          setConflict(recovered);
        } catch (reloadReason: unknown) {
          setSaveError(toUserMessage(reloadReason));
        }
      } else {
        setSaveError(toUserMessage(reason));
      }
    } finally {
      setSaving(false);
    }
  }

  function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company || !formSnapshot || saving || conflict || memberRole !== "OWNER") return;
    const nextErrors = validateCompanyEdit(values);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as CompanyCreateField | undefined;
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    const draft = { ...values };
    if (requiresCompanyReverification(formSnapshot, draft)) {
      setConfirmationDraft(draft);
      return;
    }
    void persistCompany(draft, false);
  }

  async function confirmVerifiedEdit() {
    if (!confirmationDraft || saving) return;
    await persistCompany(confirmationDraft, true);
    setConfirmationDraft(null);
  }

  async function resubmitVerification() {
    if (!company || company.verificationStatus !== "REJECTED" || resubmitting || editing || saving || memberRole !== "OWNER") return;
    setResubmitting(true);
    setVerificationError("");
    setStatus("");
    try {
      const response = await resubmitCompanyVerification();
      setCompany(response.data);
      setFormSnapshot(response.data);
      setValues(companyEditValues(response.data));
      setStatus("Đã gửi lại hồ sơ. Trạng thái đã chuyển về chờ xác minh.");
    } catch (reason: unknown) {
      if (isInvalidResubmissionTransition(reason)) {
        try {
          const latest = (await getCompany()).data;
          setCompany(latest);
          setFormSnapshot(latest);
          setValues(companyEditValues(latest));
          setStatus("Trạng thái đã thay đổi ở nơi khác. Đã tải dữ liệu mới nhất.");
        } catch (reloadReason: unknown) {
          setVerificationError(toUserMessage(reloadReason));
        }
      } else {
        setVerificationError(toUserMessage(reason));
      }
    } finally {
      setResubmitting(false);
    }
  }

  function useServerCompany() {
    if (!conflict) return;
    setCompany(conflict.server);
    setFormSnapshot(conflict.server);
    setValues(companyEditValues(conflict.server));
    setErrors({});
    setConflict(null);
    setStatus("Đã dùng dữ liệu mới nhất từ hệ thống. Bạn có thể tiếp tục chỉnh sửa.");
  }

  function keepCompanyDraft() {
    if (!conflict) return;
    setCompany(conflict.server);
    setFormSnapshot(conflict.server);
    setValues(conflict.localDraft);
    setErrors({});
    setConflict(null);
    setStatus("Đã làm mới dữ liệu nền và giữ nguyên phần bạn nhập. Kiểm tra rồi bấm Lưu thay đổi để gửi lại.");
  }

  function changeField(field: CompanyCreateField, value: string) {
    if (saving || conflict) return;
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: validateCompanyEdit(next)[field] }));
    }
  }

  function closeEditor() {
    if (!company || saving) return;
    setEditing(false);
    setDiscarding(false);
    setConflict(null);
    setSaveError("");
    setErrors({});
    setFormSnapshot(company);
    setValues(companyEditValues(company));
    setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function toggleEditor() {
    if (!company || saving || resubmitting || memberRole !== "OWNER") return;
    if (editing) {
      if (formSnapshot && isCompanyEditDirty(values, formSnapshot)) setDiscarding(true);
      else closeEditor();
      return;
    }
    setFormSnapshot(company);
    setValues(companyEditValues(company));
    setErrors({});
    setSaveError("");
    setStatus("");
    setEditing(true);
  }

  function receiveCompanyUpdate(nextCompany: Company) {
    setCompany(nextCompany);
    if (!editing) {
      setFormSnapshot(nextCompany);
      setValues(companyEditValues(nextCompany));
    }
  }

  const needsOnboarding = loadError instanceof ApiClientError && loadError.code === "COMPANY_NOT_FOUND";

  if (!company) {
    return (
      <main className={styles.page}>
        <div style={{ marginBottom: "20px" }}>
          <nav className={styles.breadcrumb} aria-label="Đường dẫn">
            <Link href="/recruiter/dashboard">Trang chủ</Link>
            <span aria-hidden="true">/</span>
            <span>Hồ sơ công ty</span>
          </nav>
        </div>
        {needsOnboarding ? (
          <section className="panel">
            <EmptyState
              title="Bạn chưa có hồ sơ công ty"
              description="Bắt đầu bằng thông tin pháp lý và doanh nghiệp. Hồ sơ mới sẽ ở trạng thái chờ xác minh."
              href="/recruiter/company/new"
              action="Tạo hồ sơ công ty"
            />
          </section>
        ) : loadError ? (
          <ErrorState message={toUserMessage(loadError)} onRetry={() => setReloadKey((value) => value + 1)} />
        ) : (
          <LoadingState label="Đang tải hồ sơ công ty" />
        )}
      </main>
    );
  }

  const verification = companyVerificationView(company.verificationStatus, company.rejectReason);
  const website = safeWebsite(company.website);
  const cover = company.media.gallery.find((item) => item.type === "IMAGE");
  const totalMediaCount = company.media.gallery.length + (company.media.logo ? 1 : 0);
  const updatedDate = new Date(company.updatedAt);
  const updatedLabel = Number.isNaN(updatedDate.getTime())
    ? "Chưa cập nhật"
    : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(updatedDate);

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn">
        <Link href="/recruiter/dashboard">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <span>Hồ sơ công ty</span>
        <span aria-hidden="true">/</span>
        <span>{company.name}</span>
      </nav>

      <ConfirmationDialog
        open={confirmationDraft !== null}
        title="Thay đổi này cần xác minh lại"
        description="Bạn đang sửa tên hoặc mã số thuế của công ty đã được xác minh. Khi lưu, công ty sẽ chuyển về trạng thái chờ xác minh lại và lý do từ chối cũ sẽ được xóa."
        confirmLabel="Xác nhận và lưu"
        pending={saving}
        onConfirm={() => { void confirmVerifiedEdit(); }}
        onCancel={() => setConfirmationDraft(null)}
      />

      <ConfirmationDialog
        open={discarding}
        title="Bỏ các thay đổi chưa lưu?"
        description="Các trường hồ sơ bạn vừa nhập chưa được lưu. Bỏ thay đổi để đóng biểu mẫu, hoặc quay lại tiếp tục chỉnh sửa."
        confirmLabel="Bỏ thay đổi"
        onConfirm={closeEditor}
        onCancel={() => setDiscarding(false)}
      />

      {/* Brand Hero Banner */}
      <section className={styles.companyHero}>
        <div className={`${styles.companyCover} ${cover ? "" : styles.companyCoverFallback}`} aria-hidden="true">
          {cover ? (
            <img src={cover.url} alt="" width={1240} height={300} decoding="async" />
          ) : (
            <Building2 />
          )}
        </div>

        <div className={styles.companyHeroBody}>
          <CompanyMark name={company.name} src={company.media.logo?.url} large />

          <div className={styles.companyHeroText}>
            {company.verificationStatus === "VERIFIED" ? (
              <span className={styles.verified}>
                <BadgeCheck size={16} aria-hidden="true" />
                Doanh nghiệp đã xác minh
              </span>
            ) : company.verificationStatus === "PENDING" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#b54708",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#fff6ed",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid #fedf89",
                }}
              >
                <Clock size={15} aria-hidden="true" />
                Đang chờ xác minh
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#b42318",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#fef3f2",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid #fecdca",
                }}
              >
                <AlertCircle size={15} aria-hidden="true" />
                Cần cập nhật xác minh
              </span>
            )}

            <h1>{company.name}</h1>

            <div className={styles.meta}>
              <span>
                <Building2 size={15} aria-hidden="true" />
                {company.industry || "Chưa cập nhật lĩnh vực"}
              </span>
              <span>
                <UsersRound size={15} aria-hidden="true" />
                {company.size ? `${company.size} nhân sự` : "Chưa cập nhật quy mô"}
              </span>
              <span>
                <FileText size={15} aria-hidden="true" />
                MST: {company.taxCode}
              </span>
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                {companyMemberRoleLabel(memberRole)}
              </span>
            </div>
          </div>

          <div className={styles.companyHeroActions}>
            {company.verificationStatus === "VERIFIED" ? (
              <Link
                className="btn btn-secondary"
                href={`/companies/${company.id}`}
                target="_blank"
                rel="noreferrer"
                title="Xem trang công ty công khai dành cho ứng viên"
              >
                <Eye size={15} aria-hidden="true" />
                Xem trang công khai
                <ExternalLink size={13} aria-hidden="true" />
              </Link>
            ) : null}

            {memberRole === "OWNER" ? (
              <button
                ref={editButtonRef}
                className={editing ? "btn btn-secondary" : "btn btn-primary"}
                type="button"
                disabled={saving || resubmitting}
                onClick={toggleEditor}
              >
                <Edit3 size={15} aria-hidden="true" />
                {editing ? "Đóng chỉnh sửa" : "Chỉnh sửa hồ sơ"}
              </button>
            ) : null}

            {website ? (
              <a className="btn" href={website} target="_blank" rel="noreferrer">
                <Globe size={15} aria-hidden="true" />
                Mở website
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>

        <nav className={styles.sectionNav} aria-label="Nội dung hồ sơ công ty">
          <a
            href="#company-overview"
            onClick={() => setActiveTab("overview")}
            style={{
              color: activeTab === "overview" ? "var(--primary)" : "#526a5b",
              borderBottomColor: activeTab === "overview" ? "var(--primary)" : "transparent",
            }}
          >
            Giới thiệu & Thông tin
          </a>
          <a
            href="#company-media"
            onClick={() => setActiveTab("media")}
            style={{
              color: activeTab === "media" ? "var(--primary)" : "#526a5b",
              borderBottomColor: activeTab === "media" ? "var(--primary)" : "transparent",
            }}
          >
            Hình ảnh & Video ({totalMediaCount})
          </a>
          <a
            href="#company-members"
            onClick={() => setActiveTab("members")}
            style={{
              color: activeTab === "members" ? "var(--primary)" : "#526a5b",
              borderBottomColor: activeTab === "members" ? "var(--primary)" : "transparent",
            }}
          >
            Đội ngũ tuyển dụng
          </a>
        </nav>
      </section>

      {/* Action status alerts */}
      {status ? (
        <p className="notice notice-success" role="status" style={{ margin: "20px 0 0" }}>
          {status}
        </p>
      ) : null}
      {saveError ? (
        <p className="notice notice-danger" role="alert" style={{ margin: "20px 0 0" }}>
          <strong>Chưa lưu được hồ sơ.</strong> {saveError}
        </p>
      ) : null}
      {verificationError ? (
        <p className="notice notice-danger" role="alert" style={{ margin: "20px 0 0" }}>
          <strong>Chưa gửi lại được hồ sơ.</strong> {verificationError}
        </p>
      ) : null}

      {/* Main 2-column layout */}
      <div className={styles.contentColumns}>
        <div className={styles.mainColumn}>
          {/* Verification alerts if rejected or pending */}
          {verification.tone === "danger" ? (
            <div className="notice notice-danger" aria-live="polite">
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <AlertCircle size={22} style={{ color: "var(--danger)", flexShrink: 0, marginTop: "2px" }} />
                <div style={{ flex: 1 }}>
                  <strong>{verification.title}</strong>
                  <p style={{ margin: "4px 0 8px" }}>{verification.description}</p>
                  {verification.rejectReason ? (
                    <p
                      style={{
                        margin: "6px 0 12px",
                        background: "white",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #fecdca",
                        color: "#b42318",
                      }}
                    >
                      <strong>Lý do từ chối:</strong> {verification.rejectReason}
                    </p>
                  ) : null}
                  {verification.canResubmit && memberRole === "OWNER" ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={resubmitVerification}
                      disabled={resubmitting || editing || saving}
                      aria-busy={resubmitting}
                    >
                      {resubmitting ? "Đang gửi lại…" : "Gửi lại để xác minh"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : verification.tone === "warning" ? (
            <div className="notice notice-warning" aria-live="polite">
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Clock size={22} style={{ color: "var(--warning)", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>{verification.title}</strong>
                  <p style={{ margin: "4px 0 0" }}>{verification.description}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Section 1: Overview & Intro */}
          <section className={styles.section} id="company-overview">
            <div className={styles.sectionTitle}>
              <h2>Giới thiệu công ty</h2>
              {memberRole === "OWNER" && !editing ? (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={saving || resubmitting}
                  onClick={toggleEditor}
                  style={{ marginLeft: "auto" }}
                >
                  <Edit3 size={14} aria-hidden="true" />
                  Chỉnh sửa
                </button>
              ) : null}
            </div>

            {!editing ? (
              <div className={styles.prose}>
                {company.description ? (
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {company.description}
                  </p>
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--discovery-muted)" }}>
                    <p style={{ marginBottom: "14px" }}>
                      Doanh nghiệp chưa cập nhật phần giới thiệu tổng quan.
                    </p>
                    {memberRole === "OWNER" ? (
                      <button className="btn btn-primary btn-sm" type="button" onClick={toggleEditor}>
                        <Edit3 size={14} aria-hidden="true" />
                        Thêm giới thiệu ngay
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {editing && verification.canResubmit ? (
              <p className="help" style={{ marginBottom: "16px" }}>
                Lưu hoặc đóng chỉnh sửa trước khi gửi lại hồ sơ để xác minh.
              </p>
            ) : null}

            {conflict ? (
              <ConflictRecoveryPanel
                resourceName="Hồ sơ công ty"
                snapshot={conflict}
                onKeepDraft={keepCompanyDraft}
                onUseServer={useServerCompany}
              />
            ) : null}

            {editing && memberRole === "OWNER" ? (
              <div>
                <div className="notice" style={{ marginBottom: "20px" }}>
                  <strong>Hồ sơ pháp lý</strong>
                  <p className="help" style={{ margin: "4px 0 0" }}>
                    Đổi tên hoặc mã số thuế khi đã xác minh sẽ đưa công ty về trạng thái chờ duyệt.
                  </p>
                </div>

                <form ref={formRef} className="form-grid" noValidate onSubmit={saveCompany} aria-busy={saving}>
                  <div className="field span-2">
                    <label className="label" htmlFor="company-name">Tên công ty</label>
                    <input
                      id="company-name"
                      name="name"
                      className="input"
                      autoComplete="organization"
                      value={values.name}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("name", event.target.value)}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "company-name-error" : undefined}
                    />
                    {errors.name ? <span id="company-name-error" className="form-error">{errors.name}</span> : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="tax-code">Mã số thuế</label>
                    <input
                      id="tax-code"
                      name="taxCode"
                      className="input"
                      inputMode="numeric"
                      value={values.taxCode}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("taxCode", event.target.value)}
                      aria-invalid={!!errors.taxCode}
                      aria-describedby={errors.taxCode ? "tax-code-error" : undefined}
                    />
                    {errors.taxCode ? <span id="tax-code-error" className="form-error">{errors.taxCode}</span> : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="company-industry">Lĩnh vực</label>
                    <input
                      id="company-industry"
                      name="industry"
                      className="input"
                      value={values.industry}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("industry", event.target.value)}
                      aria-invalid={!!errors.industry}
                      aria-describedby={errors.industry ? "company-industry-error" : undefined}
                    />
                    {errors.industry ? <span id="company-industry-error" className="form-error">{errors.industry}</span> : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="company-size">Quy mô</label>
                    <input
                      id="company-size"
                      name="size"
                      className="input"
                      placeholder="Ví dụ: 51–200 nhân sự"
                      value={values.size}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("size", event.target.value)}
                      aria-invalid={!!errors.size}
                      aria-describedby={errors.size ? "company-size-error" : undefined}
                    />
                    {errors.size ? <span id="company-size-error" className="form-error">{errors.size}</span> : null}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="company-website">Trang web (không bắt buộc)</label>
                    <input
                      id="company-website"
                      name="website"
                      className="input"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      placeholder="https://example.vn"
                      value={values.website}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("website", event.target.value)}
                      aria-invalid={!!errors.website}
                      aria-describedby={errors.website ? "company-website-error" : undefined}
                    />
                    {errors.website ? <span id="company-website-error" className="form-error">{errors.website}</span> : null}
                  </div>

                  <div className="field span-2">
                    <label className="label" htmlFor="company-address">Địa chỉ</label>
                    <input
                      id="company-address"
                      name="address"
                      className="input"
                      autoComplete="street-address"
                      value={values.address}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("address", event.target.value)}
                      aria-invalid={!!errors.address}
                      aria-describedby={errors.address ? "company-address-error" : undefined}
                    />
                    {errors.address ? <span id="company-address-error" className="form-error">{errors.address}</span> : null}
                  </div>

                  <div className="field span-2">
                    <label className="label" htmlFor="company-description">Mô tả công ty</label>
                    <textarea
                      id="company-description"
                      name="description"
                      className="textarea resize-none"
                      rows={6}
                      value={values.description}
                      disabled={saving || conflict !== null}
                      onChange={(event) => changeField("description", event.target.value)}
                      aria-invalid={!!errors.description}
                      aria-describedby={errors.description ? "company-description-error company-description-help" : "company-description-help"}
                    />
                    <span id="company-description-help" className="help">Tối đa 10.000 ký tự.</span>
                    {errors.description ? <span id="company-description-error" className="form-error">{errors.description}</span> : null}
                  </div>

                  <div className="span-2 btn-group" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <button className="btn btn-primary" type="submit" disabled={saving || conflict !== null} aria-busy={saving}>
                      {saving ? "Đang lưu…" : "Lưu thay đổi"}
                    </button>
                    <button className="btn" type="button" disabled={saving} onClick={toggleEditor}>
                      Hủy
                    </button>
                  </div>
                  {conflict ? <p className="help span-2">Chọn cách xử lý bản cập nhật ở trên trước khi tiếp tục chỉnh sửa.</p> : null}
                </form>
              </div>
            ) : null}
          </section>

          {/* Section 2: Media Management */}
          <section className={styles.section} id="company-media">
            <div className={styles.sectionTitle}>
              <h2>Hình ảnh & Video doanh nghiệp</h2>
              <span>{totalMediaCount} tệp</span>
            </div>
            <p className="help" style={{ marginBottom: "20px" }}>
              Chọn hình ảnh văn phòng, logo thương hiệu và video trải nghiệm thực tế để xây dựng văn hóa doanh nghiệp nổi bật.
            </p>

            {memberRole === "OWNER" ? (
              <div style={{ display: "grid", gap: "24px" }}>
                <div
                  style={{
                    padding: "20px 24px",
                    background: "var(--surface-2)",
                    borderRadius: "12px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>
                    Thêm hình ảnh hoặc video mới
                  </h3>
                  <p className="help" style={{ margin: "0 0 16px" }}>
                    Chọn loại tệp (Logo công ty, Ảnh bìa, Nơi làm việc, Video...), tải lên và xác nhận trước khi lưu vào hồ sơ.
                  </p>
                  <CompanyMediaUploader
                    company={company}
                    onCompanyChange={receiveCompanyUpdate}
                  />
                </div>

                <CompanyMediaLibrary
                  company={company}
                  onCompanyChange={receiveCompanyUpdate}
                />
              </div>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                <p className="help">
                  Chỉ chủ sở hữu doanh nghiệp mới có quyền cập nhật và lưu thư viện hình ảnh.
                </p>
                <CompanyMediaLibrary
                  company={company}
                  onCompanyChange={receiveCompanyUpdate}
                />
              </div>
            )}
          </section>

          {/* Section 3: Member Management */}
          <section className={styles.section} id="company-members">
            <div className={styles.sectionTitle}>
              <h2>Đội ngũ tuyển dụng & Phân quyền</h2>
            </div>
            <div style={{ display: "grid", gap: "24px" }}>
              <CompanyMemberManagement companyId={company.id} onRoleChange={setMemberRole} />
              {memberRole === "OWNER" ? <CompanyMemberInvitation companyId={company.id} /> : null}
            </div>
          </section>
        </div>

        {/* Right Sidebar: General Information */}
        <aside className={styles.sideColumn} aria-label="Thông tin doanh nghiệp">
          <section className={styles.section}>
            <h2 style={{ fontSize: "17px", fontWeight: 750, margin: "0 0 20px" }}>
              Thông tin chung
            </h2>
            <dl className={styles.factsList}>
              <div className={styles.fact}>
                <Building2 size={19} aria-hidden="true" />
                <div>
                  <dt>Lĩnh vực hoạt động</dt>
                  <dd>{company.industry || "Chưa cập nhật"}</dd>
                </div>
              </div>

              <div className={styles.fact}>
                <UsersRound size={19} aria-hidden="true" />
                <div>
                  <dt>Quy mô công ty</dt>
                  <dd>{company.size ? `${company.size} nhân sự` : "Chưa cập nhật"}</dd>
                </div>
              </div>

              <div className={styles.fact}>
                <FileText size={19} aria-hidden="true" />
                <div>
                  <dt>Mã số thuế</dt>
                  <dd>{company.taxCode || "Chưa cập nhật"}</dd>
                </div>
              </div>

              <div className={styles.fact}>
                <Globe size={19} aria-hidden="true" />
                <div>
                  <dt>Trang web</dt>
                  <dd>
                    {website ? (
                      <a href={website} target="_blank" rel="noreferrer">
                        {new URL(website).hostname}
                      </a>
                    ) : (
                      "Chưa cập nhật"
                    )}
                  </dd>
                </div>
              </div>

              <div className={styles.fact}>
                <CalendarDays size={19} aria-hidden="true" />
                <div>
                  <dt>Cập nhật hồ sơ</dt>
                  <dd>{updatedLabel}</dd>
                </div>
              </div>
            </dl>
          </section>

          <section className={styles.section}>
            <h2 style={{ fontSize: "17px", fontWeight: 750, margin: "0 0 16px" }}>
              Địa chỉ công ty
            </h2>
            <div className={styles.fact}>
              <MapPin size={20} aria-hidden="true" />
              <span>{company.address || "Doanh nghiệp chưa cập nhật địa chỉ trụ sở."}</span>
            </div>
          </section>

          <div className={styles.sideHint}>
            <ShieldCheck size={23} aria-hidden="true" />
            <strong>Xây dựng thương hiệu tuyển dụng</strong>
            <p>
              Hồ sơ công ty hoàn thiện với đầy đủ thông tin và hình ảnh thực tế giúp tăng đến 85% tỷ lệ ứng tuyển của các ứng viên tiềm năng trên CareerHub.
            </p>
            {company.verificationStatus === "VERIFIED" ? (
              <Link
                className="btn btn-secondary"
                href={`/companies/${company.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: "16px", width: "100%", justifyContent: "center" }}
              >
                <Eye size={15} aria-hidden="true" />
                Xem trang công khai
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
