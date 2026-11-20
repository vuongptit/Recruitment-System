export const auditOutcomes: Record<string, string> = {
  SUCCESS: "Thành công",
  SUCCEEDED: "Thành công",
  FAILED: "Thất bại",
  FAILURE: "Thất bại",
  PENDING: "Đang xử lý",
  STARTED: "Đã bắt đầu",
  UNKNOWN: "Chưa xác định kết quả",
};
export const auditActions: Record<string, string> = {
  LOCK_USER: "Khóa tài khoản",
  UNLOCK_USER: "Mở khóa tài khoản",
  APPROVE_JOB: "Duyệt tin",
  REJECT_JOB: "Từ chối tin",
  VERIFY_COMPANY: "Xác minh công ty",
  RESOLVE_REPORT: "Xử lý báo cáo",
  DISMISS_REPORT: "Bỏ qua báo cáo",
  HANDLE_REPORT: "Xử lý báo cáo",
  SUSPEND_JOB: "Gỡ tin tuyển dụng",
  RESTORE_JOB: "Khôi phục tin tuyển dụng",
  SUSPEND_COMPANY: "Đình chỉ công ty",
  RESTORE_COMPANY: "Khôi phục công ty",
};
export const auditTitle = (row: Record<string, unknown>) =>
  auditActions[String(row.action)] || "Hoạt động quản trị";
