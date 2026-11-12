import { ApiClientError, requestApi, toUserMessage } from "./apiClientCore";

export type InterviewMode = "OFFLINE" | "ONLINE";

export type InterviewStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "RESCHEDULE_REQUESTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | string;

export interface Interview {
  id: string;
  applicationId: string;
  jobId?: string;
  companyId?: string;
  candidateId?: string;
  interviewerId?: string;
  roundNumber: number;
  scheduleRevision?: number;
  supersedesInterviewId?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  timeZone: string;
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  roomUrl?: string | null;
  notes?: string | null;
  status: InterviewStatus;
  confirmedAt?: string | null;
  rescheduleReason?: string | null;
  reschedulePreferredSlots?: string[];
  cancelReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string;
  version?: number;
}

export interface InterviewPage {
  items: Interview[];
  nextCursor: string | null;
  asOf?: string;
}

export interface ScheduleInterview {
  applicationId: string;
  requestId: string;
  roundNumber: number;
  scheduledStart: string;
  timeZone: "Asia/Ho_Chi_Minh";
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  notes: string | null;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface AvailabilityResponse {
  applicationId: string;
  interviewerId: string;
  from: string;
  to: string;
  timeZone: string;
  durationMinutes: number;
  stepMinutes: number;
  slots: AvailabilitySlot[];
  nextCursor: string | null;
  asOf: string;
}

export interface JoinInterviewRoomResponse {
  token: string;
  livekit_url: string;
  room_name: string;
  room_url: string;
  interview: Interview;
}

export interface InterviewFeedbackCriteriaScores {
  technical: number;
  communication: number;
  attitude: number;
  cultureFit: number;
}

export type FeedbackConclusion = "PASS" | "FAIL" | "NEXT_ROUND";

export interface SubmitInterviewFeedbackPayload {
  criteriaScores: InterviewFeedbackCriteriaScores;
  overallScore: number;
  comment: string;
  conclusion: FeedbackConclusion;
}

export interface InterviewFeedback {
  id: string;
  interviewId: string;
  evaluatorId: string;
  criteriaScores: InterviewFeedbackCriteriaScores;
  overallScore: number;
  comment: string;
  conclusion: FeedbackConclusion;
  suggestedApplicationAction: string;
  createdAt: string;
}

export function interviewStartGmt7(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error("Chọn ngày và giờ phỏng vấn hợp lệ.");
  }
  const value = local + ":00+07:00";
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== local
  ) {
    throw new Error("Ngày và giờ phỏng vấn không hợp lệ.");
  }
  return value;
}

export function listMyInterviews(cursor: string | null, signal?: AbortSignal) {
  return requestApi<InterviewPage>("/api/interviews/my", {
    privateData: true,
    signal,
    query: { view: "ALL", limit: 20, cursor },
  });
}

export function listApplicationInterviews(
  applicationId: string,
  cursor: string | null = null,
  signal?: AbortSignal
) {
  return requestApi<InterviewPage>("/api/interviews", {
    privateData: true,
    signal,
    query: { applicationId, limit: 20, cursor },
  });
}

export function listCompanyCalendar(
  from: string,
  to: string,
  cursor: string | null = null,
  signal?: AbortSignal
) {
  return requestApi<InterviewPage>("/api/interviews/calendar", {
    privateData: true,
    signal,
    query: { from, to, limit: 50, cursor },
  });
}

export function getInterviewAvailability(
  applicationId: string,
  from: string,
  to: string,
  durationMinutes: number,
  signal?: AbortSignal
) {
  return requestApi<AvailabilityResponse>("/api/interviews/availability", {
    privateData: true,
    signal,
    query: {
      applicationId,
      from,
      to,
      timeZone: "Asia/Ho_Chi_Minh",
      durationMinutes,
      limit: 30,
    },
  });
}

export function getInterviewDetail(interviewId: string, signal?: AbortSignal) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}`, {
    privateData: true,
    signal,
  });
}

export function scheduleInterview(body: ScheduleInterview) {
  return requestApi<Interview>("/api/interviews", {
    method: "POST",
    body,
    privateData: true,
    maxRetries: 0,
  });
}

export function confirmInterview(interviewId: string) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}/confirm`, {
    method: "PATCH",
    privateData: true,
    maxRetries: 0,
  });
}

export function requestRescheduleInterview(
  interviewId: string,
  body: { reason: string; preferredSlots: string[] }
) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}/reschedule`, {
    method: "PATCH",
    body,
    privateData: true,
    maxRetries: 0,
  });
}

export function rescheduleInterviewByRecruiter(
  interviewId: string,
  body: {
    requestId?: string;
    scheduledStart: string;
    timeZone: "Asia/Ho_Chi_Minh";
    durationMinutes: number;
    mode: InterviewMode;
    location?: string | null;
    notes?: string | null;
    reason?: string;
  }
) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}/reschedule`, {
    method: "PATCH",
    body,
    privateData: true,
    maxRetries: 0,
  });
}

export function cancelInterview(interviewId: string, reason: string) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}/cancel`, {
    method: "PATCH",
    body: { reason },
    privateData: true,
    maxRetries: 0,
  });
}

export function joinInterviewRoom(
  interviewId: string,
  body: { display_name?: string; avatar_url?: string } = {},
  signal?: AbortSignal
) {
  return requestApi<JoinInterviewRoomResponse>(
    `/api/interviews/${encodeURIComponent(interviewId)}/join`,
    {
      method: "POST",
      body,
      privateData: true,
      signal,
      maxRetries: 0,
    }
  );
}

export function leaveInterviewRoom(interviewId: string) {
  return requestApi<Interview>(`/api/interviews/${encodeURIComponent(interviewId)}/leave`, {
    method: "POST",
    privateData: true,
    maxRetries: 0,
  });
}

export function submitInterviewFeedback(
  interviewId: string,
  body: SubmitInterviewFeedbackPayload
) {
  return requestApi<InterviewFeedback>(
    `/api/interviews/${encodeURIComponent(interviewId)}/feedback`,
    {
      method: "PATCH",
      body,
      privateData: true,
      maxRetries: 0,
    }
  );
}

export function getInterviewFeedback(interviewId: string, signal?: AbortSignal) {
  return requestApi<InterviewFeedback>(
    `/api/interviews/${encodeURIComponent(interviewId)}/feedback`,
    {
      privateData: true,
      signal,
    }
  );
}

export function interviewStatusLabel(status: string): string {
  return (
    ({
      SCHEDULED: "Đã lên lịch",
      CONFIRMED: "Đã xác nhận",
      IN_PROGRESS: "Đang phỏng vấn",
      COMPLETED: "Đã hoàn thành",
      RESCHEDULE_REQUESTED: "Đề nghị đổi lịch",
      CANCELLED: "Đã hủy",
      NO_SHOW: "Vắng mặt",
    } as Record<string, string>)[status] ?? "Đang cập nhật"
  );
}

export function feedbackConclusionLabel(conclusion: string): string {
  return (
    ({
      PASS: "Đạt — Đề xuất gửi Offer",
      FAIL: "Chưa phù hợp — Từ chối",
      NEXT_ROUND: "Đạt vòng này — Lên lịch vòng tiếp",
    } as Record<string, string>)[conclusion] ?? conclusion
  );
}

export function schedulingRequestIdentity(
  previous: { fingerprint: string; id: string } | null,
  payload: Omit<ScheduleInterview, "requestId">,
  createId: () => string
): { fingerprint: string; id: string } {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, id: createId() };
}

export function interviewScheduleError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      INTERVIEW_CANDIDATE_CONFLICT:
        "Ứng viên đã có lịch trùng giờ. Hãy chọn thời gian khác.",
      INTERVIEW_INTERVIEWER_CONFLICT:
        "Bạn đã có lịch phỏng vấn trùng giờ. Hãy chọn thời gian khác.",
      INTERVIEW_SCHEDULE_CONFLICT:
        "Khung giờ vừa được sử dụng. Hãy kiểm tra lịch và chọn thời gian khác.",
      INTERVIEW_ROUND_ALREADY_SCHEDULED:
        "Vòng phỏng vấn này đã có lịch. Hãy kiểm tra trước khi tạo vòng tiếp theo.",
      IDEMPOTENCY_CONFLICT:
        "Nội dung lịch đã thay đổi. Hãy kiểm tra thông tin rồi gửi lại.",
      INTERVIEW_IDEMPOTENCY_CONFLICT:
        "Nội dung lịch đã thay đổi. Hãy kiểm tra thông tin rồi gửi lại.",
      APPLICATION_NOT_SCHEDULABLE:
        "Trạng thái hồ sơ đã thay đổi. Hãy quay về hồ sơ và kiểm tra lại.",
      APPLICATION_NOT_ELIGIBLE_FOR_INTERVIEW:
        "Trạng thái hồ sơ đã thay đổi. Hãy quay về hồ sơ và kiểm tra lại.",
      INTERVIEW_CANCEL_TOO_LATE:
        "Chỉ có thể hủy lịch trước giờ phỏng vấn ít nhất 2 tiếng.",
      INTERVIEW_JOIN_TOO_EARLY:
        "Phòng phỏng vấn trực tuyến chỉ mở trước giờ hẹn 15 phút.",
      INTERVIEW_JOIN_WINDOW_EXPIRED:
        "Khung giờ tham gia phòng phỏng vấn trực tuyến đã kết thúc.",
    };
    return messages[error.code] ?? toUserMessage(error);
  }
  return error instanceof Error ? error.message : toUserMessage(error);
}
