"use client";
import { ArrowLeft } from "lucide-react";
import { FilePicker } from "@/components/FilePicker";

import { applicationStatusLabel } from "@/lib/recruitmentLabels";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { ApiClientError, toUserMessage } from "../../../../../lib/apiClient";
import {
  OFFER_ATTACHMENT_SUPPORT,
  ConfirmedOfferAttachment,
  uploadOfferAttachment,
  validateOfferAttachmentFile,
} from "../../../../../lib/offerAttachment";
import { getApplicationDetail, sendApplicationOffer, type CandidateApplication } from "../../../../../lib/person2Api";
import { ApplicationOfferSummary } from "@/components/ApplicationOfferSummary";
import { ApplicationProgress } from "@/components/ApplicationJourney";
import { UploadProgress } from "@/components/UploadProgress";
import type { UploadStep } from "@/lib/signedFileUpload";

// Exact 409 codes POST /applications/:id/offer can return when the page is stale.
const OFFER_STALE_MESSAGES: Partial<Record<string, string>> = {
  APPLICATION_CHANGED_CONCURRENTLY: "Hồ sơ vừa thay đổi. Đã tải trạng thái mới và giữ bản thư mời nhận việc bạn nhập; hãy kiểm tra trước khi chủ động gửi lại.",
  APPLICATION_NOT_ELIGIBLE_FOR_OFFER: "Hồ sơ không còn ở bước phỏng vấn nên không thể gửi thư mời nhận việc. Đã tải trạng thái mới nhất.",
  OFFER_ALREADY_EXISTS: "Hồ sơ này đã có thư mời nhận việc (có thể do đồng nghiệp vừa gửi). Đã tải trạng thái mới nhất.",
};

function formatSalaryInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  try {
    return BigInt(digits).toLocaleString("vi-VN");
  } catch {
    return digits;
  }
}

export default function RecruiterSendOfferPage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = params.applicationId;
  const [application, setApplication] = useState<CandidateApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [position, setPosition] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null);
  const [formError, setFormError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    getApplicationDetail(applicationId, controller.signal)
      .then((response) => {
        if (active) {
          setApplication(response.data);
          setPosition(response.data.jobTitle);
        }
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) setLoadError(toUserMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [applicationId, reloadKey]);

  async function submit(event?: FormEvent<HTMLFormElement>, confirmed = false) {
    event?.preventDefault();
    if (!application || submitting || submitted) return;
    const rawSalary = salary.replace(/\D/g, "");
    const numericSalary = Number(rawSalary);
    if (application.status !== "INTERVIEW") {
      setFormError("Chỉ hồ sơ đang ở bước phỏng vấn mới có thể nhận thư mời.");
      return;
    }
    if (application.version === null) {
      setFormError("Thiếu phiên bản hồ sơ. Hãy tải lại trang.");
      return;
    }
    if (!Number.isFinite(numericSalary) || numericSalary <= 0 || !startDate || !position.trim() || !expiresAt) {
      setFormError("Nhập đủ mức lương, ngày bắt đầu, vị trí và hạn phản hồi hợp lệ.");
      return;
    }
    if (!/^\d{1,15}$/.test(rawSalary) || startDate < new Date().toISOString().slice(0, 10)) {
      setFormError("Mức lương không hợp lệ; ngày bắt đầu không được ở quá khứ.");
      document.getElementById("offer-salary")?.focus();
      return;
    }
    const expiresInstant = new Date(expiresAt);
    if (Number.isNaN(expiresInstant.getTime()) || expiresInstant.getTime() <= Date.now()) {
      setFormError("Hạn phản hồi phải ở tương lai.");
      return;
    }
    if (attachmentFile) {
      try {
        validateOfferAttachmentFile(attachmentFile);
      } catch (fileErr) {
        setFormError(fileErr instanceof Error ? fileErr.message : "Tệp đính kèm không hợp lệ.");
        return;
      }
    }
    if (!confirmed) { setConfirmSend(true); return; }
    setSubmitting(true);
    setFormError("");
    setSubmitError("");
    try {
      let confirmedAttachment: ConfirmedOfferAttachment | null = null;
      if (attachmentFile) {
        try {
          confirmedAttachment = await uploadOfferAttachment(attachmentFile, undefined, setUploadStep);
        } catch (uploadErr) {
          const msg = uploadErr instanceof ApiClientError ? toUserMessage(uploadErr) : uploadErr instanceof Error ? uploadErr.message : "Không thể tải lên tệp đính kèm.";
          setSubmitError(`Lỗi tải tệp thư mời: ${msg}`);
          setSubmitting(false);
          setConfirmSend(false);
          setUploadStep(null);
          return;
        }
      }

      const response = await sendApplicationOffer(application.id, {
        salary: numericSalary,
        startDate,
        position,
        note,
        fileId: confirmedAttachment?.fileId,
        fileUrl: confirmedAttachment?.fileUrl,
        expiresAt: expiresInstant.toISOString(),
        applicationVersion: application.version,
      });
      setApplication((current) => current ? { ...current, status: response.data.applicationStatus, version: response.data.applicationVersion, offerId: response.data.id } : current);
      setSubmitted(true);
    } catch (reason: unknown) {
      const staleMessage = reason instanceof ApiClientError ? OFFER_STALE_MESSAGES[reason.code] : undefined;
      if (staleMessage) {
        try {
          const latest = await getApplicationDetail(application.id);
          setApplication(latest.data);
          setSubmitError(staleMessage);
        } catch (reloadError: unknown) { setSubmitError(toUserMessage(reloadError)); }
      } else setSubmitError(toUserMessage(reason));
    } finally {
      setSubmitting(false);
      setConfirmSend(false);
      setUploadStep(null);
    }
  }

  if (loading) return <main><LoadingState label="Đang tải hồ sơ để soạn thư mời nhận việc" /></main>;
  if (loadError || !application) return <main><ErrorState message={loadError || "Không tìm thấy hồ sơ ứng tuyển."} onRetry={() => setReloadKey((value) => value + 1)} /></main>;
  if (application.offerId) return <main className="stack">
    <PageHeader
      eyebrow="THƯ MỜI NHẬN VIỆC"
      title={application.jobTitle}
      description={`Theo dõi điều kiện đề nghị cho ứng viên ${application.candidateName} và phản hồi.`}
      action={
        <Link
          className="btn btn-secondary"
          href={`/recruiter/applications/${application.id}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
        >
          <ArrowLeft size={16} />
          Về chi tiết hồ sơ
        </Link>
      }
    />
    <section className="panel"><ApplicationProgress status={application.status} timeline={application.timeline} /></section>
    <ApplicationOfferSummary offerId={application.offerId} applicationId={application.id} />
  </main>;

  return (
    <main>
      <ConfirmationDialog
        open={confirmSend}
        title="Gửi thư mời nhận việc cho ứng viên?"
        description={`Thư mời cho vị trí “${position}” với mức lương ${salary} VNĐ${attachmentFile ? ` kèm tệp đính kèm “${attachmentFile.name}”` : ""} sẽ được gửi và hồ sơ chuyển sang bước chờ phản hồi.`}
        confirmLabel="Gửi thư mời nhận việc"
        pending={submitting}
        onConfirm={() => { void submit(undefined, true); }}
        onCancel={() => setConfirmSend(false)}
      />
      <PageHeader eyebrow="THƯ MỜI NHẬN VIỆC" title="Soạn thư mời nhận việc" description="Gửi thư mời sau vòng phỏng vấn và chờ ứng viên phản hồi." action={<Link className="btn" href={`/recruiter/jobs/${application.jobId}`}>Về hồ sơ theo tin</Link>} />
      {submitted ? (
        <section className="panel">
          <EmptyState title="Đã gửi thư mời nhận việc" description="Hồ sơ đã chuyển sang bước chờ ứng viên phản hồi thư mời." />
          <div className="btn-group"><StatusBadge tone="success">Đang chờ phản hồi</StatusBadge><Link className="btn btn-primary" href={`/recruiter/jobs/${application.jobId}`}>Xem hồ sơ theo tin</Link></div>
        </section>
      ) : (
        <form className="panel form-stack" onSubmit={submit} noValidate>
          <div className="section-head row-between"><div><h2>{application.candidateName}</h2><p className="help">{application.jobTitle}</p></div><StatusBadge tone={application.status === "INTERVIEW" ? "success" : "warning"}>{applicationStatusLabel(application.status)}</StatusBadge></div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="offer-salary">Mức lương (VNĐ)</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="offer-salary"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Ví dụ: 30.000.000"
                  style={{ paddingRight: 56 }}
                  disabled={submitting}
                  value={salary}
                  onChange={(event) => setSalary(formatSalaryInput(event.target.value))}
                />
                <span style={{ position: "absolute", right: 14, color: "#6b7280", fontWeight: 600, pointerEvents: "none" }}>
                  VNĐ
                </span>
              </div>
            </div>
            <div className="field"><label className="label" htmlFor="offer-start-date">Ngày bắt đầu</label><input id="offer-start-date" className="input" type="date" disabled={submitting} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div className="field"><label className="label" htmlFor="offer-position">Vị trí</label><input id="offer-position" className="input" maxLength={200} disabled={submitting} value={position} onChange={(event) => setPosition(event.target.value)} /></div>
            <div className="field"><label className="label" htmlFor="offer-expires">Hạn phản hồi</label><input id="offer-expires" className="input" type="datetime-local" disabled={submitting} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
            <div className="field span-2"><label className="label" htmlFor="offer-note">Ghi chú</label><textarea id="offer-note" className="textarea resize-none" maxLength={2000} disabled={submitting} value={note} onChange={(event) => setNote(event.target.value)} /></div>
            <div className="field span-2">
              <label className="label" htmlFor="offer-file">Tệp thư mời nhận việc (tùy chọn)</label>
              <FilePicker
                id="offer-file"
                accept="application/pdf,.pdf,.doc,.docx"
                disabled={submitting}
                fileName={attachmentFile?.name}
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  if (selected) {
                    try {
                      validateOfferAttachmentFile(selected);
                      setAttachmentFile(selected);
                      setAttachmentError("");
                    } catch (err) {
                      setAttachmentFile(null);
                      setAttachmentError(err instanceof Error ? err.message : "Tệp không hợp lệ");
                      if (event.target) event.target.value = "";
                    }
                  } else {
                    setAttachmentFile(null);
                    setAttachmentError("");
                  }
                }}
              />
              {attachmentFile ? (
                <div className="row-between" style={{ marginTop: 8, alignItems: "center" }}>
                  <span className="help">
                    Đã chọn: <strong>{attachmentFile.name}</strong> ({(attachmentFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={submitting}
                    onClick={() => {
                      setAttachmentFile(null);
                      setAttachmentError("");
                      const el = document.getElementById("offer-file") as HTMLInputElement | null;
                      if (el) el.value = "";
                    }}
                  >
                    Xóa tệp đã chọn
                  </button>
                </div>
              ) : (
                <p className="help" style={{ marginTop: 6 }}>
                  {OFFER_ATTACHMENT_SUPPORT.description}
                </p>
              )}
              {attachmentError ? <p className="form-error" role="alert">{attachmentError}</p> : null}
              {uploadStep ? <UploadProgress step={uploadStep} /> : null}
            </div>
          </div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          {submitError ? <p className="notice notice-danger" role="alert"><strong>Chưa gửi được thư mời nhận việc.</strong> {submitError}</p> : null}
          <div className="btn-group"><button className="btn btn-primary" type="submit" disabled={submitting || application.status !== "INTERVIEW"} aria-busy={submitting}>{submitting ? "Đang gửi thư mời nhận việc…" : "Gửi thư mời nhận việc"}</button><Link className="btn" href={`/recruiter/jobs/${application.jobId}`}>Hủy</Link></div>
        </form>
      )}
    </main>
  );
}
