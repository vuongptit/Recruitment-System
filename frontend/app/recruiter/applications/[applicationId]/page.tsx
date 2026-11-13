"use client";

import { applicationStatusLabel } from "@/lib/recruitmentLabels";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PageHeader,
  StatusBadge,
  LoadingState,
  ErrorState,
} from "@/components/ui";
import { RecruiterCvAccess } from "@/components/RecruiterCvAccess";
import { RecruiterEvaluation } from "@/components/RecruiterEvaluation";
import { getApplicationDetail, type CandidateApplication } from "@/lib/person2Api";
import {
  interviewStatusLabel,
  listApplicationInterviews,
  type Interview,
} from "@/lib/interviewApi";
import { toUserMessage } from "@/lib/apiClient";
import { ApplicationNextStep, ApplicationProgress, ApplicationTimeline } from "@/components/ApplicationJourney";
import { ApplicationOfferSummary } from "@/components/ApplicationOfferSummary";

export default function RecruiterApplicationDetailPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const [application, setApplication] = useState<CandidateApplication | null>(
    null
  );
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [interviewError, setInterviewError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setInterviewError("");
    Promise.all([
      getApplicationDetail(params.applicationId, controller.signal),
      listApplicationInterviews(
        params.applicationId,
        null,
        controller.signal
      ).catch((reason: unknown) => {
        if (!controller.signal.aborted) setInterviewError(toUserMessage(reason));
        return { data: { items: [], nextCursor: null } };
      }),
    ])
      .then(([appRes, ivRes]) => {
        if (controller.signal.aborted) return;
        setApplication(appRes.data);
        setInterviews(ivRes.data.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(toUserMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.applicationId, reload]);

  if (loading) {
    return (
      <main>
        <LoadingState />
      </main>
    );
  }
  if (error || !application) {
    return (
      <main>
        <ErrorState
          message={error || "Không tìm thấy hồ sơ."}
          onRetry={() => setReload((v) => v + 1)}
        />
      </main>
    );
  }

  return (
    <main className="stack">
      <PageHeader
        eyebrow="CHI TIẾT HỒ SƠ"
        title={application.jobTitle}
        description="Xem hồ sơ, quản lý lịch phỏng vấn, đánh giá và liên hệ ứng viên trong cùng một nơi."
        action={
          <div className="btn-group">
            {application.status === "INTERVIEW" && (
              <Link
                className="btn btn-primary"
                href={`/recruiter/applications/${application.id}/interview`}
              >
                {interviews.length > 0
                  ? "Quản lý & Đặt lịch phỏng vấn"
                  : "Đặt lịch phỏng vấn"}
              </Link>
            )}
            {application.status === "INTERVIEW" && (
              <Link
                className="btn"
                href={`/recruiter/applications/${application.id}/offer`}
              >
                Tạo thư mời nhận việc
              </Link>
            )}
            <Link className="btn" href={`/recruiter/jobs/${application.jobId}`}>
              Hồ sơ theo tin
            </Link>
          </div>
        }
      />

      <section className="panel">
        <div className="section-head"><h2>Tiến trình ứng tuyển</h2><StatusBadge>{applicationStatusLabel(application.status)}</StatusBadge></div>
        <ApplicationProgress status={application.status} timeline={application.timeline} />
        <ApplicationNextStep status={application.status} viewer="RECRUITER" applicationId={application.id} offerId={application.offerId} />
        <Link className="btn" href="/recruiter/applications">Về danh sách và xử lý hồ sơ</Link>
      </section>
      {interviewError ? <ErrorState message={`Chưa tải được lịch phỏng vấn: ${interviewError}`} onRetry={() => setReload((value) => value + 1)} /> : null}

      {interviews.length > 0 && (
        <section className="card stack">
          <div className="section-head">
            <h2>Lịch phỏng vấn ({interviews.length})</h2>
            <Link
              className="btn btn-secondary"
              href={`/recruiter/applications/${application.id}/interview`}
            >
              Mở quản lý phỏng vấn & chấm điểm
            </Link>
          </div>
          {interviews.map((iv) => (
            <div
              key={iv.id}
              className="section-head"
              style={{
                paddingTop: 8,
                borderTop: "1px solid var(--border, #e2e8f0)",
              }}
            >
              <div>
                <strong>Vòng {iv.roundNumber}</strong> ·{" "}
                {new Date(iv.scheduledStart).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}{" "}
                (GMT+7) ·{" "}
                {iv.mode === "ONLINE"
                  ? "Trực tuyến (Video)"
                  : `Trực tiếp (${iv.location ?? ""})`}
              </div>
              <div className="btn-group">
                <StatusBadge
                  tone={
                    iv.status === "COMPLETED" || iv.status === "CONFIRMED"
                      ? "success"
                      : iv.status === "CANCELLED" || iv.status === "NO_SHOW"
                      ? "warning"
                      : "info"
                  }
                >
                  {interviewStatusLabel(iv.status)}
                </StatusBadge>
                {iv.mode === "ONLINE" &&
                  ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(
                    iv.status
                  ) && (
                    <Link
                      className="btn btn-primary"
                      href={`/recruiter/applications/${application.id}/interview/room?interviewId=${iv.id}`}
                    >
                      Vào phòng Video
                    </Link>
                  )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>Thông tin ứng tuyển</h2>
        <p>
          Nộp ngày{" "}
          {new Date(application.createdAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
        </p>
        {application.coverLetter && (
          <p style={{ whiteSpace: "pre-wrap" }}>{application.coverLetter}</p>
        )}
        <RecruiterCvAccess applicationId={application.id} />
        <RecruiterEvaluation applicationId={application.id} />
      </section>
      <ApplicationTimeline entries={application.timeline} />
      {application.offerId ? <ApplicationOfferSummary offerId={application.offerId} applicationId={application.id} /> : null}
    </main>
  );
}
