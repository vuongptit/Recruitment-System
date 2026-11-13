import assert from "node:assert/strict";
import test from "node:test";
import { notificationPresentation } from "./notificationPresentation";
import { applicationStatusLabel, jobStatusLabel, jobTypeLabel, offerStatusLabel } from "./recruitmentLabels";

test("legacy system notifications are translated without changing job titles or source data", () => {
  const cases = [
    ["APPLICATION_RECEIVED", "New application received", "A candidate applied for Senior Backend Engineer.", "Một ứng viên đã ứng tuyển vị trí Senior Backend Engineer."],
    ["OFFER_RECEIVED", "New offer received", "You received an offer for Senior Backend Engineer.", "Bạn nhận được thư mời nhận việc cho vị trí Senior Backend Engineer."],
    ["OFFER_ACCEPTED", "Offer accepted", "The candidate accepted the offer for Senior Backend Engineer.", "Ứng viên đã chấp nhận thư mời nhận việc cho vị trí Senior Backend Engineer."],
    ["OFFER_DECLINED", "Offer declined", "The candidate declined the offer for Senior Backend Engineer.", "Ứng viên đã từ chối thư mời nhận việc cho vị trí Senior Backend Engineer."],
  ];
  for (const [type, title, body, expected] of cases) {
    const notification = Object.freeze({ type, title, body, metadata: Object.freeze({ application_id: "application-id" }) });
    const localized = notificationPresentation(notification);
    assert.equal(localized.body, expected);
    assert.notEqual(localized.title, title);
    assert.equal(notification.body, body);
    assert.equal(notification.metadata.application_id, "application-id");
  }
});

test("application status labels replace raw codes while preserving legacy job titles containing punctuation", () => {
  const source = { type: "APPLICATION_STATUS_CHANGED", title: "Application status updated", body: "The application for Backend is now Remote. R&D is now REVIEWING." };
  assert.equal(notificationPresentation(source).body, "Hồ sơ ứng tuyển vị trí Backend is now Remote. R&D đã chuyển sang trạng thái: Đang xem xét.");
  const unknown = notificationPresentation({ ...source, body: "The application for Backend is now FUTURE_STATUS." });
  assert.equal(unknown.body, "Hồ sơ ứng tuyển vị trí Backend vừa được cập nhật.");
});

test("interview and call system messages are localized; user and custom messages remain intact", () => {
  assert.equal(notificationPresentation({ type: "INTERVIEW_SCHEDULED", title: "Interview scheduled", body: "A new interview has been scheduled. Open the app for details." }).title, "Lịch phỏng vấn mới");
  assert.equal(notificationPresentation({ type: "VIDEO_CALL_ENDED", title: "Cuộc gọi video đã kết thúc", body: "[CALL_ENDED] private-call-id" }).body, "Cuộc gọi đã kết thúc.");
  for (const source of [
    { type: "new_message", title: "Tin nhắn mới", body: "Please bring your CV. Java & TypeScript." },
    { type: "CUSTOM", title: "Feedback from HR", body: "A candidate applied for Team Lead." },
    { type: "OFFER_RECEIVED", title: "Bạn có thư mời nhận việc mới", body: "Thư mời do nhà tuyển dụng cập nhật." },
  ]) assert.deepEqual(notificationPresentation(source), { title: source.title, body: source.body });
});

test("recruitment enums have consistent Vietnamese labels and never expose an unknown internal code", () => {
  assert.equal(jobTypeLabel("Full-time"), "Toàn thời gian");
  assert.equal(jobTypeLabel("REMOTE"), "Làm việc từ xa");
  assert.equal(jobStatusLabel("PUBLISHED"), "Đang tuyển");
  assert.equal(applicationStatusLabel("REVIEWING"), "Đang xem xét");
  assert.equal(offerStatusLabel("ACCEPTED"), "Đã chấp nhận");
  for (const label of [jobStatusLabel, applicationStatusLabel, offerStatusLabel, jobTypeLabel])
    assert.doesNotMatch(label("FUTURE_INTERNAL_CODE"), /FUTURE_INTERNAL_CODE/);
});
