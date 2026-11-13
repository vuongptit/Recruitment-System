"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, RefreshCw, ArrowUpRight } from "lucide-react";
import { PageHeader, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { InterviewSummary } from "@/components/InterviewSummary";
import { confirmInterview, interviewScheduleError, listMyInterviews, type Interview } from "@/lib/interviewApi";
import { interviewActions, currentInterviews } from "@/lib/interviewWorkflow";
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
  async function confirm(iv: Interview) {
    if (locked.current) return;
    locked.current = true; setBusyId(iv.id); setActionError(""); setNotice("");
    try {
      const response = await confirmInterview(iv.id);
      setItems(old => old.map(item => item.id === iv.id ? { ...item, ...response.data } : item));
      setNotice("Bạn đã xác nhận tham gia. Việc đặt lịch phỏng vấn đã hoàn tất."); setNow(Date.now());
    } catch (cause) { setActionError(interviewScheduleError(cause)); }
    finally { locked.current = false; setBusyId(null); }
  }
  const current = currentInterviews(items);
  const visible = current.filter(iv => {
    const inactive = !!applicationStatuses[iv.applicationId] && applicationStatuses[iv.applicationId] !== "INTERVIEW";
    if (inactive) return view === "ALL" || view === "HISTORY";
    const historical = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(iv.status) || Date.parse(iv.scheduledEnd) < now;
    return view === "ALL" || (view === "HISTORY" ? historical : view === "ACTION" ? interviewActions(iv, now).confirm : !historical);
  });

  return <main className={styles.page}>
    <PageHeader eyebrow="ỨNG VIÊN · PHỎNG VẤN" title="Lịch phỏng vấn" description="Xem thời gian nhà tuyển dụng đã chọn và xác nhận tham gia." action={<button className="btn" type="button" disabled={loading || !!busyId} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>} />
    <div className={styles.intro}><CalendarCheck2 size={30} /><div><strong>Nhận lịch → Xác nhận tham gia</strong><p>Mỗi hồ sơ có một buổi phỏng vấn. Kiểm tra ngày giờ (GMT+7), hình thức và bấm xác nhận là xong.</p></div></div>
    <nav className={styles.tabs} aria-label="Lọc lịch phỏng vấn">{([["ALL", "Tất cả"], ["ACTION", "Cần xác nhận"], ["UPCOMING", "Sắp diễn ra"], ["HISTORY", "Lịch sử"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</nav>
    {notice ? <p className="notice notice-success" role="status">{notice}</p> : null}
    {actionError ? <div className="notice notice-danger" role="alert">{actionError} <button className="btn" type="button" onClick={refresh}>Tải trạng thái mới</button></div> : null}
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    {loading && !cursor ? <LoadingState label="Đang tải lịch phỏng vấn" /> : null}
    {!error && (!loading || cursor) ? <section className={styles.calendarList} aria-label="Danh sách lịch phỏng vấn">
      {visible.map(iv => {
        const inactive = !!applicationStatuses[iv.applicationId] && applicationStatuses[iv.applicationId] !== "INTERVIEW";
        const actions = interviewActions(iv, now);
        return <article className={styles.card} key={iv.id}>
          <h2 className={styles.sectionTitle}>{titles[iv.applicationId] || "Lời mời phỏng vấn"}</h2>
          <InterviewSummary interview={iv} now={now} inactive={inactive} />
          {inactive ? <p className="help">Đơn ứng tuyển: {applicationStatusLabel(applicationStatuses[iv.applicationId])}. Không tiếp tục xác nhận hoặc tham gia bằng lịch cũ.</p> : null}
          <div className={styles.actions}>
            {!inactive && actions.confirm ? <button className="btn btn-primary" type="button" disabled={!!busyId} onClick={() => void confirm(iv)}>{busyId === iv.id ? "Đang xác nhận…" : "Xác nhận tham gia"}</button> : null}
            {!inactive && actions.join && iv.status !== "SCHEDULED" ? <Link className="btn btn-primary" href={`/candidate/interviews/${iv.id}/room`}>Vào phòng phỏng vấn</Link> : null}
            <Link className="btn" href={`/candidate/applications/${iv.applicationId}`}>Xem đơn ứng tuyển <ArrowUpRight size={15} /></Link>
          </div>
        </article>;
      })}
      {visible.length === 0 ? <EmptyState title={items.length ? "Không có lịch trong nhóm này" : "Chưa có lịch phỏng vấn"} description={items.length ? "Chọn nhóm khác hoặc tải thêm lịch để kiểm tra." : "Lời mời do nhà tuyển dụng gửi sẽ xuất hiện tại đây."} /> : null}
      <p className="help">Đang hiển thị lịch hiện tại của {current.length} hồ sơ trong {items.length} bản ghi đã tải{nextCursor ? "; còn lịch ở trang tiếp theo" : ""}.</p>
    </section> : null}
    {loading && cursor ? <LoadingState label="Đang tải thêm lịch" /> : null}
    {!loading && !error && nextCursor ? <button className="btn" type="button" onClick={() => setCursor(nextCursor)}>Tải thêm lịch</button> : null}
  </main>;
}
