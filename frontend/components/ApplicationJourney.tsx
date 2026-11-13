import Link from "next/link";
import { Check, Circle, ArrowRight, CalendarDays, Mail } from "lucide-react";
import type { ApplicationStatus } from "@/lib/demoData";
import { applicationGuidance, applicationProgress, formatApplicationDate, type ApplicationTimelineEntry, type PipelineViewer } from "@/lib/applicationStateMachine";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import styles from "./ApplicationJourney.module.css";

export function ApplicationProgress({ status, timeline, compact = false }: {
  status: ApplicationStatus; timeline?: readonly ApplicationTimelineEntry[]; compact?: boolean;
}) {
  return <ol className={`${styles.steps} ${compact ? styles.compact : ""}`} aria-label="Tiến trình ứng tuyển">
    {applicationProgress(status, timeline).map((step, index) => <li key={step.status} className={styles[step.state]} aria-current={step.state === "current" ? "step" : undefined}>
      <span className={styles.marker} aria-hidden="true">{step.state === "passed" || step.state === "recorded" || (step.status === "HIRED" && step.state === "current") ? <Check size={14} /> : index + 1}</span>
      <span>{applicationStatusLabel(step.status)}<small>{step.state === "current" ? "Hiện tại" : step.state === "passed" ? "Đã qua bước" : step.state === "recorded" ? "Đã ghi nhận" : ""}</small></span>
    </li>)}
  </ol>;
}

export function ApplicationNextStep({ status, viewer, applicationId, offerId }: {
  status: ApplicationStatus; viewer: PipelineViewer; applicationId: string; offerId?: string | null;
}) {
  const portal = viewer === "CANDIDATE" ? "/candidate" : "/recruiter";
  return <div className={styles.next}>
    <div><strong>{status === "REJECTED" || status === "WITHDRAWN" || status === "HIRED" ? "Kết quả xét tuyển" : "Bước tiếp theo"}</strong><p>{applicationGuidance(status, viewer)}</p></div>
    {status === "INTERVIEW" ? <Link className="btn" href={viewer === "CANDIDATE" ? "/candidate/interviews" : `${portal}/applications/${applicationId}/interview`}><CalendarDays size={16} /> Xem lịch phỏng vấn</Link> : null}
    {offerId ? <Link className="btn" href={viewer === "CANDIDATE" ? `${portal}/offers/${offerId}` : `${portal}/applications/${applicationId}/offer`}><Mail size={16} /> {viewer === "CANDIDATE" && status === "OFFER" ? "Phản hồi thư mời" : "Xem thư mời"}</Link> : status === "OFFER" ? <p className="help">Chưa có liên kết thư mời. Hãy làm mới hồ sơ để kiểm tra.</p> : null}
  </div>;
}

export function ApplicationTimeline({ entries }: { entries?: readonly ApplicationTimelineEntry[] }) {
  const ordered = [...(entries ?? [])].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  return <section className="panel">
    <div className="section-head"><div><h2>Lịch sử tiến trình</h2><p className="help">Mới nhất trước · GMT+7 · Chỉ hiển thị cập nhật đã được ghi nhận.</p></div></div>
    {ordered.length ? <ol className={styles.timeline}>{ordered.map((entry, index) => <li key={`${entry.changedAt}-${index}`}>
      <Circle size={12} className={styles.eventDot} aria-hidden="true" />
      <div className={styles.eventHead}><strong>{entry.fromStatus ? <>{applicationStatusLabel(entry.fromStatus)} <ArrowRight size={13} aria-label="chuyển sang" /> </> : null}{applicationStatusLabel(entry.toStatus)}</strong><time dateTime={entry.changedAt}>{formatApplicationDate(entry.changedAt)}</time></div>
      {entry.note ? <p className={styles.note}>{entry.note}</p> : null}
    </li>)}</ol> : <p className="notice">Chưa có lịch sử chuyển bước được ghi nhận. Trạng thái hiện tại hiển thị ở trên.</p>}
  </section>;
}
