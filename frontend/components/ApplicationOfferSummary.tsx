"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  FileCheck,
  FileText,
  Info,
  MessageSquareQuote,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { getOffer, type Offer } from "@/lib/person2Api";
import { formatApplicationDate } from "@/lib/applicationStateMachine";
import { offerStatusLabel } from "@/lib/recruitmentLabels";
import { ErrorState, LoadingState, StatusBadge } from "./ui";
import styles from "./ApplicationOfferSummary.module.css";

export function ApplicationOfferSummary({
  offerId,
  applicationId,
  candidate = false,
}: {
  offerId: string;
  applicationId: string;
  candidate?: boolean;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getOffer(offerId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.data || response.data.applicationId !== applicationId) {
          throw new ApiClientError({ code: "INVALID_API_RESPONSE" });
        }
        setOffer(response.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toUserMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offerId, applicationId, reload]);

  if (loading) {
    return (
      <section className={styles.offerCard} aria-label="Thư mời của hồ sơ">
        <LoadingState label="Đang tải thông tin thư mời nhận việc" />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.offerCard} aria-label="Thư mời của hồ sơ">
        <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />
      </section>
    );
  }

  if (!offer) return null;

  const numericSalary = Number(offer.salary);
  const formattedSalary = Number.isFinite(numericSalary)
    ? `${numericSalary.toLocaleString("vi-VN")} VNĐ`
    : offer.salary;

  const formattedStartDate = offer.startDate
    ? offer.startDate.split("-").reverse().join("/")
    : "Thỏa thuận khi nhận việc";

  const isExpired = Date.parse(offer.expiresAt) <= Date.now() && offer.status === "PENDING_CANDIDATE_RESPONSE";
  const canRespond =
    offer.status === "PENDING_CANDIDATE_RESPONSE" &&
    !isExpired &&
    (!offer.applicationStatus || offer.applicationStatus === "OFFER");

  const statusTone =
    offer.status === "ACCEPTED"
      ? "success"
      : offer.status === "DECLINED"
        ? "danger"
        : isExpired || offer.status === "EXPIRED"
          ? "neutral"
          : "warning";

  const attachmentUrl =
    offer.fileUrl && /^https?:\/\//i.test(offer.fileUrl) ? offer.fileUrl : null;

  return (
    <section className={styles.offerCard} aria-label="Thư mời của hồ sơ">
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.iconBox}>
            <FileCheck size={26} strokeWidth={2.2} />
          </div>
          <div className={styles.headerInfo}>
            <h2>Thư mời nhận việc</h2>
            <div className={styles.jobBadge}>
              <Briefcase size={14} />
              <span>Vị trí đề nghị: <strong>{offer.jobTitle}</strong></span>
              {offer.candidateName ? (
                <>
                  <span>•</span>
                  <span>Ứng viên: <strong>{offer.candidateName}</strong></span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <StatusBadge tone={statusTone}>
            {offer.status === "ACCEPTED" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={14} />
                {candidate ? "Đã chấp nhận" : "Ứng viên đã chấp nhận"}
              </span>
            ) : offer.status === "DECLINED" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <XCircle size={14} />
                {candidate ? "Đã từ chối" : "Ứng viên đã từ chối"}
              </span>
            ) : isExpired || offer.status === "EXPIRED" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Clock size={14} />
                Đã hết hạn phản hồi
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Clock size={14} />
                {candidate ? "Chờ bạn phản hồi" : "Đang chờ ứng viên phản hồi"}
              </span>
            )}
          </StatusBadge>
        </div>
      </div>

      {/* Decision / Status Callout */}
      {offer.status === "ACCEPTED" ? (
        <div className={`${styles.statusBanner} ${styles.bannerAccepted}`}>
          <div className={styles.statusBannerIcon}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <strong>
              {candidate
                ? "Bạn đã chấp nhận thư mời nhận việc này!"
                : "Ứng viên đã chấp nhận thư mời nhận việc"}
            </strong>
            <p>
              {candidate
                ? "Chúc mừng bạn! Nhà tuyển dụng sẽ sớm liên hệ để hướng dẫn bạn hoàn tất các thủ tục nhận việc và chuẩn bị cho ngày làm việc đầu tiên."
                : "Ứng viên đã đồng ý với các điều kiện đãi ngộ và thời gian bắt đầu làm việc. Nhà tuyển dụng có thể chuyển trạng thái hồ sơ sang Đã nhận việc."}
            </p>
          </div>
        </div>
      ) : offer.status === "DECLINED" ? (
        <div className={`${styles.statusBanner} ${styles.bannerDeclined}`}>
          <div className={styles.statusBannerIcon}>
            <XCircle size={20} />
          </div>
          <div>
            <strong>
              {candidate
                ? "Bạn đã từ chối thư mời nhận việc này"
                : "Ứng viên đã từ chối thư mời nhận việc"}
            </strong>
            <p>
              {offer.responseNote
                ? `Lý do phản hồi: "${offer.responseNote}"`
                : candidate
                  ? "Bạn đã từ chối thư mời nhận việc cho vị trí này."
                  : "Ứng viên không cung cấp thêm lý do cụ thể."}
            </p>
          </div>
        </div>
      ) : isExpired || offer.status === "EXPIRED" ? (
        <div className={`${styles.statusBanner} ${styles.bannerExpired}`}>
          <div className={styles.statusBannerIcon}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <strong>Thư mời nhận việc đã hết hạn</strong>
            <p>
              Thời hạn phản hồi cho thư mời này đã kết thúc vào{" "}
              {formatApplicationDate(offer.expiresAt)}.
            </p>
          </div>
        </div>
      ) : (
        <div className={`${styles.statusBanner} ${styles.bannerPending}`}>
          <div className={styles.statusBannerIcon}>
            <Clock size={20} />
          </div>
          <div>
            <strong>
              {candidate
                ? "Thư mời đang chờ bạn xem xét và phản hồi"
                : "Thư mời đã được gửi và đang chờ ứng viên phản hồi"}
            </strong>
            <p>
              Hạn phản hồi: {formatApplicationDate(offer.expiresAt)} (GMT+7).
              {candidate
                ? " Vui lòng phản hồi trước khi hết thời hạn quy định."
                : " Vui lòng theo dõi hoặc liên hệ ứng viên nếu sắp hết hạn."}
            </p>
          </div>
        </div>
      )}

      {/* Key Terms Grid */}
      <div className={styles.grid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>
            <Coins size={16} />
            Mức lương đề nghị
          </span>
          <span className={`${styles.metricValue} ${styles.salaryHighlight}`}>
            {formattedSalary}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>
            <CalendarDays size={16} />
            Ngày bắt đầu dự kiến
          </span>
          <span className={styles.metricValue}>{formattedStartDate}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>
            <Clock size={16} />
            Hạn phản hồi (GMT+7)
          </span>
          <span className={styles.metricValue}>
            {formatApplicationDate(offer.expiresAt)}
          </span>
        </div>
      </div>

      {/* Recruiter's Note */}
      {offer.note ? (
        <div className={styles.noteCard}>
          <div className={styles.noteHeader}>
            <MessageSquareQuote size={17} />
            <span>Lời nhắn gửi kèm từ nhà tuyển dụng:</span>
          </div>
          <p className={styles.noteBody}>{offer.note}</p>
        </div>
      ) : null}

      {/* Attachment link if present */}
      {attachmentUrl ? (
        <div className={styles.attachmentCard}>
          <div className={styles.attachmentInfo}>
            <div className={styles.attachmentIcon}>
              <FileText size={20} />
            </div>
            <div className={styles.attachmentDetails}>
              <strong>Tệp thư mời nhận việc chính thức (PDF)</strong>
              <small>Nhà tuyển dụng đã đính kèm tài liệu chi tiết cho thư mời này.</small>
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
            Xem tệp đính kèm
          </a>
        </div>
      ) : null}

      {/* Candidate response note if present and not already displayed in banner */}
      {offer.responseNote && offer.status !== "DECLINED" ? (
        <div className={styles.noteCard}>
          <div className={styles.noteHeader}>
            <MessageSquareQuote size={17} />
            <span>Ghi chú phản hồi của ứng viên:</span>
          </div>
          <p className={styles.noteBody}>{offer.responseNote}</p>
        </div>
      ) : null}

      {/* Actions / Footer */}
      {candidate ? (
        <div className={styles.actionRow}>
          <Link
            className="btn btn-primary"
            href={`/candidate/offers/${offer.id}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <FileCheck size={16} />
            {canRespond ? "Mở thư mời và phản hồi ngay" : "Xem chi tiết thư mời"}
          </Link>
        </div>
      ) : (
        <div className={styles.footerNotice}>
          <Info size={16} />
          <span>
            Trạng thái thư mời tách biệt với bước xét tuyển hồ sơ. Khi ứng viên chấp nhận hoặc từ chối,
            nhà tuyển dụng có thể chuyển trạng thái hồ sơ tại trang chi tiết ứng viên.
          </span>
        </div>
      )}
    </section>
  );
}
