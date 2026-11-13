"use client";

import Link from "next/link";
import { CalendarCheck2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { InterviewSummary } from "@/components/InterviewSummary";
import { PageHeader, ErrorState, LoadingState } from "@/components/ui";
import { getApplicationDetail, type CandidateApplication } from "@/lib/person2Api";
import { toUserMessage } from "@/lib/apiClient";
import { interviewActions, currentInterview } from "@/lib/interviewWorkflow";
import { interviewStartGmt7, interviewScheduleError, interviewModeLabel, listApplicationInterviews, rescheduleInterviewByRecruiter, scheduleInterview, type Interview, type InterviewMode, type ScheduleInterview } from "@/lib/interviewApi";
import styles from "@/components/InterviewWorkspace.module.css";

export default function ScheduleInterviewPage({ params }: { params: { applicationId: string } }) {
  const [application, setApplication] = useState<CandidateApplication | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [mode, setMode] = useState<InterviewMode>("ONLINE");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState(45);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const locked = useRef(false);
  const identity = useRef<{ fingerprint: string; id: string } | null>(null);
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    Promise.all([getApplicationDetail(params.applicationId, controller.signal), listApplicationInterviews(params.applicationId, null, controller.signal)])
      .then(([app, list]) => {
        if (controller.signal.aborted) return;
        setApplication(app.data); setInterviews(list.data.items); setNextCursor(list.data.nextCursor); setEditing(null);
      }).catch(cause => { if (!controller.signal.aborted) setLoadError(toUserMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params.applicationId, reload]);
  useEffect(() => {
    if (!editing) return;
    editorRef.current?.scrollIntoView({ block: "start" });
    editorRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [editing]);

  const current = currentInterview(interviews);
  const eligible = application?.status === "INTERVIEW";
  const canCreate = eligible && !nextCursor && (!current || interviews.every(iv => iv.status === "CANCELLED"));
  const showForm = canCreate || !!editing;
  function edit(iv: Interview) {
    setStart(new Date(Date.parse(iv.scheduledStart) + 7 * 3600000).toISOString().slice(0, 16));
    setDuration(iv.durationMinutes); setMode(iv.mode); setLocation(iv.location ?? ""); setNotes(iv.notes ?? "");
    setEditing(iv); setError(""); setNotice(""); identity.current = null;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !eligible || (!canCreate && !editing)) return;
    setError(""); setNotice("");
    try {
      const scheduledStart = interviewStartGmt7(start);
      const delta = Date.parse(scheduledStart) - Date.now();
      if (delta <= 0 || delta > 365 * 24 * 3600_000) throw new Error("Chọn ngày giờ trong tương lai, không quá 365 ngày.");
      if (mode === "OFFLINE" && !location.trim()) throw new Error("Nhập địa điểm phỏng vấn trực tiếp.");
      if (/[\u0000-\u001f\u007f-\u009f]/.test(location + notes)) throw new Error("Địa điểm và lời nhắn cần viết trên một dòng.");
      const payload: Omit<ScheduleInterview, "requestId"> = { applicationId: params.applicationId, roundNumber: 1, scheduledStart, timeZone: "Asia/Ho_Chi_Minh", durationMinutes: duration, mode, location: mode === "OFFLINE" ? location.trim() : null, notes: notes.trim() || null };
      const fingerprint = JSON.stringify({ editingId: editing?.id ?? null, ...payload });
      if (identity.current?.fingerprint !== fingerprint) identity.current = {fingerprint, id: crypto.randomUUID()};
      locked.current = true; setPending(true);
      const response = editing
        ? await rescheduleInterviewByRecruiter(editing.id, { ...payload, requestId: identity.current.id, reason: "Nhà tuyển dụng cập nhật lịch phỏng vấn" })
        : await scheduleInterview({ ...payload, requestId: identity.current.id });
      setInterviews(previous => [...previous.map(iv => editing?.id === iv.id ? { ...iv, status: "CANCELLED" } : iv).filter(iv => iv.id !== response.data.id), response.data]);
      setEditing(null); identity.current = null; setNow(Date.now());
      setNotice("Đã gửi lịch phỏng vấn. Đang chờ ứng viên xác nhận.");
    } catch (cause) { setError(interviewScheduleError(cause)); }
    finally { locked.current = false; setPending(false); }
  }
  async function loadMore() {
    if (!nextCursor || locked.current) return;
    locked.current = true; setPending(true); setError("");
    try {
      const response = await listApplicationInterviews(params.applicationId, nextCursor);
      setInterviews(previous => [...new Map([...previous, ...response.data.items].map(iv => [iv.id, iv])).values()]);
      setNextCursor(response.data.nextCursor);
    } catch (cause) { setError(toUserMessage(cause)); }
    finally { locked.current = false; setPending(false); }
  }

  if (loading) return <main><LoadingState label="Đang tải lịch phỏng vấn" /></main>;
  if (loadError || !application) return <main><ErrorState message={loadError || "Không tìm thấy hồ sơ."} onRetry={() => setReload(value => value + 1)} /></main>;
  const actions = current ? interviewActions(current, now) : null;
  const history = interviews.filter(iv => iv.id !== current?.id);
  return <main className={styles.page}>
    <PageHeader eyebrow="TUYỂN DỤNG · PHỎNG VẤN" title="Lịch phỏng vấn" description={application.jobTitle}
      action={<div className="btn-group"><button className="btn" type="button" disabled={pending} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /> Làm mới</button><Link className="btn" href={`/recruiter/applications/${params.applicationId}`}>Về hồ sơ</Link></div>} />
    <div className={styles.intro}><CalendarCheck2 size={28} /><div><strong>Một buổi phỏng vấn, một lịch hẹn</strong><p>Chọn một ngày giờ và gửi lịch. Ứng viên xác nhận tham gia là hoàn tất việc đặt lịch. Thời gian theo GMT+7.</p></div></div>
    {notice ? <p className="notice notice-success" role="status">{notice}</p> : null}
    {error ? <p className="notice notice-danger" role="alert">{error}</p> : null}
    <div className={showForm ? styles.workspace : styles.singleWorkspace}>
      <section className={styles.history} aria-label="Lịch phỏng vấn hiện tại">
        {current ? <article className={styles.card}><h2 className={styles.sectionTitle}>Lịch đã gửi</h2>
          <InterviewSummary interview={current} recruiter now={now} inactive={!eligible} />
          <div className={styles.actions}>
            {eligible && actions?.reschedule && !editing ? <button className="btn" type="button" disabled={pending} onClick={() => edit(current)}>Sửa lịch hẹn</button> : null}
            {eligible && actions?.join ? <Link className="btn btn-primary" href={`/recruiter/applications/${params.applicationId}/interview/room?interviewId=${current.id}`}>Vào phòng phỏng vấn</Link> : null}
            <Link className="btn" href={`/recruiter/applications/${params.applicationId}`}>Xem hồ sơ ứng tuyển</Link>
          </div>
        </article> : <section className={styles.card}><CalendarCheck2 size={32} /><h2 className={styles.sectionTitle}>Chưa có lịch phỏng vấn</h2><p className={styles.copy}>Điền thời gian và thông tin buổi hẹn để gửi cho ứng viên. Mỗi hồ sơ chỉ có một vòng phỏng vấn.</p></section>}
        {!eligible ? <p className={styles.guidance}>Hồ sơ hiện không ở bước Phỏng vấn. Bạn có thể xem lịch đã lưu, nhưng không thể gửi hoặc sửa lịch.</p> : null}
        {history.length ? <details className={styles.card}><summary>Lịch sử thay đổi ({history.length})</summary><div className={styles.history}>{history.map(iv => <article className={styles.archived} key={iv.id}><InterviewSummary interview={iv} recruiter now={now} inactive={!eligible} /></article>)}</div></details> : null}
        {nextCursor ? <button className="btn" type="button" disabled={pending} onClick={() => void loadMore()}>Tải thêm lịch sử</button> : null}
      </section>
      {showForm ? <aside className={styles.editor} ref={editorRef}><form onSubmit={submit}>
        <h2>{editing ? "Cập nhật lịch hẹn" : "Chọn lịch phỏng vấn"}</h2>
        <p className="help">{editing ? "Ứng viên sẽ xác nhận lại thời gian sau khi bạn lưu thay đổi." : "Chỉ cần chọn một khung giờ phù hợp để gửi lời mời."}</p>
        <label className="field">Ngày giờ phỏng vấn (GMT+7)<input className="input" type="datetime-local" required value={start} disabled={pending} onChange={event => setStart(event.target.value)} /></label>
        <label className="field">Thời lượng<select className="select" value={duration} disabled={pending} onChange={event => setDuration(Number(event.target.value))}>{[30, 45, 60].map(value => <option key={value} value={value}>{value} phút</option>)}</select></label>
        <label className="field">Hình thức phỏng vấn<select className="select" value={mode} disabled={pending} onChange={event => setMode(event.target.value as InterviewMode)}>{(["ONLINE", "OFFLINE"] as const).map(value => <option key={value} value={value}>{interviewModeLabel(value)}</option>)}</select></label>
        {mode === "OFFLINE" ? <label className="field">Địa điểm phỏng vấn<input className="input" required maxLength={500} value={location} disabled={pending} onChange={event => setLocation(event.target.value)} /></label> : <p className="help">Phòng phỏng vấn trực tuyến mở trước giờ hẹn 15 phút.</p>}
        <label className="field">Lời nhắn cho ứng viên (tùy chọn)<input className="input" maxLength={2000} value={notes} disabled={pending} onChange={event => setNotes(event.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Đang gửi…" : editing ? "Lưu và gửi lại lịch" : "Gửi lịch phỏng vấn"}</button>
        {editing ? <button className="btn" type="button" disabled={pending} onClick={() => { setEditing(null); setError(""); }}>Hủy chỉnh sửa</button> : null}
      </form></aside> : null}
    </div>
  </main>;
}
