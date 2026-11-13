import type { InboxNotification } from "./notificationState";
import { applicationStatusLabel } from "./recruitmentLabels";

const legacyTemplates: Record<string, { title: string; translated: string; pattern: RegExp; render: (job: string) => string }> = {
  APPLICATION_RECEIVED: { title: "New application received", translated: "Có hồ sơ ứng tuyển mới", pattern: /^A candidate applied for ([\s\S]+)\.$/,
    render: job => `Một ứng viên đã ứng tuyển vị trí ${job}.` },
  OFFER_RECEIVED: { title: "New offer received", translated: "Bạn có thư mời nhận việc mới", pattern: /^You received an offer for ([\s\S]+)\.$/,
    render: job => `Bạn nhận được thư mời nhận việc cho vị trí ${job}.` },
  OFFER_ACCEPTED: { title: "Offer accepted", translated: "Ứng viên đã chấp nhận thư mời nhận việc", pattern: /^The candidate accepted the offer for ([\s\S]+)\.$/,
    render: job => `Ứng viên đã chấp nhận thư mời nhận việc cho vị trí ${job}.` },
  OFFER_DECLINED: { title: "Offer declined", translated: "Ứng viên đã từ chối thư mời nhận việc", pattern: /^The candidate declined the offer for ([\s\S]+)\.$/,
    render: job => `Ứng viên đã từ chối thư mời nhận việc cho vị trí ${job}.` },
};

/** Translate only known system templates; job titles and message content belong to users. */
export function notificationPresentation(notification: Pick<InboxNotification, "type" | "title" | "body" | "metadata">): { title: string; body: string } {
  const { type, title, body } = notification;
  const template = legacyTemplates[type];
  if (template && title === template.title) {
    const match = template.pattern.exec(body);
    return { title: template.translated, body: match ? template.render(match[1]) : body };
  }
  if (type === "APPLICATION_STATUS_CHANGED" && title === "Application status updated") {
    const match = /^The application for ([\s\S]+) is now ([A-Z_]+)\.$/.exec(body);
    const status = match ? applicationStatusLabel(match[2]) : "";
    return { title: "Trạng thái hồ sơ ứng tuyển đã cập nhật", body: match
      ? status === "Chưa rõ trạng thái" ? `Hồ sơ ứng tuyển vị trí ${match[1]} vừa được cập nhật.`
        : `Hồ sơ ứng tuyển vị trí ${match[1]} đã chuyển sang trạng thái: ${status}.` : body };
  }
  if (type === "INTERVIEW_SCHEDULED" && title === "Interview scheduled")
    return { title: "Lịch phỏng vấn mới", body: body === "A new interview has been scheduled. Open the app for details."
      ? "Bạn có lịch phỏng vấn mới. Mở chi tiết để xem thời gian và địa điểm." : body };
  if (type === "VIDEO_CALL_OFFLINE" && body === "Người nhận hiện không online để nhận cuộc gọi.")
    return { title, body: "Người nhận hiện không trực tuyến để nhận cuộc gọi." };
  if (type === "VIDEO_CALL_ENDED" && /^\[CALL_ENDED\](?:\s|$)/.test(body))
    return { title: "Cuộc gọi video đã kết thúc", body: "Cuộc gọi đã kết thúc." };
  return { title, body };
}
