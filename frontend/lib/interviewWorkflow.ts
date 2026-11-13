import type { Interview } from "./interviewApi";

export function interviewActions(iv: Interview, now = Date.now()) {
  const start = Date.parse(iv.scheduledStart);
  const end = Date.parse(iv.scheduledEnd);
  const future = Number.isFinite(start) && start > now;
  const active = ["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(iv.status);
  return {
    confirm: iv.status === "SCHEDULED" && future,
    requestReschedule: ["SCHEDULED", "CONFIRMED"].includes(iv.status) && future,
    reschedule: active && (future || iv.status === "RESCHEDULE_REQUESTED"),
    cancel: active && start - now >= 2 * 3600_000,
    join: iv.mode === "ONLINE" && ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(iv.status) && now >= start - 15 * 60_000 && now <= end + 60 * 60_000,
    feedback: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(iv.status) && start <= now,
  };
}

export function interviewDate(value: string, kind: "date" | "time" | "full" = "full"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "Chưa có thời gian";
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", ...(kind === "date" ? { day: "2-digit", month: "2-digit", year: "numeric" } as const : kind === "time" ? { hour: "2-digit", minute: "2-digit" } as const : { dateStyle: "short", timeStyle: "short" } as const) });
}

export function interviewGuidance(iv: Interview, recruiter = false, now = Date.now()): string {
  if (iv.status === "RESCHEDULE_REQUESTED") return recruiter ? "Ứng viên đã đề xuất đổi giờ. Chọn thời gian phù hợp để gửi lịch mới; ứng viên cần xác nhận lại." : "Yêu cầu đổi giờ đã gửi. Chờ nhà tuyển dụng phản hồi; chưa có lịch mới được chốt.";
  if (iv.status === "CANCELLED") return "Lịch này đã hủy và không còn dùng để tham gia. Hủy lịch không đồng nghĩa kết thúc đơn ứng tuyển.";
  if (iv.status === "NO_SHOW") return "Chưa ghi nhận ứng viên tham gia phòng trực tuyến trong thời gian cho phép. Liên hệ để đối chiếu trước khi quyết định hồ sơ.";
  if (iv.status === "COMPLETED") return "Buổi phỏng vấn đã hoàn tất. Kết quả xét tuyển được cập nhật riêng trong đơn ứng tuyển.";
  if (iv.status === "IN_PROGRESS") return "Ứng viên đã vào phòng phỏng vấn. Kết quả sẽ được ghi nhận sau buổi trao đổi.";
  if (Date.parse(iv.scheduledEnd) <= now) return recruiter ? "Đã qua giờ hẹn. Kiểm tra tình hình tham dự và lưu đánh giá khi buổi phỏng vấn thực sự hoàn tất." : "Đã qua giờ hẹn. Theo dõi kết quả trong đơn ứng tuyển hoặc liên hệ nhà tuyển dụng.";
  if (iv.status === "SCHEDULED") return recruiter ? "Đã gửi lời mời, đang chờ ứng viên xác nhận." + (iv.mode === "ONLINE" ? " Vào phòng trước không thay thế xác nhận của ứng viên." : "") : "Bạn có một lời mời phỏng vấn. Kiểm tra thời gian, hình thức và xác nhận tham gia hoặc đề nghị đổi giờ.";
  return recruiter ? "Ứng viên đã xác nhận lịch này. Nếu đổi thời gian, hệ thống sẽ gửi lịch mới để xác nhận lại." : iv.mode === "ONLINE" ? "Bạn đã xác nhận lịch này. Chuẩn bị tham gia đúng giờ; phòng trực tuyến mở trước 15 phút." : "Bạn đã xác nhận lịch này. Kiểm tra địa điểm, chuẩn bị giấy tờ và có mặt đúng giờ.";
}

export function validatePreferredSlots(slots: readonly string[], now = Date.now()): string | null {
  if (slots.length < 2 || slots.length > 3) return "Chọn 2–3 khung giờ đề xuất.";
  const times = slots.map((slot) => Date.parse(slot));
  if (times.some(time => !Number.isFinite(time) || time <= now)) return "Các khung giờ đề xuất phải ở trong tương lai.";
  if (new Set(times).size !== times.length) return "Các khung giờ đề xuất phải khác nhau.";
  return null;
}
