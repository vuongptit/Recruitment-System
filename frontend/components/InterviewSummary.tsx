import { CalendarDays, Clock3, MapPin, Video, CheckCircle2 } from "lucide-react";
import { interviewModeLabel, interviewStatusLabel, type Interview } from "@/lib/interviewApi";
import { interviewDate, interviewGuidance } from "@/lib/interviewWorkflow";
import { StatusBadge } from "./ui";
import styles from "./InterviewWorkspace.module.css";

export function InterviewSummary({ interview, recruiter = false, now, inactive = false }: { interview: Interview; recruiter?: boolean; now?: number; inactive?: boolean }) {
  const iv = interview;
  return <>
    <div className={styles.cardHeading}><div><span className={styles.eyebrow}>LỊCH PHỎNG VẤN</span><h3>{interviewDate(iv.scheduledStart, "date")}</h3>{(iv.scheduleRevision ?? 1) > 1 ? <span className={styles.revision}>Lịch cập nhật lần {(iv.scheduleRevision ?? 1) - 1}{iv.status === "SCHEDULED" ? " · Cần xác nhận theo lịch mới" : ""}</span> : null}</div><StatusBadge tone={iv.status === "CONFIRMED" || iv.status === "COMPLETED" ? "success" : iv.status === "CANCELLED" || iv.status === "NO_SHOW" ? "neutral" : "warning"}>{interviewStatusLabel(iv.status)}</StatusBadge></div>
    <div className={styles.facts}>
      <span><Clock3 size={17} />{interviewDate(iv.scheduledStart, "time")} – {interviewDate(iv.scheduledEnd, "time")} · {iv.durationMinutes} phút</span>
      <span>{iv.mode === "ONLINE" ? <Video size={17} /> : <MapPin size={17} />}{interviewModeLabel(iv.mode)}</span>
      <span><CalendarDays size={17} />Giờ Việt Nam · GMT+7</span>
    </div>
    {iv.location ? <p className={styles.copy}><strong>Địa điểm:</strong> {iv.location}</p> : null}
    {iv.notes ? <p className={styles.copy}><strong>Lời nhắn:</strong> {iv.notes}</p> : null}
    <p className={styles.guidance}>{inactive ? "Đơn ứng tuyển đã ra khỏi vòng phỏng vấn. Lịch được giữ để đối chiếu; không dùng lịch cũ để xác nhận hoặc vào phòng." : interviewGuidance(iv, recruiter, now)}</p>
    {iv.status === "CONFIRMED" && iv.confirmedAt ? <p className={styles.confirmed}><CheckCircle2 size={15} />Xác nhận lúc {interviewDate(iv.confirmedAt)}</p> : null}
    {iv.cancelReason ? <p className={styles.copy}><strong>Lý do hủy:</strong> {iv.cancelReason}</p> : null}
  </>;
}
