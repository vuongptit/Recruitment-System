import { ApiClientError } from "./apiClientCore";

export type RecruiterJobScopeRole = "OWNER" | "MEMBER";

export interface RecruiterJobScopeView {
  label: string;
  description: string;
  tone: "success" | "info";
}

export function recruiterJobScopeView(role: RecruiterJobScopeRole): RecruiterJobScopeView {
  if (role === "OWNER") {
    return {
      label: "Chủ sở hữu · Toàn công ty",
      description: "Bạn đang xem mọi tin tuyển dụng thuộc công ty và có toàn quyền quản lý.",
      tone: "success",
    };
  }
  return {
    label: "Thành viên · Toàn công ty",
    description: "Bạn có thể xem mọi tin tuyển dụng của công ty và quản lý những tin do bạn tạo.",
    tone: "info",
  };
}

export function isRecruiterJobAccessDenied(error: unknown): boolean {
  return error instanceof ApiClientError
    && error.status === 403
    && error.code === "JOB_ACCESS_DENIED";
}
