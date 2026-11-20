"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  FileCheck,
  FileText,
  HelpCircle,
  MessageSquareQuote,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { offerStatusLabel } from "@/lib/recruitmentLabels";
import { ApiClientError, toUserMessage } from "../../../../lib/apiClient";
import { offerResponseRecoveryView } from "../../../../lib/offerResponseRecovery";
import { getOffer, Offer, respondToApplicationOffer } from "../../../../lib/person2Api";
import styles from "./candidateOfferResponse.module.css";

type Phase = "ACCEPTED" | "DECLINED";

export default function CandidateOfferResponsePage({ params }: { params: { offerId: string } }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase | null>(null);
  const responseInFlight = useRef(false);
  const [confirmDecision, setConfirmDecision] = useState<Phase | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineReasonError, setDeclineReasonError] = useState("");
  const [responseError, setResponseError] = useState<unknown>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let running = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setResponseError(null);
    getOffer(params.offerId, controller.signal)
      .then((response) => {
        if (running) setOffer(response.data || null);
      })
      .catch((reason: unknown) => {
        if (running) setLoadError(toUserMessage(reason));
      })
      .finally(() => {
        if (running) setLoading(false);
      });
    return () => {
      running = false;
      controller.abort();
    };
  }, [params.offerId, reloadKey]);

  async function submit(decision: Phase, confirmed = false) {
    if (!offer || responseInFlight.current) return;
    const blockedCode =
      offer.status !== "PENDING_CANDIDATE_RESPONSE"
        ? "OFFER_ALREADY_RESPONDED"
        : offer.applicationStatus && offer.applicationStatus !== "OFFER"
          ? "APPLICATION_CHANGED_CONCURRENTLY"
          : !(Date.parse(offer.expiresAt) > Date.now())
            ? "OFFER_EXPIRED"
            : null;
    if (blockedCode) {
      setResponseError(new ApiClientError({ code: blockedCode, status: 409 }));
      setConfirmDecision(null);
      return;
    }
    const normalizedReason = declineReason.trim();
    if (decision === "DECLINED" && !normalizedReason) {
      setDeclineReasonError("Vui lòng nhập lý do từ chối thư mời nhận việc.");
      document.getElementById("offer-decline-reason")?.focus();
      return;
    }
    if (!confirmed) {
      setConfirmDecision(decision);
      return;
    }
    responseInFlight.current = true;
    setPhase(decision);
    setDeclineReasonError("");
    setResponseError(null);
    setSuccessMessage("");
    try {
      const response = await respondToApplicationOffer(params.offerId, {
        decision,
        declineReason: decision === "DECLINED" ? normalizedReason : undefined,
        offerVersion: offer.offerVersion,
        applicationVersion: offer.applicationVersion,
      });
      setOffer((current) =>
        current
          ? {
              ...current,
              status: response.data.status === "SENT" ? "PENDING_CANDIDATE_RESPONSE" : response.data.status,
              offerVersion: response.data.version,
              applicationVersion: response.data.applicationVersion,
              applicationStatus: response.data.applicationStatus,
              responseNote: response.data.responseNote,
            }
          : current
      );
      setSuccessMessage(
        decision === "ACCEPTED"
          ? "Bạn đã chấp nhận thư mời nhận việc thành công!"
          : "Bạn đã từ chối thư mời nhận việc."
      );
      setShowDeclineForm(false);
    } catch (reason: unknown) {
      setResponseError(reason);
    } finally {
      responseInFlight.current = false;
      setPhase(null);
      setConfirmDecision(null);
    }
  }

  if (loading) {
    return (
      <main>
        <LoadingState label="Đang tải thư mời nhận việc" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main>
        <ErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} />
      </main>
    );
  }

  if (!offer) {
    return (
      <main>
        <div className="empty-state">
          <h3>Không tìm thấy thư mời nhận việc</h3>
          <p>Thư mời nhận việc này không tồn tại hoặc bạn không có quyền truy cập.</p>
          <Link className="btn btn-primary" href="/candidate/applications">
            Về hồ sơ ứng tuyển
          </Link>
        </div>
      </main>
    );
  }

  const recoveryView = offerResponseRecoveryView(responseError);
  const isExpired = Date.parse(offer.expiresAt) <= Date.now() && offer.status === "PENDING_CANDIDATE_RESPONSE";
  const canRespond =
    offer.status === "PENDING_CANDIDATE_RESPONSE" &&
    !isExpired &&
    (!offer.applicationStatus || offer.applicationStatus === "OFFER") &&
    recoveryView === null;

  const numericSalary = Number(offer.salary);
  const formattedSalary = Number.isFinite(numericSalary)
    ? `${numericSalary.toLocaleString("vi-VN")} VNĐ`
    : offer.salary;

  const formattedStartDate = offer.startDate
    ? offer.startDate.split("-").reverse().join("/")
    : "Thỏa thuận khi nhận việc";

  const formattedExpiresAt = new Date(offer.expiresAt).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });

  const attachmentUrl =
    offer.fileUrl && /^https?:\/\//i.test(offer.fileUrl) ? offer.fileUrl : null;

  const statusTone =
    offer.status === "ACCEPTED"
      ? "success"
      : offer.status === "DECLINED"
        ? "danger"
        : isExpired || offer.status === "EXPIRED"
          ? "neutral"
          : "warning";

  return (
    <main>
      <PageHeader
        eyebrow="THƯ MỜI NHẬN VIỆC"
        title="Phản hồi thư mời nhận việc"
        description="Xem xét thông tin đãi ngộ, ngày bắt đầu và đưa ra quyết định nhận việc."
        action={
          <Link
            className="btn btn-secondary"
            href={`/candidate/applications/${offer.applicationId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <ArrowLeft size={16} />
            Về hồ sơ ứng tuyển
          </Link>
        }
      />

      <ConfirmationDialog
        open={confirmDecision !== null}
        title={
          confirmDecision === "ACCEPTED"
            ? "Xác nhận chấp nhận thư mời nhận việc?"
            : "Xác nhận từ chối thư mời nhận việc?"
        }
        description={
          confirmDecision === "ACCEPTED"
            ? `Bạn xác nhận chấp thuận vị trí “${offer.jobTitle}” với mức đãi ngộ ${formattedSalary}. Quyết định này sẽ được gửi ngay tới nhà tuyển dụng.`
            : `Quyết định từ chối vị trí “${offer.jobTitle}” sẽ được gửi tới nhà tuyển dụng và kết thúc quá trình ứng tuyển cho vị trí này.`
        }
        confirmLabel={
          confirmDecision === "ACCEPTED"
            ? "Đồng ý nhận việc"
            : "Xác nhận từ chối"
        }
        pending={phase !== null}
        onConfirm={() => {
          if (confirmDecision) void submit(confirmDecision, true);
        }}
        onCancel={() => setConfirmDecision(null)}
      />

      <div className={styles.offerContainer}>
        {/* Main Offer Document */}
        <div className={styles.offerDocument}>
          {/* Header of the Offer Document */}
          <div className={styles.docHeader}>
            <div className={styles.docHeaderLeft}>
              <div className={styles.docIconBox}>
                <FileCheck size={28} strokeWidth={2.2} />
              </div>
              <div className={styles.docTitles}>
                <h2>Thư mời nhận việc</h2>
                <p>
                  Vị trí công việc: <strong>{offer.jobTitle}</strong>
                </p>
              </div>
            </div>

            <div>
              <StatusBadge tone={statusTone}>
                {offer.status === "ACCEPTED" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={14} />
                    Đã chấp nhận
                  </span>
                ) : offer.status === "DECLINED" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <XCircle size={14} />
                    Đã từ chối
                  </span>
                ) : isExpired || offer.status === "EXPIRED" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Clock size={14} />
                    Đã hết hạn
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Clock size={14} />
                    Chờ bạn phản hồi
                  </span>
                )}
              </StatusBadge>
            </div>
          </div>

          {/* Status Result Banners */}
          {offer.status === "ACCEPTED" ? (
            <div className={`${styles.resultBanner} ${styles.bannerSuccess}`}>
              <div className={styles.bannerIcon}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <strong>Chúc mừng bạn đã chấp nhận thư mời nhận việc!</strong>
                <p>
                  Phản hồi chấp thuận đã được ghi nhận thành công. Nhà tuyển dụng sẽ sớm liên hệ với bạn
                  để hoàn tất thủ tục ký hợp đồng và chuẩn bị ngày làm việc đầu tiên.
                </p>
              </div>
            </div>
          ) : offer.status === "DECLINED" ? (
            <div className={`${styles.resultBanner} ${styles.bannerDanger}`}>
              <div className={styles.bannerIcon}>
                <XCircle size={22} />
              </div>
              <div>
                <strong>Bạn đã từ chối thư mời nhận việc này</strong>
                <p>
                  {offer.responseNote
                    ? `Lý do đã gửi: "${offer.responseNote}"`
                    : "Bạn đã từ chối lời mời nhận việc cho vị trí này."}
                </p>
              </div>
            </div>
          ) : isExpired || offer.status === "EXPIRED" ? (
            <div className={`${styles.resultBanner} ${styles.bannerWarning}`}>
              <div className={styles.bannerIcon}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <strong>Thư mời nhận việc đã hết thời hạn phản hồi</strong>
                <p>
                  Hạn phản hồi cho thư mời này đã kết thúc vào lúc {formattedExpiresAt} (GMT+7). Nếu bạn vẫn
                  mong muốn làm việc tại vị trí này, vui lòng liên hệ trực tiếp với nhà tuyển dụng.
                </p>
              </div>
            </div>
          ) : null}

          {/* Key Offer Terms Grid */}
          <h3 className={styles.sectionTitle}>Chế độ đãi ngộ & thời gian làm việc</h3>
          <div className={styles.termsGrid}>
            <div className={styles.termCard}>
              <span className={styles.termLabel}>
                <Coins size={16} />
                Mức lương đề nghị
              </span>
              <span className={`${styles.termValue} ${styles.salaryValue}`}>
                {formattedSalary}
              </span>
            </div>

            <div className={styles.termCard}>
              <span className={styles.termLabel}>
                <CalendarDays size={16} />
                Ngày bắt đầu làm việc
              </span>
              <span className={styles.termValue}>{formattedStartDate}</span>
            </div>

            <div className={styles.termCard}>
              <span className={styles.termLabel}>
                <Clock size={16} />
                Hạn chót phản hồi (GMT+7)
              </span>
              <span className={styles.termValue}>{formattedExpiresAt}</span>
            </div>

            <div className={styles.termCard}>
              <span className={styles.termLabel}>
                <Briefcase size={16} />
                Vị trí công tác
              </span>
              <span className={styles.termValue}>{offer.jobTitle}</span>
            </div>
          </div>

          {/* Recruiter Note / Letter Message */}
          {offer.note ? (
            <div className={styles.noteBox}>
              <div className={styles.noteHeader}>
                <MessageSquareQuote size={18} />
                <span>Lời nhắn từ Nhà tuyển dụng:</span>
              </div>
              <p className={styles.noteContent}>{offer.note}</p>
            </div>
          ) : null}

          {/* Attached Document Card */}
          {attachmentUrl ? (
            <div className={styles.attachmentCard}>
              <div className={styles.attachmentLeft}>
                <div className={styles.attachmentIcon}>
                  <FileText size={22} />
                </div>
                <div className={styles.attachmentText}>
                  <strong>Tệp thư mời nhận việc chính thức (PDF)</strong>
                  <small>Xem và tải tài liệu hợp đồng / thư mời đính kèm từ nhà tuyển dụng.</small>
                </div>
              </div>
              <a
                className="btn btn-secondary"
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <ExternalLink size={15} />
                Mở tệp đính kèm
              </a>
            </div>
          ) : null}

          {/* Candidate Decision Area */}
          {canRespond ? (
            <div className={styles.decisionArea}>
              <div className={styles.decisionHeader}>
                <h3>Quyết định của bạn</h3>
                <p>
                  Vui lòng chọn chấp thuận hoặc từ chối thư mời trước {formattedExpiresAt}. Quyết định của bạn sẽ
                  được thông báo ngay tới nhà tuyển dụng.
                </p>
              </div>

              <div className={styles.buttonRow}>
                <button
                  className="btn btn-primary btn-large"
                  type="button"
                  disabled={phase !== null}
                  aria-busy={phase === "ACCEPTED"}
                  onClick={() => {
                    void submit("ACCEPTED");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <CheckCircle2 size={18} />
                  {phase === "ACCEPTED" ? "Đang xử lý…" : "Chấp nhận thư mời"}
                </button>

                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={phase !== null}
                  onClick={() => {
                    setShowDeclineForm((prev) => !prev);
                    setDeclineReasonError("");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <XCircle size={18} />
                  {showDeclineForm ? "Đóng lý do từ chối" : "Từ chối thư mời"}
                </button>
              </div>

              {showDeclineForm ? (
                <div className={styles.declineCollapse}>
                  <div className="field">
                    <label className="label" htmlFor="offer-decline-reason">
                      Lý do từ chối <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <textarea
                      id="offer-decline-reason"
                      className="textarea resize-none"
                      maxLength={2000}
                      rows={3}
                      placeholder="Vui lòng chia sẻ lý do bạn từ chối thư mời để nhà tuyển dụng nắm được thông tin..."
                      value={declineReason}
                      aria-describedby={
                        declineReasonError ? "offer-decline-error" : "offer-decline-help"
                      }
                      onChange={(event) => {
                        setDeclineReason(event.target.value);
                        setDeclineReasonError("");
                      }}
                    />
                    {declineReasonError ? (
                      <span id="offer-decline-error" className="form-error">
                        {declineReasonError}
                      </span>
                    ) : (
                      <span id="offer-decline-help" className="help">
                        Bắt buộc khi từ chối, tối đa 2.000 ký tự.
                      </span>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={phase !== null || !declineReason.trim()}
                        aria-busy={phase === "DECLINED"}
                        onClick={() => {
                          void submit("DECLINED");
                        }}
                      >
                        {phase === "DECLINED" ? "Đang từ chối…" : "Xác nhận gửi từ chối"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : !offer.status || (offer.status !== "ACCEPTED" && offer.status !== "DECLINED" && !isExpired) ? (
            <p className="notice" style={{ marginTop: 16 }}>
              Thư mời nhận việc đã kết thúc hoặc cần được tải lại trước khi phản hồi.
            </p>
          ) : null}

          {successMessage ? (
            <p className="notice notice-success" role="status" style={{ marginTop: 16 }}>
              {successMessage}
            </p>
          ) : null}

          {responseError && recoveryView ? (
            <section className="notice notice-warning" role="alert" style={{ marginTop: 16 }}>
              <strong>{recoveryView.title}</strong>
              <p>{recoveryView.description}</p>
              {recoveryView.action.kind === "LINK" ? (
                <Link className="btn btn-secondary" href={recoveryView.action.href}>
                  {recoveryView.action.label}
                </Link>
              ) : (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  {recoveryView.action.label}
                </button>
              )}
            </section>
          ) : null}

          {responseError && !recoveryView ? (
            <div style={{ marginTop: 16 }}>
              <ErrorState message={toUserMessage(responseError)} />
            </div>
          ) : null}
        </div>

        {/* Sidebar: Next steps and useful actions */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <h3 className={styles.sidebarTitle}>
              <CheckCircle2 size={18} />
              Lộ trình nhận việc
            </h3>

            <ul className={styles.stepList}>
              <li className={styles.stepItem}>
                <div
                  className={`${styles.stepMarker} ${
                    offer.status === "ACCEPTED" || offer.status === "DECLINED"
                      ? styles.stepMarkerDone
                      : ""
                  }`}
                >
                  1
                </div>
                <div className={styles.stepContent}>
                  <strong>Xem xét điều khoản</strong>
                  <p>Kiểm tra mức lương đề nghị, ngày bắt đầu dự kiến và các điều kiện làm việc.</p>
                </div>
              </li>

              <li className={styles.stepItem}>
                <div
                  className={`${styles.stepMarker} ${
                    offer.status === "ACCEPTED" || offer.status === "DECLINED"
                      ? styles.stepMarkerDone
                      : ""
                  }`}
                >
                  2
                </div>
                <div className={styles.stepContent}>
                  <strong>Phản hồi quyết định</strong>
                  <p>
                    {offer.status === "ACCEPTED"
                      ? "Bạn đã đồng ý nhận việc thành công."
                      : offer.status === "DECLINED"
                        ? "Bạn đã gửi phản hồi từ chối."
                        : `Gửi phản hồi trước ${formattedExpiresAt}.`}
                  </p>
                </div>
              </li>

              <li className={styles.stepItem}>
                <div className={styles.stepMarker}>3</div>
                <div className={styles.stepContent}>
                  <strong>Thủ tục Onboarding</strong>
                  <p>
                    {offer.status === "ACCEPTED"
                      ? `Chuẩn bị hồ sơ để bắt đầu công việc vào ${formattedStartDate}.`
                      : "Hoàn tất hồ sơ nhân sự và ký kết hợp đồng lao động chính thức."}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className={styles.sidebarCard}>
            <h3 className={styles.sidebarTitle}>Thao tác nhanh</h3>
            <div className={styles.quickActions}>
              <Link
                className={styles.quickActionBtn}
                href={`/candidate/applications/${offer.applicationId}`}
              >
                <span>
                  <FileText size={16} />
                  Xem hồ sơ ứng tuyển
                </span>
                <ChevronRight size={16} />
              </Link>

              <Link className={styles.quickActionBtn} href="/candidate/jobs">
                <span>
                  <Briefcase size={16} />
                  Khám phá việc làm mới
                </span>
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>

          <div className={styles.helpTip}>
            <HelpCircle size={18} />
            <span>
              Nếu bạn cần thương lượng thêm về điều khoản lương hoặc ngày bắt đầu làm việc, hãy liên hệ
              với nhà tuyển dụng trước khi đưa ra quyết định cuối cùng.
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
