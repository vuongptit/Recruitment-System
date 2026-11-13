import type { ApplicationStatus } from "./demoData";

export type RecruiterApplicationAction =
  | { kind: "STATUS"; status: "REVIEWING" | "INTERVIEW" | "REJECTED"; label: string; requiresReason: boolean }
  | { kind: "SEND_OFFER"; label: string };

export type CandidateApplicationAction = { kind: "RESPOND_OFFER"; label: string };

const RECRUITER_ACTIONS: Record<ApplicationStatus, RecruiterApplicationAction[]> = {
  APPLIED: [
    { kind: "STATUS", status: "REVIEWING", label: "Bắt đầu xem xét", requiresReason: false },
    { kind: "STATUS", status: "REJECTED", label: "Từ chối", requiresReason: true },
  ],
  REVIEWING: [
    { kind: "STATUS", status: "INTERVIEW", label: "Chuyển phỏng vấn", requiresReason: false },
    { kind: "STATUS", status: "REJECTED", label: "Từ chối", requiresReason: true },
  ],
  INTERVIEW: [
    { kind: "SEND_OFFER", label: "Soạn thư mời nhận việc" },
    { kind: "STATUS", status: "REJECTED", label: "Từ chối", requiresReason: true },
  ],
  OFFER: [{ kind: "STATUS", status: "REJECTED", label: "Thu hồi và từ chối", requiresReason: true }],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function recruiterApplicationActions(status: ApplicationStatus): RecruiterApplicationAction[] {
  return RECRUITER_ACTIONS[status];
}

export function candidateApplicationActions(status: ApplicationStatus): CandidateApplicationAction[] {
  // Submitted applications are retained by both parties. Offer decisions use
  // the offer endpoint, never a withdrawal or a direct application transition.
  return status === "OFFER"
    ? [{ kind: "RESPOND_OFFER", label: "Phản hồi thư mời nhận việc" }]
    : [];
}

export const APPLICATION_STAGES = ["APPLIED", "REVIEWING", "INTERVIEW", "OFFER", "HIRED"] as const;
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [...APPLICATION_STAGES, "REJECTED", "WITHDRAWN"];
export type ApplicationStage = typeof APPLICATION_STAGES[number];
export type PipelineViewer = "CANDIDATE" | "RECRUITER";
export interface ApplicationTimelineEntry {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  changedAt: string;
}

export function isApplicationTerminal(status: ApplicationStatus): boolean {
  return status === "HIRED" || status === "REJECTED" || status === "WITHDRAWN";
}

/** A rejected/legacy-withdrawn record stops at its last recorded stage.
 * Without history, do not imply that it reached review or interview. */
export function applicationProgress(status: ApplicationStatus, timeline?: readonly ApplicationTimelineEntry[]) {
  const recorded = new Set<string>();
  for (const entry of timeline ?? []) {
    if (entry.fromStatus) recorded.add(entry.fromStatus);
    recorded.add(entry.toStatus);
  }
  const activeIndex = APPLICATION_STAGES.findIndex((stage) => stage === status);
  const lastRecordedIndex = Math.max(-1, ...APPLICATION_STAGES.map((stage, index) => recorded.has(stage) ? index : -1));
  return APPLICATION_STAGES.map((stage, index) => ({
    status: stage,
    state: activeIndex >= 0
      ? index < activeIndex ? "passed" as const : index === activeIndex ? "current" as const : "upcoming" as const
      : index <= lastRecordedIndex ? "recorded" as const : "upcoming" as const,
  }));
}

const CANDIDATE_GUIDANCE: Record<ApplicationStatus, string> = {
  APPLIED: "Hồ sơ đã được gửi. Nhà tuyển dụng chưa bắt đầu bước xem xét trên hệ thống.",
  REVIEWING: "Nhà tuyển dụng đang xem xét hồ sơ. Bạn có thể theo dõi cập nhật tại đây.",
  INTERVIEW: "Hồ sơ đã chuyển sang vòng phỏng vấn. Mở lịch phỏng vấn để kiểm tra và phản hồi lịch hẹn; bước này chưa xác nhận đã có lịch.",
  OFFER: "Mở thư mời để kiểm tra điều kiện, hạn phản hồi và chấp nhận hoặc từ chối. Thư mời có thể đã hết hạn hoặc được thu hồi.",
  HIRED: "Bạn đã chấp nhận thư mời nhận việc. Liên hệ công ty để thống nhất bước tiếp theo.",
  REJECTED: "Quá trình xét tuyển đã kết thúc. Xem lịch sử và thư mời liên quan để biết kết quả xử lý.",
  WITHDRAWN: "Hồ sơ đã rút theo quy trình trước đây. Lịch sử vẫn được lưu để hai bên đối chiếu.",
};
const RECRUITER_GUIDANCE: Record<ApplicationStatus, string> = {
  APPLIED: "Xem CV, sau đó bắt đầu xem xét hoặc từ chối kèm lý do. Mở chi tiết không tự chuyển trạng thái hồ sơ.",
  REVIEWING: "Đánh giá hồ sơ, chuyển sang vòng phỏng vấn khi phù hợp hoặc từ chối kèm lý do.",
  INTERVIEW: "Quản lý lịch hẹn và kết quả phỏng vấn. Khi đã thống nhất, gửi thư mời nhận việc cho ứng viên.",
  OFFER: "Theo dõi thư mời và phản hồi của ứng viên. Chấp nhận thư mời sẽ chuyển hồ sơ sang nhận việc; từ chối thư mời sẽ kết thúc xét tuyển.",
  HIRED: "Ứng viên đã chấp nhận thư mời. Hồ sơ đã kết thúc xét tuyển trên hệ thống.",
  REJECTED: "Hồ sơ đã kết thúc xét tuyển. Giữ lịch sử và lý do để đối chiếu với ứng viên.",
  WITHDRAWN: "Hồ sơ đã rút theo quy trình trước đây. Không tiếp tục chuyển bước hồ sơ này.",
};

export function applicationGuidance(status: ApplicationStatus, viewer: PipelineViewer): string {
  return (viewer === "CANDIDATE" ? CANDIDATE_GUIDANCE : RECRUITER_GUIDANCE)[status];
}

export function formatApplicationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa có thời gian" : date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
  });
}

export function validateRecruiterApplicationStatus(
  currentStatus: ApplicationStatus,
  targetStatus: ApplicationStatus,
  reason?: string,
): string | null {
  const action = recruiterApplicationActions(currentStatus).find(
    (candidate) => candidate.kind === "STATUS" && candidate.status === targetStatus,
  );
  if (!action || action.kind !== "STATUS") return "Chuyển trạng thái này không hợp lệ.";
  if (action.requiresReason && !reason?.trim()) return "Vui lòng nhập lý do từ chối hồ sơ.";
  return null;
}
