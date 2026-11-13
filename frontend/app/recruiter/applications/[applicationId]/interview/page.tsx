"use client";

import Link from "next/link";
import { CalendarCheck2, Plus, RefreshCw } from "lucide-react";
import { InterviewSummary } from "@/components/InterviewSummary";
import { InterviewActionDialog } from "@/components/InterviewActionDialog";
import { interviewActions, interviewDate } from "@/lib/interviewWorkflow";
import styles from "@/components/InterviewWorkspace.module.css";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader, ErrorState, LoadingState } from "@/components/ui";
import { getApplicationDetail, type CandidateApplication } from "@/lib/person2Api";
import { toUserMessage } from "@/lib/apiClient";
import {
  cancelInterview,
  feedbackConclusionLabel,
  getInterviewAvailability,
  getInterviewFeedback,
  interviewStartGmt7,
  interviewScheduleError,
  interviewModeLabel,
  listApplicationInterviews,
  rescheduleInterviewByRecruiter,
  scheduleInterview,
  schedulingRequestIdentity,
  submitInterviewFeedback,
  type AvailabilitySlot,
  type FeedbackConclusion,
  type Interview,
  type InterviewFeedback,
  type InterviewMode,
  type ScheduleInterview,
} from "@/lib/interviewApi";

function toLocalInputValue(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 7 * 3600000).toISOString().slice(0, 16);
}

export default function ScheduleInterviewPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const [application, setApplication] = useState<CandidateApplication | null>(
    null
  );
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, InterviewFeedback>>(
    {}
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Interview | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [now, setNow] = useState(Date.now);
  const initialized = useRef(false);
  const editorRef = useRef<HTMLElement>(null);
  const availabilitySequence = useRef(0);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [created, setCreated] = useState<Interview | null>(null);

  // Schedule form state
  const [mode, setMode] = useState<InterviewMode>("ONLINE");
  const [start, setStart] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [round, setRound] = useState(1);
  const [duration, setDuration] = useState(45);

  // Availability slot picker state
  const [availDate, setAvailDate] = useState("");
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(
    null
  );
  const [reschedReason, setReschedReason] = useState("");
  const [reschedStart, setReschedStart] = useState("");
  const [reschedMode, setReschedMode] = useState<InterviewMode>("ONLINE");
  const [reschedLocation, setReschedLocation] = useState("");
  const [reschedDuration, setReschedDuration] = useState(45);

  // Feedback modal state
  const [feedbackTarget, setFeedbackTarget] = useState<Interview | null>(null);
  const [technical, setTechnical] = useState(8);
  const [communication, setCommunication] = useState(8);
  const [attitude, setAttitude] = useState(8);
  const [cultureFit, setCultureFit] = useState(8);
  const [fbComment, setFbComment] = useState("");
  const [fbConclusion, setFbConclusion] = useState<FeedbackConclusion | "">("");

  const rescheduleIdentity = useRef<{ fingerprint: string; id: string } | null>(null);
  const requestIdentity = useRef<{ fingerprint: string; id: string } | null>(
    null
  );
  const submitLock = useRef(false);

  useEffect(() => {
    if (!rescheduleTarget && !feedbackTarget && !(createOpen && initialized.current && interviews.length > 0)) return;
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      editor?.scrollIntoView({ block: "start", behavior: "auto" });
      editor?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
    // Move to a form only when the user selects a different editing task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleTarget?.id, feedbackTarget?.id, createOpen]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    availabilitySequence.current += 1;
    setAvailSlots([]); setAvailabilityChecked(false); setLoadingSlots(false);
  }, [availDate, duration]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    Promise.all([
      getApplicationDetail(params.applicationId, controller.signal),
      listApplicationInterviews(params.applicationId, null, controller.signal),
    ])
      .then(async ([appRes, ivRes]) => {
        if (controller.signal.aborted) return;
        setApplication(appRes.data);
        const list = ivRes.data.items;
        setInterviews(list); setNextCursor(ivRes.data.nextCursor);
        if (!initialized.current) { setCreateOpen(list.length === 0); initialized.current = true; }
        if (list.length > 0) {
          const maxRound = Math.max(...list.map((i) => i.roundNumber));
          setRound(Math.min(20, maxRound + 1));
        }

      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(toUserMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.applicationId, reload]);

  async function handleCheckAvailability() {
    if (!availDate) return;
    const sequence = ++availabilitySequence.current;
    setLoadingSlots(true); setAvailSlots([]); setAvailabilityChecked(false);
    setError("");
    try {
      const from = `${availDate}T08:00:00+07:00`;
      const to = `${availDate}T18:00:00+07:00`;
      const res = await getInterviewAvailability(
        params.applicationId,
        from,
        to,
        duration
      );
      if (sequence === availabilitySequence.current) { setAvailSlots(res.data.slots); setAvailabilityChecked(true); }
    } catch (e) {
      if (sequence === availabilitySequence.current) setError(interviewScheduleError(e));
    } finally {
      if (sequence === availabilitySequence.current) setLoadingSlots(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitLock.current) return;
    setError("");
    setNotice("");
    try {
      const scheduledStart = interviewStartGmt7(start);
      if (Date.parse(scheduledStart) <= Date.now()) {
        throw new Error("Chọn thời gian trong tương lai.");
      }
      if (mode === "OFFLINE" && !location.trim()) {
        throw new Error("Nhập địa điểm phỏng vấn trực tiếp.");
      }
      if (!Number.isInteger(round) || round < 1 || round > 20) {
        throw new Error("Vòng phỏng vấn phải là số nguyên từ 1 đến 20.");
      }
      if (/[\u0000-\u001f\u007f-\u009f]/.test(location + notes)) {
        throw new Error(
          "Địa điểm và ghi chú cần viết trên một dòng, không chứa ký tự điều khiển."
        );
      }
      const payload: Omit<ScheduleInterview, "requestId"> = {
        applicationId: params.applicationId,
        roundNumber: round,
        scheduledStart,
        timeZone: "Asia/Ho_Chi_Minh",
        durationMinutes: duration,
        mode,
        location: mode === "OFFLINE" ? location.trim() : null,
        notes: notes.trim() || null,
      };
      requestIdentity.current = schedulingRequestIdentity(
        requestIdentity.current,
        payload,
        () => crypto.randomUUID()
      );
      submitLock.current = true;
      submitLock.current = true;
      setPending(true);
      const response = await scheduleInterview({
        ...payload,
        requestId: requestIdentity.current.id,
      });
      setCreated(response.data);
      setInterviews((prev) => [...prev, response.data]);
      setNotice(`Đã tạo lịch phỏng vấn vòng ${response.data.roundNumber}.`);
    } catch (e) {
      setError(interviewScheduleError(e));
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  async function handleRescheduleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rescheduleTarget || pending || submitLock.current) return;
    setError("");
    setNotice("");
    try {
      if (!reschedReason.trim()) throw new Error("Nhập lý do thay đổi lịch để ứng viên hiểu rõ.");
      const scheduledStart = interviewStartGmt7(reschedStart);
      if (reschedMode === "OFFLINE" && !reschedLocation.trim()) {
        throw new Error("Nhập địa điểm phỏng vấn trực tiếp.");
      }
      submitLock.current = true;
      setPending(true);
      const draft = {
        scheduledStart, timeZone: "Asia/Ho_Chi_Minh" as const,
        durationMinutes: reschedDuration, mode: reschedMode,
        location: reschedMode === "OFFLINE" ? reschedLocation.trim() : null,
        reason: reschedReason.trim(),
      };
      const fingerprint = JSON.stringify({ interviewId: rescheduleTarget.id, ...draft });
      if (rescheduleIdentity.current?.fingerprint !== fingerprint) rescheduleIdentity.current = { fingerprint, id: crypto.randomUUID() };
      const res = await rescheduleInterviewByRecruiter(rescheduleTarget.id, { ...draft, requestId: rescheduleIdentity.current.id });
      setRescheduleTarget(null);
      setNotice(`Đã gửi lịch mới cho vòng ${res.data.roundNumber}. Đang chờ ứng viên xác nhận lại.`);
      setReload((v) => v + 1);
    } catch (err) {
      setError(interviewScheduleError(err));
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  async function handleFeedbackSubmit(e: FormEvent) {
    e.preventDefault();
    if (!feedbackTarget || pending || submitLock.current) return;
    setError("");
    setNotice("");
    try {
      if (!fbConclusion || [technical, communication, attitude, cultureFit].some(score => !Number.isInteger(score) || score < 1 || score > 10)) throw new Error("Chấm đầy đủ các tiêu chí từ 1 đến 10 và chọn kết luận.");
      if (!fbComment.trim()) {
        throw new Error("Vui lòng nhập nhận xét chi tiết.");
      }
      submitLock.current = true;
      setPending(true);
      const overallScore =
        Math.round(
          ((technical + communication + attitude + cultureFit) / 4) * 100
        ) / 100;
      const res = await submitInterviewFeedback(feedbackTarget.id, {
        criteriaScores: {
          technical,
          communication,
          attitude,
          cultureFit,
        },
        overallScore,
        comment: fbComment.trim(),
        conclusion: fbConclusion,
      });
      setFeedbacks((prev) => ({ ...prev, [feedbackTarget.id]: res.data }));
      setFeedbackTarget(null);
      setFbComment("");
      setNotice("Đã lưu phiếu đánh giá phỏng vấn và hoàn tất buổi phỏng vấn.");
      setReload((v) => v + 1);
    } catch (err) {
      setError(interviewScheduleError(err));
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  async function handleCancelInterview(event: FormEvent) {
    event.preventDefault();
    if (!cancelTarget || pending || submitLock.current || !cancelReason.trim()) return;
    setError(""); setNotice(""); submitLock.current = true; setPending(true);
    try {
      await cancelInterview(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null); setNotice("Đã hủy lịch. Đơn ứng tuyển vẫn được giữ nguyên.");
      setReload(value => value + 1);
    } catch (cause) { setError(interviewScheduleError(cause)); }
    finally { submitLock.current = false; setPending(false); }
  }

  async function openFeedback(iv: Interview) {
    if (pending) return;
    setError("");
    let fb = feedbacks[iv.id];
    if (iv.status === "COMPLETED" && !fb) {
      setPending(true);
      try { fb = (await getInterviewFeedback(iv.id)).data; setFeedbacks(old => ({ ...old, [iv.id]: fb })); }
      catch (cause) { setError(interviewScheduleError(cause)); return; }
      finally { setPending(false); }
    }
    setTechnical(fb?.criteriaScores.technical ?? 0); setCommunication(fb?.criteriaScores.communication ?? 0);
    setAttitude(fb?.criteriaScores.attitude ?? 0); setCultureFit(fb?.criteriaScores.cultureFit ?? 0);
    setFbComment(fb?.comment ?? ""); setFbConclusion(fb?.conclusion ?? "");
    setFeedbackTarget(iv); setRescheduleTarget(null); setCreateOpen(false); setCreated(null);
  }

  if (loading) {
    return (
      <main>
        <LoadingState />
      </main>
    );
  }
  if (loadError || !application) {
    return (
      <main>
        <ErrorState
          message={loadError || "Không tìm thấy hồ sơ."}
          onRetry={() => setReload((v) => v + 1)}
        />
      </main>
    );
  }

  const eligible = application.status === "INTERVIEW";

  return (
    <main className={styles.page}>
      <PageHeader
        eyebrow="QUẢN LÝ & ĐẶT LỊCH PHỎNG VẤN"
        title={application.jobTitle}
        description="Tạo lịch phỏng vấn trực tuyến hoặc trực tiếp, kiểm tra khung giờ trống và đánh giá kết quả sau phỏng vấn."
        action={
<div className="btn-group"><button className="btn" type="button" disabled={pending} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /> Làm mới</button><Link className="btn" href={"/recruiter/applications/" + params.applicationId}>Về hồ sơ</Link></div>
        }
      />

      {notice && (
        <div className="card" role="status" style={{ borderColor: "#16a34a" }}>
          <p style={{ color: "#15803d", margin: 0 }}>{notice}</p>
        </div>
      )}

      <div className={styles.intro}><CalendarCheck2 size={30} /><div><strong>Lịch rõ ràng, phản hồi nhất quán</strong><p>Tạo lời mời → Ứng viên xác nhận → Phỏng vấn → Đánh giá. Khi đổi giờ, ứng viên cần xác nhận lịch mới. Tất cả thời gian theo GMT+7.</p></div></div>
      <div className="section-head"><h2>Lịch của hồ sơ</h2>{eligible ? <button className="btn btn-primary" type="button" disabled={pending} onClick={() => { setCreateOpen(true); setCreated(null); setRescheduleTarget(null); setFeedbackTarget(null); }}><Plus size={17} /> Tạo lịch mới</button> : null}</div>
      {cancelTarget ? <InterviewActionDialog title={"Hủy lịch phỏng vấn vòng " + cancelTarget.roundNumber} pending={pending} onClose={() => setCancelTarget(null)}><form onSubmit={handleCancelInterview}><p>Hủy buổi hẹn, giữ nguyên đơn ứng tuyển. Ứng viên sẽ nhận cập nhật; chỉ tự hủy trước giờ hẹn ít nhất 2 giờ.</p><label className="field">Lý do hủy lịch<textarea className="textarea" required maxLength={500} disabled={pending} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label>{error ? <p className="notice notice-danger" role="alert">{error}</p> : null}<div className="btn-group"><button className="btn btn-danger" type="submit" disabled={pending}>Xác nhận hủy lịch</button><button className="btn" type="button" disabled={pending} onClick={() => setCancelTarget(null)}>Đóng</button></div></form></InterviewActionDialog> : null}
      <div className={styles.workspace}><section className={styles.history}>
      {!interviews.length ? <div className={styles.card}><h2>Chưa có lịch hẹn</h2><p className="help">Chọn hình thức, thời gian và gửi lời mời để ứng viên xác nhận. Việc vào vòng Phỏng vấn chưa tự tạo lịch hẹn.</p></div> : null}
      {interviews.length > 0 && (
        <section className="stack" aria-label="Các vòng phỏng vấn đã tạo">
          <h2>Các vòng phỏng vấn của hồ sơ</h2>
          {interviews.map((iv) => {
            const fb = feedbacks[iv.id];
            const actions = interviewActions(iv, now);
            return (
              <article className={styles.card} key={iv.id}>
                <InterviewSummary interview={iv} recruiter now={now} inactive={!eligible} />

                {iv.status === "RESCHEDULE_REQUESTED" && (
                  <div
                    className="card stack"
                    style={{ background: "var(--surface-muted, #f8fafc)" }}
                  >
                    <strong>Ứng viên đề nghị dời lịch:</strong>
                    {iv.rescheduleReason && <p>{iv.rescheduleReason}</p>}
                    {iv.reschedulePreferredSlots &&
                      iv.reschedulePreferredSlots.length > 0 && (
                        <div className="btn-group">
                          {iv.reschedulePreferredSlots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setRescheduleTarget(iv); setFeedbackTarget(null); setCreateOpen(false); setCreated(null);
                                setReschedMode(iv.mode);
                                setReschedLocation(iv.location ?? "");
                                setReschedDuration(iv.durationMinutes);
                                setReschedStart(toLocalInputValue(slot)); setReschedReason("Điều chỉnh theo khung giờ ứng viên đề xuất");
                              }}
                            >
                              Chọn giờ ứng viên đề xuất:{" "}
                              {interviewDate(slot)}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                )}

                {fb && (
                  <div
                    className="card stack"
                    style={{ background: "var(--surface-muted, #f8fafc)" }}
                  >
                    <strong>
                      Kết quả đánh giá: {fb.overallScore}/10 —{" "}
                      {feedbackConclusionLabel(fb.conclusion)}
                    </strong>
                    <p className="muted">
                      Kỹ thuật: {fb.criteriaScores.technical}/10 · Giao tiếp:{" "}
                      {fb.criteriaScores.communication}/10 · Thái độ:{" "}
                      {fb.criteriaScores.attitude}/10 · Văn hóa:{" "}
                      {fb.criteriaScores.cultureFit}/10
                    </p>
                    <p style={{ whiteSpace: "pre-wrap" }}>{fb.comment}</p>
                  </div>
                )}

                <div className="btn-group">
                  {actions.join && eligible && (
                    <Link
                      className="btn btn-primary"
                      href={`/recruiter/applications/${params.applicationId}/interview/room?interviewId=${iv.id}`}
                    >
                      Vào phòng phỏng vấn
                    </Link>
                  )}

                  {actions.reschedule && eligible && (
                    <button
                      className="btn"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setRescheduleTarget(iv); setFeedbackTarget(null); setCreateOpen(false); setCreated(null);
                        setReschedMode(iv.mode);
                        setReschedLocation(iv.location ?? "");
                        setReschedDuration(iv.durationMinutes);
                        setReschedStart(toLocalInputValue(iv.scheduledStart)); setReschedReason("");
                      }}
                    >
                      Dời lịch
                    </button>
                  )}

                  {actions.feedback && (
                    <button
                      className="btn"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        void openFeedback(iv);
                      }}
                    >
                      {fb ? "Cập nhật đánh giá" : "Chấm điểm & Đánh giá"}
                    </button>
                  )}

                  {actions.cancel && (
                    <button
                      className="btn"
                      type="button"
                      disabled={pending}
                      onClick={() => { setCancelTarget(iv); setCancelReason(""); setError(""); }}
                    >
                      Hủy lịch
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {nextCursor ? <button className="btn" type="button" disabled={loadingMore || pending} onClick={async () => {
        setLoadingMore(true); setError("");
        try {
          const response = await listApplicationInterviews(params.applicationId, nextCursor);
          setInterviews(old => [...new Map([...old, ...response.data.items].map(iv => [iv.id, iv])).values()]);
          setNextCursor(response.data.nextCursor);
        } catch (cause) { setError(interviewScheduleError(cause)); }
        finally { setLoadingMore(false); }
      }}>{loadingMore ? "Đang tải…" : "Tải thêm lịch cũ"}</button> : null}
      </section><aside ref={editorRef} className={styles.editor} aria-label="Xử lý lịch phỏng vấn">
      {error ? <p className="notice notice-danger" role="alert">{error}</p> : null}
      {rescheduleTarget && (
        <form className="card stack" onSubmit={handleRescheduleSubmit}>
          <h3>
            Dời lịch phỏng vấn vòng {rescheduleTarget.roundNumber}
          </h3>
          <p className="help">Lịch cũ sẽ được giữ trong lịch sử. Lịch mới được gửi ở trạng thái chờ ứng viên xác nhận lại.</p>
          <label className="field">
            Hình thức phỏng vấn
            <select
              className="input"
              value={reschedMode}
              onChange={(e) => setReschedMode(e.target.value as InterviewMode)}
            >
              <option value="ONLINE">
                {interviewModeLabel("ONLINE")}
              </option>
              <option value="OFFLINE">{interviewModeLabel("OFFLINE")}</option>
            </select>
          </label>
          <label className="field">
            Thời gian mới (GMT+7)
            <input
              className="input"
              type="datetime-local"
              required
              value={reschedStart}
              onChange={(e) => setReschedStart(e.target.value)}
            />
          </label>
          <label className="field">
            Thời lượng
            <select
              className="input"
              value={reschedDuration}
              onChange={(e) => setReschedDuration(Number(e.target.value))}
            >
              {[30, 45, 60].map((v) => (
                <option key={v} value={v}>
                  {v} phút
                </option>
              ))}
            </select>
          </label>
          {reschedMode === "OFFLINE" && (
            <label className="field">
              Địa điểm
              <input
                className="input"
                required
                value={reschedLocation}
                onChange={(e) => setReschedLocation(e.target.value)}
              />
            </label>
          )}
          <label className="field">Lý do đổi lịch<input className="input" required maxLength={500} value={reschedReason} onChange={event => setReschedReason(event.target.value)} disabled={pending} /></label>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Đang lưu…" : "Xác nhận lịch mới"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setRescheduleTarget(null)}
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      {feedbackTarget && (
        <form className="card stack" onSubmit={handleFeedbackSubmit}>
          <h3>
            Phiếu đánh giá sau phỏng vấn · Vòng {feedbackTarget.roundNumber}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <label className="field">
              Chuyên môn / Kỹ thuật (1–10)
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                required
                value={technical || ""}
                onChange={(e) => setTechnical(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Giao tiếp (1–10)
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                required
                value={communication || ""}
                onChange={(e) => setCommunication(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Thái độ (1–10)
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                required
                value={attitude || ""}
                onChange={(e) => setAttitude(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Phù hợp văn hóa (1–10)
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                required
                value={cultureFit || ""}
                onChange={(e) => setCultureFit(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            Kết luận đề xuất
            <select
              className="input"
              value={fbConclusion}
              onChange={(e) =>
                setFbConclusion(e.target.value as FeedbackConclusion)
              }
            >
              <option value="" disabled>Chọn kết luận sau phỏng vấn</option>
              <option value="PASS">Đạt — Đề xuất gửi thư mời nhận việc</option>
              <option value="NEXT_ROUND">
                Đạt vòng này — Lên lịch vòng tiếp theo
              </option>
              <option value="FAIL">Chưa phù hợp — Từ chối hồ sơ</option>
            </select>
          </label>
          <label className="field">
            Nhận xét chi tiết
            <textarea
              className="input"
              rows={4}
              required
              maxLength={4000}
              value={fbComment}
              onChange={(e) => setFbComment(e.target.value)}
              placeholder="Đánh giá điểm mạnh, điểm cần cải thiện và đề xuất mức lương/vị trí..."
            />
          </label>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Đang lưu…" : "Lưu kết quả đánh giá"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setFeedbackTarget(null)}
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      {!rescheduleTarget && !feedbackTarget && (created ? (
        <section className="card stack">
          <p role="status">Đã gửi lịch phỏng vấn thành công.</p>
          <p>
            {new Date(created.scheduledStart).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}{" "}
            (GMT+7) ·{" "}
            {interviewModeLabel(created.mode)}
            {created.mode === "OFFLINE" && created.location ? ` · ${created.location}` : ""}
          </p>
          <div className="btn-group">
            {interviewActions(created, now).join && (
              <Link
                className="btn btn-primary"
                href={`/recruiter/applications/${params.applicationId}/interview/room?interviewId=${created.id}`}
              >
                Mở phòng phỏng vấn Video
              </Link>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => {
                setCreated(null);
                setRound((r) => Math.min(20, r + 1));
              }}
            >
              Tạo thêm vòng phỏng vấn khác
            </button>
          </div>
        </section>
      ) : !eligible ? (
        <p role="alert">
          Chuyển hồ sơ sang bước Phỏng vấn trước khi tạo lịch hẹn.
          <Link className="btn" href="/recruiter/applications">Về quy trình tuyển dụng</Link>
        </p>
      ) : createOpen ? (
        <form className="card stack" noValidate onSubmit={submit}>
          <h2>Tạo lịch phỏng vấn mới</h2>
          <p className="help">Kiểm tra thông tin trước khi gửi. Lời mời được gửi cho ứng viên và cần được xác nhận; không tự coi là đã chốt lịch.</p>
          <label className="field">
            Hình thức phỏng vấn
            <select
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value as InterviewMode)}
              disabled={pending}
            >
              <option value="ONLINE">
                {interviewModeLabel("ONLINE")}
              </option>
              <option value="OFFLINE">{interviewModeLabel("OFFLINE")}</option>
            </select>
          </label>

          <label className="field">
            Vòng phỏng vấn
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              required
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              disabled={pending}
            />
          </label>

          <label className="field">
            Thời lượng
            <select
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={pending}
            >
              {[30, 45, 60].map((v) => (
                <option key={v} value={v}>
                  {v} phút
                </option>
              ))}
            </select>
          </label>

          <div className="card stack" style={{ padding: 12 }}>
            <strong>Gợi ý khung giờ trống (không trùng lịch 2 bên)</strong>
            <div className="btn-group">
              <input
                className="input"
                type="date"
                aria-label="Ngày tìm khung giờ trống"
                value={availDate}
                onChange={(e) => setAvailDate(e.target.value)}
                disabled={pending || loadingSlots}
              />
              <button
                className="btn"
                type="button"
                disabled={!availDate || loadingSlots}
                onClick={() => void handleCheckAvailability()}
              >
                {loadingSlots ? "Đang kiểm tra…" : "Tìm khung giờ trống"}
              </button>
            </div>
            {availSlots.length > 0 && (
              <div className="btn-group" style={{ flexWrap: "wrap" }}>
                {availSlots.map((slot) => {
                  const localVal = toLocalInputValue(slot.start);
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setStart(localVal)}
                    >
                      {localVal.slice(11)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {availabilityChecked && !availSlots.length ? <p className="notice">Không có khung giờ phù hợp trong khoảng 08:00–18:00 của ngày đã chọn. Hãy chọn ngày khác.</p> : null}
          <p className="help">Gợi ý chỉ dựa trên lịch đã lưu trong CareerHub, không bao gồm lịch Google/Outlook cá nhân. Hệ thống kiểm tra trùng lần nữa khi gửi.</p>
          <label className="field">
            Thời gian dự kiến (GMT+7)
            <input
              className="input"
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={pending}
            />
          </label>

          {mode === "OFFLINE" && (
            <label className="field">
              Địa điểm phỏng vấn
              <input
                className="input"
                required
                maxLength={500}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={pending}
                placeholder="Ví dụ: Tầng 5, Tòa nhà Viettel, Quận 10, TP.HCM"
              />
            </label>
          )}

          <label className="field">
            Lời nhắn / Ghi chú
            <input
              className="input"
              maxLength={2000}
              placeholder="Lời nhắn ngắn cho ứng viên (một dòng)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Đang gửi…" : "Gửi lịch phỏng vấn"}
          </button>
        </form>
      ) : <section className={styles.emptyEditor}><CalendarCheck2 size={32} /><h3>Chọn việc cần xử lý</h3><p>Mở lịch ở bên cạnh để đổi giờ, xem đánh giá hoặc tạo một lời mời mới.</p></section>)}
      </aside></div>
    </main>
  );
}
