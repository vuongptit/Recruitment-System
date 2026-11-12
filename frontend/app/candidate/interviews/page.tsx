"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import {
  cancelInterview,
  confirmInterview,
  interviewScheduleError,
  interviewStartGmt7,
  interviewStatusLabel,
  listMyInterviews,
  requestRescheduleInterview,
  type Interview,
} from "@/lib/interviewApi";
import { toUserMessage } from "@/lib/apiClient";

function canJoinOnlineRoom(iv: Interview): boolean {
  if (iv.mode !== "ONLINE") return false;
  if (!["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(iv.status)) {
    return false;
  }
  const now = Date.now();
  const startMs = Date.parse(iv.scheduledStart);
  const endMs = Date.parse(iv.scheduledEnd);
  return now >= startMs - 15 * 60 * 1000 && now <= endMs + 60 * 60 * 1000;
}

function canCancelInterview(iv: Interview): boolean {
  if (!["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(iv.status)) {
    return false;
  }
  return Date.parse(iv.scheduledStart) - Date.now() >= 2 * 3600 * 1000;
}

export default function CandidateInterviewsPage() {
  const [items, setItems] = useState<Interview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(
    null
  );
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [slot1, setSlot1] = useState("");
  const [slot2, setSlot2] = useState("");
  const [slot3, setSlot3] = useState("");

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<Interview | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listMyInterviews(cursor, controller.signal)
      .then((r) => {
        setItems((old) =>
          cursor
            ? [
                ...new Map(
                  [...old, ...r.data.items].map((iv) => [iv.id, iv])
                ).values(),
              ]
            : r.data.items
        );
        setNextCursor(r.data.nextCursor);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(toUserMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, reload]);

  function replaceInterviewItem(updated: Interview) {
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
    );
  }

  async function handleConfirm(iv: Interview) {
    setActionError("");
    setActionNotice("");
    setBusyId(iv.id);
    try {
      const res = await confirmInterview(iv.id);
      replaceInterviewItem(res.data);
      setActionNotice(`Đã xác nhận tham gia phỏng vấn vòng ${iv.roundNumber}.`);
    } catch (e) {
      setActionError(interviewScheduleError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitReschedule(e: FormEvent) {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setActionError("");
    setActionNotice("");
    try {
      const rawSlots = [slot1, slot2, slot3]
        .map((s) => s.trim())
        .filter(Boolean);
      if (rawSlots.length < 2) {
        throw new Error("Vui lòng chọn ít nhất 2 khung giờ đề xuất.");
      }
      const preferredSlots = rawSlots.map((s) => interviewStartGmt7(s));
      if (!rescheduleReason.trim()) {
        throw new Error("Vui lòng nhập lý do xin dời lịch.");
      }
      setBusyId(rescheduleTarget.id);
      const res = await requestRescheduleInterview(rescheduleTarget.id, {
        reason: rescheduleReason.trim(),
        preferredSlots,
      });
      replaceInterviewItem(res.data);
      setRescheduleTarget(null);
      setRescheduleReason("");
      setSlot1("");
      setSlot2("");
      setSlot3("");
      setActionNotice("Đã gửi yêu cầu dời lịch phỏng vấn tới nhà tuyển dụng.");
    } catch (err) {
      setActionError(interviewScheduleError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitCancel(e: FormEvent) {
    e.preventDefault();
    if (!cancelTarget) return;
    setActionError("");
    setActionNotice("");
    try {
      if (!cancelReason.trim()) {
        throw new Error("Vui lòng nhập lý do hủy lịch phỏng vấn.");
      }
      setBusyId(cancelTarget.id);
      const res = await cancelInterview(cancelTarget.id, cancelReason.trim());
      replaceInterviewItem(res.data);
      setCancelTarget(null);
      setCancelReason("");
      setActionNotice("Đã hủy lịch phỏng vấn.");
    } catch (err) {
      setActionError(interviewScheduleError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="stack">
      <PageHeader
        title="Lịch phỏng vấn"
        eyebrow="ỨNG VIÊN · PHỎNG VẤN"
        description="Theo dõi lịch, xác nhận tham gia, đề nghị dời lịch hoặc vào phòng phỏng vấn trực tuyến (GMT+7)."
      />
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setCursor(null);
            setReload((v) => v + 1);
          }}
        />
      )}
      {actionError && (
        <div className="card" role="alert" style={{ borderColor: "#dc2626" }}>
          <p style={{ color: "#dc2626", margin: 0 }}>{actionError}</p>
        </div>
      )}
      {actionNotice && (
        <div className="card" role="status" style={{ borderColor: "#16a34a" }}>
          <p style={{ color: "#15803d", margin: 0 }}>{actionNotice}</p>
        </div>
      )}

      {rescheduleTarget && (
        <form className="card stack" onSubmit={handleSubmitReschedule}>
          <h3>
            Xin dời lịch phỏng vấn vòng {rescheduleTarget.roundNumber}
          </h3>
          <p className="muted">
            Đề xuất 2–3 khung giờ mới phù hợp với bạn (GMT+7) để nhà tuyển dụng
            sắp xếp lại.
          </p>
          <label className="field">
            Lý do xin dời lịch
            <textarea
              className="input"
              rows={3}
              required
              maxLength={500}
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Ví dụ: Bận lịch thi học kỳ / lịch công tác đột xuất..."
            />
          </label>
          <label className="field">
            Khung giờ đề xuất 1 (bắt buộc)
            <input
              className="input"
              type="datetime-local"
              required
              value={slot1}
              onChange={(e) => setSlot1(e.target.value)}
            />
          </label>
          <label className="field">
            Khung giờ đề xuất 2 (bắt buộc)
            <input
              className="input"
              type="datetime-local"
              required
              value={slot2}
              onChange={(e) => setSlot2(e.target.value)}
            />
          </label>
          <label className="field">
            Khung giờ đề xuất 3 (tùy chọn)
            <input
              className="input"
              type="datetime-local"
              value={slot3}
              onChange={(e) => setSlot3(e.target.value)}
            />
          </label>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busyId === rescheduleTarget.id}
            >
              {busyId === rescheduleTarget.id
                ? "Đang gửi…"
                : "Gửi yêu cầu dời lịch"}
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

      {cancelTarget && (
        <form className="card stack" onSubmit={handleSubmitCancel}>
          <h3>Hủy lịch phỏng vấn vòng {cancelTarget.roundNumber}</h3>
          <p className="muted">
            Lưu ý: Chỉ có thể hủy lịch trước giờ phỏng vấn ít nhất 2 tiếng.
          </p>
          <label className="field">
            Lý do hủy lịch
            <textarea
              className="input"
              rows={3}
              required
              maxLength={500}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Nhập lý do hủy lịch phỏng vấn..."
            />
          </label>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busyId === cancelTarget.id}
            >
              {busyId === cancelTarget.id ? "Đang hủy…" : "Xác nhận hủy lịch"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setCancelTarget(null)}
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      <section className="stack" aria-label="Danh sách lịch phỏng vấn">
        {items.map((iv) => {
          const isOnline = iv.mode === "ONLINE";
          const joinable = canJoinOnlineRoom(iv);
          const cancellable = canCancelInterview(iv);
          const canConfirm =
            iv.status === "SCHEDULED" &&
            Date.parse(iv.scheduledStart) > Date.now();
          const canReschedule =
            ["SCHEDULED", "CONFIRMED"].includes(iv.status) &&
            Date.parse(iv.scheduledStart) > Date.now();

          return (
            <article className="card stack" key={iv.id}>
              <div className="section-head">
                <h2>
                  Phỏng vấn vòng {iv.roundNumber}
                  {iv.scheduleRevision && iv.scheduleRevision > 1
                    ? ` (Lần dời #${iv.scheduleRevision})`
                    : ""}
                </h2>
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
                <time dateTime={iv.scheduledStart}>
                  {new Date(iv.scheduledStart).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </time>{" "}
                (GMT+7) · {iv.durationMinutes} phút
              </p>
              <p>
                {isOnline
                  ? "Phỏng vấn trực tuyến (Video Room)"
                  : "Phỏng vấn trực tiếp"}
                {iv.location ? ` · ${iv.location}` : ""}
              </p>
              {iv.rescheduleReason && (
                <p className="muted">
                  Lý do xin dời lịch: {iv.rescheduleReason}
                </p>
              )}
              {iv.cancelReason && (
                <p className="muted">Lý do hủy: {iv.cancelReason}</p>
              )}

              <div className="btn-group">
                {canConfirm && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busyId === iv.id}
                    onClick={() => void handleConfirm(iv)}
                  >
                    {busyId === iv.id
                      ? "Đang xác nhận…"
                      : "Xác nhận tham gia"}
                  </button>
                )}

                {isOnline &&
                  ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(
                    iv.status
                  ) && (
                    <Link
                      className={joinable ? "btn btn-primary" : "btn"}
                      href={`/candidate/interviews/${iv.id}/room`}
                    >
                      {joinable
                        ? "Vào phòng phỏng vấn Video"
                        : "Phòng phỏng vấn (mở trước 15 phút)"}
                    </Link>
                  )}

                {canReschedule && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setRescheduleTarget(iv);
                      setCancelTarget(null);
                    }}
                  >
                    Xin dời lịch
                  </button>
                )}

                {cancellable && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setCancelTarget(iv);
                      setRescheduleTarget(null);
                    }}
                  >
                    Hủy lịch
                  </button>
                )}

                <Link
                  className="btn btn-secondary"
                  href={`/candidate/applications/${iv.applicationId}`}
                >
                  Xem đơn ứng tuyển
                </Link>
              </div>
            </article>
          );
        })}
      </section>
      {loading && <LoadingState />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="Chưa có lịch phỏng vấn"
          description="Lịch do nhà tuyển dụng gửi sẽ hiển thị tại đây."
          href="/candidate/jobs"
          action="Tìm việc ngay"
        />
      )}
      {!loading && nextCursor && (
        <button className="btn" onClick={() => setCursor(nextCursor)}>
          Tải thêm lịch
        </button>
      )}
    </main>
  );
}
