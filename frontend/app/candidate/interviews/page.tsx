"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarCheck2, RefreshCw, ArrowUpRight } from "lucide-react";
import { PageHeader, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { InterviewSummary } from "@/components/InterviewSummary";
import { InterviewActionDialog } from "@/components/InterviewActionDialog";
import { cancelInterview, confirmInterview, interviewScheduleError, interviewStartGmt7, listMyInterviews, requestRescheduleInterview, type Interview } from "@/lib/interviewApi";
import { interviewActions, validatePreferredSlots } from "@/lib/interviewWorkflow";
import { getApplications } from "@/lib/person2Api";
import { toUserMessage } from "@/lib/apiClient";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import styles from "@/components/InterviewWorkspace.module.css";

type View = "ALL" | "ACTION" | "UPCOMING" | "HISTORY";

export default function CandidateInterviewsPage() {
  const [items, setItems] = useState<Interview[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [applicationStatuses, setApplicationStatuses] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [view, setView] = useState<View>("ALL");
  const [dialog, setDialog] = useState<{ kind: "RESCHEDULE" | "CANCEL"; interview: Interview } | null>(null);
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState(["", "", ""]);
  const locked = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getApplications(undefined, controller.signal).then(response => {
      if (!controller.signal.aborted) {
        setTitles(Object.fromEntries(response.data.map(application => [application.id, application.jobTitle])));
        setApplicationStatuses(Object.fromEntries(response.data.map(application => [application.id, application.status])));
      }
    }).catch(() => { /* The calendar remains available if optional job labels cannot load. */ });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listMyInterviews(cursor, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setItems(old => cursor ? [...new Map([...old, ...response.data.items].map(iv => [iv.id, iv])).values()] : response.data.items);
      setNextCursor(response.data.nextCursor);
    }).catch(cause => { if (!controller.signal.aborted) setError(toUserMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, reload]);

  function refresh() { setCursor(null); setReload(value => value + 1); setNow(Date.now()); }
  function openDialog(kind: "RESCHEDULE" | "CANCEL", interview: Interview) {
    setDialog({ kind, interview }); setReason(""); setSlots(["", "", ""]); setActionError("");
  }
  async function run(id: string, operation: () => ReturnType<typeof confirmInterview>, message: string) {
    if (locked.current) return;
    locked.current = true; setBusyId(id); setActionError(""); setNotice("");
    try {
      const response = await operation();
      setItems(old => old.map(iv => iv.id === id ? { ...iv, ...response.data } : iv));
      setDialog(null); setNotice(message); setNow(Date.now());
    } catch (cause) { setActionError(interviewScheduleError(cause)); }
    finally { locked.current = false; setBusyId(null); }
  }
  function submitDialog(event: FormEvent) {
    event.preventDefault();
    if (!dialog || locked.current) return;
    try {
      if (!reason.trim()) throw new Error("Vui lòng nhập lý do.");
      if (dialog.kind === "CANCEL") {
        void run(dialog.interview.id, () => cancelInterview(dialog.interview.id, reason.trim()), "Đã hủy lịch phỏng vấn. Đơn ứng tuyển vẫn được giữ nguyên.");
      } else {
        const preferredSlots = slots.filter(Boolean).map(interviewStartGmt7);
        const issue = validatePreferredSlots(preferredSlots);
        if (issue) throw new Error(issue);
        void run(dialog.interview.id, () => requestRescheduleInterview(dialog.interview.id, { reason: reason.trim(), preferredSlots }), "Đã gửi yêu cầu dời lịch. Chờ nhà tuyển dụng gửi lịch mới để xác nhận lại.");
      }
    } catch (cause) { setActionError(interviewScheduleError(cause)); }
  }
  const visible = items.filter(iv => {
    const historical = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(iv.status) || Date.parse(iv.scheduledEnd) < now;
    return view === "ALL" || (view === "HISTORY" ? historical : view === "ACTION" ? interviewActions(iv, now).confirm : !historical);
  });

  return <main className={styles.page}>
    <PageHeader eyebrow="ỨNG VIÊN · PHỎNG VẤN" title="Lịch phỏng vấn" description="Mỗi lời mời, một lịch hẹn rõ ràng. Theo dõi phản hồi và chuẩn bị cho buổi trao đổi tiếp theo." action={<button className="btn" type="button" disabled={loading || !!busyId} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>} />
    <div className={styles.intro}><CalendarCheck2 size={30} /><div><strong>Kiểm tra lời mời và xác nhận tham gia</strong><p>Thời gian hiển thị theo GMT+7. Khi xin đổi giờ, bạn cần chờ lịch mới từ nhà tuyển dụng; lịch cũ chưa được xem là đã đổi thành công.</p></div></div>
    <nav className={styles.tabs} aria-label="Lọc lịch phỏng vấn">{([["ALL", "Tất cả"], ["ACTION", "Cần xác nhận"], ["UPCOMING", "Sắp diễn ra"], ["HISTORY", "Lịch sử"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</nav>
    {notice ? <p className="notice notice-success" role="status">{notice}</p> : null}
    {actionError && !dialog ? <div className="notice notice-danger" role="alert">{actionError} <button className="btn" type="button" onClick={refresh}>Tải trạng thái mới</button></div> : null}
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    {loading && !cursor ? <LoadingState label="Đang tải lịch phỏng vấn" /> : null}
    {!error && (!loading || cursor) ? <section className={styles.calendarList} aria-label="Danh sách lịch phỏng vấn">
      {visible.map(iv => {
        const inactive = !!applicationStatuses[iv.applicationId] && applicationStatuses[iv.applicationId] !== "INTERVIEW";
        const actions = inactive ? { confirm: false, requestReschedule: false, reschedule: false, cancel: interviewActions(iv, now).cancel, join: false, feedback: false } : interviewActions(iv, now);
        return <article className={styles.card} key={iv.id}>
          <h2 style={{ margin: 0, fontSize: 19 }}>{titles[iv.applicationId] || `Lời mời phỏng vấn vòng ${iv.roundNumber}`}</h2>
          <InterviewSummary interview={iv} now={now} inactive={inactive} />
          {inactive ? <p className="help">Đơn ứng tuyển: {applicationStatusLabel(applicationStatuses[iv.applicationId])}. Không tiếp tục xác nhận hoặc tham gia bằng lịch cũ.</p> : null}
          {iv.rescheduleReason ? <p className={styles.copy}><strong>Lý do xin dời:</strong> {iv.rescheduleReason}</p> : null}
          <div className={styles.actions}>
            {actions.confirm ? <button className="btn btn-primary" type="button" disabled={!!busyId} onClick={() => void run(iv.id, () => confirmInterview(iv.id), `Đã xác nhận tham gia phỏng vấn vòng ${iv.roundNumber}.`)}>{busyId === iv.id ? "Đang xác nhận…" : "Xác nhận tham gia"}</button> : null}
            {actions.join ? <Link className="btn btn-primary" href={`/candidate/interviews/${iv.id}/room`}>{iv.status === "SCHEDULED" ? "Xác nhận và vào phòng" : "Vào phòng phỏng vấn"}</Link> : null}
            {actions.requestReschedule ? <button className="btn" type="button" disabled={!!busyId} onClick={() => openDialog("RESCHEDULE", iv)}>Xin dời lịch</button> : null}
            {actions.cancel ? <button className="btn" type="button" disabled={!!busyId} onClick={() => openDialog("CANCEL", iv)}>Hủy lịch</button> : null}
            <Link className="btn" href={`/candidate/applications/${iv.applicationId}`}>Xem đơn ứng tuyển <ArrowUpRight size={15} /></Link>
          </div>
          {actions.requestReschedule && !actions.cancel ? <p className="help">Còn dưới 2 giờ nên không thể tự hủy. Hãy liên hệ nhà tuyển dụng nếu có việc đột xuất.</p> : null}
        </article>;
      })}
      {visible.length === 0 ? <EmptyState title={items.length ? "Không có lịch trong nhóm này" : "Chưa có lịch phỏng vấn"} description={items.length ? "Chọn nhóm khác hoặc tải thêm lịch để kiểm tra." : "Lời mời do nhà tuyển dụng gửi sẽ xuất hiện tại đây."} /> : null}
      <p className="help">Bộ lọc áp dụng trên {items.length} lịch đã tải{nextCursor ? "; còn lịch ở trang tiếp theo" : ""}.</p>
    </section> : null}
    {loading && cursor ? <LoadingState label="Đang tải thêm lịch" /> : null}
    {!loading && !error && nextCursor ? <button className="btn" type="button" onClick={() => setCursor(nextCursor)}>Tải thêm lịch</button> : null}
    {dialog ? <InterviewActionDialog title={`${dialog.kind === "CANCEL" ? "Hủy lịch" : "Xin dời lịch"} phỏng vấn vòng ${dialog.interview.roundNumber}`} pending={!!busyId} onClose={() => setDialog(null)}>
      <form onSubmit={submitDialog}>
        <p>{dialog.kind === "CANCEL" ? "Thao tác này chỉ hủy buổi hẹn, không rút đơn ứng tuyển. Chỉ có thể tự hủy trước giờ hẹn ít nhất 2 giờ." : "Đề xuất 2–3 khung giờ khác nhau trong tương lai (GMT+7). Nhà tuyển dụng sẽ kiểm tra và gửi lịch mới."}</p>
        <label className="field">{dialog.kind === "CANCEL" ? "Lý do hủy lịch" : "Lý do xin dời lịch"}<textarea className="textarea" required maxLength={500} value={reason} disabled={!!busyId} onChange={event => setReason(event.target.value)} /></label>
        {dialog.kind === "RESCHEDULE" ? slots.map((slot, index) => <label className="field" key={index}>Khung giờ đề xuất {index + 1} {index < 2 ? "(bắt buộc)" : "(tùy chọn)"}<input className="input" type="datetime-local" required={index < 2} disabled={!!busyId} value={slot} onChange={event => setSlots(old => old.map((value, current) => current === index ? event.target.value : value))} /></label>) : null}
        {actionError ? <p className="notice notice-danger" role="alert">{actionError}</p> : null}
        <div className="btn-group"><button className={dialog.kind === "CANCEL" ? "btn btn-danger" : "btn btn-primary"} type="submit" disabled={!!busyId}>{busyId ? "Đang gửi…" : dialog.kind === "CANCEL" ? "Xác nhận hủy lịch" : "Gửi yêu cầu dời lịch"}</button><button className="btn" type="button" disabled={!!busyId} onClick={() => setDialog(null)}>Đóng</button></div>
      </form>
    </InterviewActionDialog> : null}
  </main>;
}
