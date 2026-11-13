const jobStatuses: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  PUBLISHED: "Đang tuyển",
  CLOSED: "Đã đóng",
  EXPIRED: "Hết hạn",
  REJECTED: "Đã từ chối",
  SUSPENDED: "Đã gỡ",
};

const applicationStatuses: Record<string, string> = {
  APPLIED: "Đã ứng tuyển",
  REVIEWING: "Đang xem xét",
  INTERVIEW: "Phỏng vấn",
  OFFER: "Thư mời nhận việc",
  HIRED: "Đã nhận việc",
  REJECTED: "Đã từ chối",
  WITHDRAWN: "Đã rút trước đây",
};

const offerStatuses: Record<string, string> = {
  PENDING_CANDIDATE_RESPONSE: "Chờ phản hồi",
  SENT: "Đã gửi",
  ACCEPTED: "Đã chấp nhận",
  DECLINED: "Đã từ chối",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã thu hồi",
};

const jobTypes: Record<string, string> = {
  FULLTIME: "Toàn thời gian",
  FULL_TIME: "Toàn thời gian",
  PARTTIME: "Bán thời gian",
  PART_TIME: "Bán thời gian",
  REMOTE: "Làm việc từ xa",
  INTERNSHIP: "Thực tập",
  CONTRACT: "Hợp đồng",
  ONSITE: "Làm việc tại văn phòng",
  HYBRID: "Kết hợp tại văn phòng và từ xa",
};

function key(value: string): string { return value.trim().toUpperCase().replace(/[ -]+/g, "_"); }

export function jobStatusLabel(status: string): string {
  return jobStatuses[key(status)] ?? "Chưa rõ trạng thái";
}

export function applicationStatusLabel(status: string): string {
  return applicationStatuses[key(status)] ?? "Chưa rõ trạng thái";
}

export function offerStatusLabel(status: string): string {
  return offerStatuses[key(status)] ?? "Chưa rõ trạng thái";
}

export function jobTypeLabel(type: string): string {
  return jobTypes[key(type)] ?? "Chưa rõ hình thức làm việc";
}

export function companyMemberRoleLabel(role: "OWNER" | "MEMBER" | null | undefined): string {
  return role === "OWNER" ? "Chủ sở hữu" : role === "MEMBER" ? "Thành viên" : "Đang xác định";
}
