"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader, ErrorState, LoadingState, StatusBadge } from "@/components/ui";
import { getApplicationDetail, type CandidateApplication } from "@/lib/person2Api";
import { toUserMessage } from "@/lib/apiClient";
import {
  cancelInterview,
  feedbackConclusionLabel,
  getInterviewAvailability,
  getInterviewFeedback,
  interviewStartGmt7,
  interviewScheduleError,
  interviewStatusLabel,
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
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
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
  const [fbConclusion, setFbConclusion] = useState<FeedbackConclusion>("PASS");

  const requestIdentity = useRef<{ fingerprint: string; id: string } | null>(
    null
  );
  const submitLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    Promise.all([
      getApplicationDetail(params.applicationId, controller.signal),
      listApplicationInterviews(params.applicationId, null, controller.signal),
    ])
      .then(async ([appRes, ivRes]) => {
        setApplication(appRes.data);
        const list = ivRes.data.items;
        setInterviews(list);
        if (list.length > 0) {
          const maxRound = Math.max(...list.map((i) => i.roundNumber));
          setRound(Math.min(20, maxRound + 1));
        }
        const completed = list.filter((i) => i.status === "COMPLETED");
        const fbMap: Record<string, InterviewFeedback> = {};
        for (const iv of completed) {
          try {
            const fbRes = await getInterviewFeedback(iv.id, controller.signal);
            fbMap[iv.id] = fbRes.data;
          } catch {
            /* ignore if not found */
          }
        }
        if (!controller.signal.aborted) {
          setFeedbacks(fbMap);
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
    setLoadingSlots(true);
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
      setAvailSlots(res.data.slots);
    } catch (e) {
      setError(interviewScheduleError(e));
    } finally {
      setLoadingSlots(false);
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
    if (!rescheduleTarget || pending) return;
    setError("");
    setNotice("");
    try {
      const scheduledStart = interviewStartGmt7(reschedStart);
      if (reschedMode === "OFFLINE" && !reschedLocation.trim()) {
        throw new Error("Nhập địa điểm phỏng vấn trực tiếp.");
      }
      setPending(true);
      const res = await rescheduleInterviewByRecruiter(rescheduleTarget.id, {
        requestId: crypto.randomUUID(),
        scheduledStart,
        timeZone: "Asia/Ho_Chi_Minh",
        durationMinutes: reschedDuration,
        mode: reschedMode,
        location: reschedMode === "OFFLINE" ? reschedLocation.trim() : null,
      });
      setRescheduleTarget(null);
      setNotice(
        `Đã cập nhật lịch phỏng vấn vòng ${res.data.roundNumber} (Lần #${res.data.scheduleRevision}).`
      );
      setReload((v) => v + 1);
    } catch (err) {
      setError(interviewScheduleError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleFeedbackSubmit(e: FormEvent) {
    e.preventDefault();
    if (!feedbackTarget || pending) return;
    setError("");
    setNotice("");
    try {
      if (!fbComment.trim()) {
        throw new Error("Vui lòng nhập nhận xét chi tiết.");
      }
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
      setPending(false);
    }
  }

  async function handleCancelInterview(iv: Interview) {
    const reason = window.prompt(
      "Nhập lý do hủy lịch phỏng vấn (trước giờ hẹn ít nhất 2 tiếng):",
      "Thay đổi kế hoạch phỏng vấn"
    );
    if (!reason || !reason.trim()) return;
    setError("");
    setNotice("");
    try {
      setPending(true);
      await cancelInterview(iv.id, reason.trim());
      setNotice(`Đã hủy lịch phỏng vấn vòng ${iv.roundNumber}.`);
      setReload((v) => v + 1);
    } catch (err) {
      setError(interviewScheduleError(err));
    } finally {
      setPending(false);
    }
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
    <main className="stack" style={{ maxWidth: 780, margin: "0 auto" }}>
      <PageHeader
        eyebrow="QUẢN LÝ & ĐẶT LỊCH PHỎNG VẤN"
        title={application.jobTitle}
        description="Tạo lịch phỏng vấn trực tuyến hoặc trực tiếp, kiểm tra khung giờ trống và đánh giá kết quả sau phỏng vấn."
        action={
          <Link
            className="btn"
            href={`/recruiter/applications/${params.applicationId}`}
          >
            Về hồ sơ ứng tuyển
          </Link>
        }
      />

      {error && (
        <div className="card" role="alert" style={{ borderColor: "#dc2626" }}>
          <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>
        </div>
      )}
      {notice && (
        <div className="card" role="status" style={{ borderColor: "#16a34a" }}>
          <p style={{ color: "#15803d", margin: 0 }}>{notice}</p>
        </div>
      )}

      {interviews.length > 0 && (
        <section className="stack" aria-label="Các vòng phỏng vấn đã tạo">
          <h2>Các vòng phỏng vấn của hồ sơ</h2>
          {interviews.map((iv) => {
            const fb = feedbacks[iv.id];
            const isActive = [
              "SCHEDULED",
              "CONFIRMED",
              "RESCHEDULE_REQUESTED",
              "IN_PROGRESS",
            ].includes(iv.status);
            return (
              <article className="card stack" key={iv.id}>
                <div className="section-head">
                  <h3>
                    Vòng {iv.roundNumber}
                    {iv.scheduleRevision && iv.scheduleRevision > 1
                      ? ` (Lần dời #${iv.scheduleRevision})`
                      : ""}
                  </h3>
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
                </div>
                <p className="muted">
                  {new Date(iv.scheduledStart).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}{" "}
                  (GMT+7) · {iv.durationMinutes} phút ·{" "}
                  {interviewModeLabel(iv.mode)}
                  {iv.mode === "OFFLINE" && iv.location ? ` (${iv.location})` : ""}
                </p>

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
                                setRescheduleTarget(iv);
                                setReschedMode(iv.mode);
                                setReschedLocation(iv.location ?? "");
                                setReschedDuration(iv.durationMinutes);
                                setReschedStart(toLocalInputValue(slot));
                              }}
                            >
                              Chọn giờ ứng viên đề xuất:{" "}
                              {new Date(slot).toLocaleString("vi-VN", {
                                timeZone: "Asia/Ho_Chi_Minh",
                              })}
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
                  {iv.mode === "ONLINE" && isActive && (
                    <Link
                      className="btn btn-primary"
                      href={`/recruiter/applications/${params.applicationId}/interview/room?interviewId=${iv.id}`}
                    >
                      Vào phòng phỏng vấn
                    </Link>
                  )}

                  {["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(
                    iv.status
                  ) && (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setRescheduleTarget(iv);
                        setReschedMode(iv.mode);
                        setReschedLocation(iv.location ?? "");
                        setReschedDuration(iv.durationMinutes);
                        setReschedStart(toLocalInputValue(iv.scheduledStart));
                      }}
                    >
                      Dời lịch
                    </button>
                  )}

                  {iv.status !== "CANCELLED" && iv.status !== "NO_SHOW" && (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setFeedbackTarget(iv);
                        if (fb) {
                          setTechnical(fb.criteriaScores.technical);
                          setCommunication(fb.criteriaScores.communication);
                          setAttitude(fb.criteriaScores.attitude);
                          setCultureFit(fb.criteriaScores.cultureFit);
                          setFbComment(fb.comment);
                          setFbConclusion(fb.conclusion);
                        }
                      }}
                    >
                      {fb ? "Cập nhật đánh giá" : "Chấm điểm & Đánh giá"}
                    </button>
                  )}

                  {["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(
                    iv.status
                  ) && (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void handleCancelInterview(iv)}
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

      {rescheduleTarget && (
        <form className="card stack" onSubmit={handleRescheduleSubmit}>
          <h3>
            Dời lịch phỏng vấn vòng {rescheduleTarget.roundNumber}
          </h3>
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
                value={technical}
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
                value={communication}
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
                value={attitude}
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
                value={cultureFit}
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

      {created ? (
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
            {created.mode === "ONLINE" && (
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
      ) : (
        <form className="card stack" noValidate onSubmit={submit}>
          <h2>Tạo lịch phỏng vấn mới</h2>
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
                {availSlots.slice(0, 12).map((slot) => {
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
            <textarea
              className="input resize-none"
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Đang gửi…" : "Gửi lịch phỏng vấn"}
          </button>
        </form>
      )}
    </main>
  );
}
