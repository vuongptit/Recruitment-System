"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  Hash,
  MessageSquareQuote,
  Quote,
  FileText,
  ShieldCheck,
  Eye,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { ApiClientError, toUserMessage } from "../../../../lib/apiClient";
import { getApplicationDetail, type CandidateApplication } from "../../../../lib/person2Api";
import { ApplicationNextStep, ApplicationProgress, ApplicationTimeline } from "@/components/ApplicationJourney";
import { formatApplicationDate } from "@/lib/applicationStateMachine";
import { ApplicationOfferSummary } from "@/components/ApplicationOfferSummary";
import styles from "./candidateApplicationDetail.module.css";

export default function CandidateApplicationDetailPage({ params }: { params: { applicationId: string } }) {
  const [application, setApplication] = useState<CandidateApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getApplicationDetail(params.applicationId, controller.signal)
      .then((response) => {
        if (active) setApplication(response.data);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) {
          setError(toUserMessage(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [params.applicationId, reloadKey]);

  if (loading) {
    return (
      <main>
        <LoadingState label="Đang tải hồ sơ ứng tuyển" />
      </main>
    );
  }

  if (error || !application) {
    return (
      <main>
        <ErrorState
          message={error || "Không tìm thấy hồ sơ ứng tuyển."}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
        <Link className="btn" href="/candidate/applications">
          Về hồ sơ ứng tuyển
        </Link>
      </main>
    );
  }

  const statusTone =
    application.status === "HIRED"
      ? "success"
      : application.status === "REJECTED" || application.status === "WITHDRAWN"
      ? "danger"
      : "info";

  return (
    <main>
      <PageHeader
        title={application.jobTitle}
        description="Theo dõi tiến trình và phản hồi từ nhà tuyển dụng."
        action={
          <Link className="btn" href="/candidate/applications">
            Về hồ sơ ứng tuyển
          </Link>
        }
      />

      <section className={`${styles.detailCard} panel`}>
        <div className={styles.panelHeader}>
          <div className={styles.titleRow}>
            <h2>Thông tin ứng tuyển</h2>
            <StatusBadge tone={statusTone}>
              {applicationStatusLabel(application.status)}
            </StatusBadge>
          </div>

          <div className={styles.metaChips}>
            <span className={styles.metaChip}>
              <Building2 size={15} />
              <strong>{application.companyName || "Doanh nghiệp tuyển dụng"}</strong>
            </span>
            <span className={styles.metaChip}>
              <CalendarDays size={15} />
              Nộp ngày{" "}
              <time dateTime={application.createdAt}>
                {formatApplicationDate(application.createdAt)}
              </time>{" "}
              · GMT+7
            </span>
            <span className={styles.metaChip}>
              <Hash size={14} />
              Mã đơn: <code>{application.id.slice(0, 8)}</code>
            </span>
          </div>
        </div>

        <div className={styles.progressSection}>
          <ApplicationProgress status={application.status} timeline={application.timeline} />
        </div>

        <div className={styles.sectionStack}>
          {/* Bước tiếp theo - Hướng dẫn ứng viên */}
          <ApplicationNextStep
            status={application.status}
            viewer="CANDIDATE"
            applicationId={application.id}
            offerId={application.offerId}
          />

          {/* Thư ứng tuyển */}
          <div className={styles.coverLetterCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderTitle}>
                <MessageSquareQuote size={18} className={styles.cardIcon} />
                <h3>Thư ứng tuyển</h3>
              </div>
              <span className={styles.cardBadge}>
                <FileText size={12} /> Kèm theo hồ sơ
              </span>
            </div>

            {application.coverLetter ? (
              <div className={styles.letterBody}>
                <Quote size={20} className={styles.quoteDecor} />
                <p className={styles.letterText}>{application.coverLetter}</p>
              </div>
            ) : (
              <div className={styles.emptyLetter}>
                <FileText size={16} />
                <span>Không đính kèm thư ứng tuyển riêng cho vị trí này.</span>
              </div>
            )}
          </div>

          {/* Thông tin chính sách hồ sơ */}
          <div className={styles.policyNotice}>
            <ShieldCheck size={20} className={styles.policyIcon} />
            <div className={styles.policyContent}>
              <strong>Lưu ý về đơn ứng tuyển đã nộp</strong>
              <p>Hồ sơ đã gửi không thể rút. Cập nhật hồ sơ cá nhân không thay đổi đơn ứng tuyển đã gửi.</p>
            </div>
          </div>

          {/* Thông tin vị trí & thao tác nhanh */}
          <div className={styles.jobActionCard}>
            <div className={styles.jobSummary}>
              <span className={styles.jobEyebrow}>Vị trí ứng tuyển</span>
              <h3 className={styles.jobTitle}>{application.jobTitle}</h3>
              <p className={styles.jobCompany}>
                <Building2 size={15} />
                {application.companyName || "Doanh nghiệp tuyển dụng"}
              </p>
            </div>
            <div className={styles.jobActions}>
              <Link className="btn btn-primary" href={`/candidate/jobs/${application.jobId}`}>
                <Eye size={15} /> Xem việc làm <ExternalLink size={13} />
              </Link>
              <Link className="btn" href="/candidate/applications">
                <ArrowLeft size={15} /> Danh sách đơn
              </Link>
            </div>
          </div>
        </div>
      </section>

      <ApplicationTimeline entries={application.timeline} />

      {application.offerId ? (
        <ApplicationOfferSummary
          offerId={application.offerId}
          applicationId={application.id}
          candidate
        />
      ) : null}
    </main>
  );
}
