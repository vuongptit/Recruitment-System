import type { JobStatus } from "./person2Api";

export type RecruiterJobAction = "SUBMIT_FOR_APPROVAL" | "CLOSE" | "REOPEN";

export function recruiterJobActions(status: JobStatus): RecruiterJobAction[] {
  if (status === "DRAFT") return ["SUBMIT_FOR_APPROVAL"];
  if (status === "PUBLISHED") return ["CLOSE"];
  if (status === "CLOSED") return ["REOPEN"];
  return [];
}

export function recruiterJobActionLabel(action: RecruiterJobAction): string {
  if (action === "REOPEN") return "Khôi phục về bản nháp";
  return action === "SUBMIT_FOR_APPROVAL" ? "Gửi quản trị viên duyệt" : "Đóng tin";
}

export function nextRecruiterJobStatus(action: RecruiterJobAction): JobStatus {
  if (action === "REOPEN") return "DRAFT";
  return action === "SUBMIT_FOR_APPROVAL" ? "PENDING_APPROVAL" : "CLOSED";
}

export function isRejectedRecruiterJob(status: JobStatus, rejectionReason?: string): boolean {
  return status === "DRAFT" && Boolean(rejectionReason?.trim());
}

export function recruiterJobEditLabel(status: JobStatus, rejectionReason?: string): string {
  return isRejectedRecruiterJob(status, rejectionReason) ? "Sửa theo góp ý" : "Sửa tin";
}
