package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"

	"interview-service/internal/apierror"
	"interview-service/internal/client"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
)

type SchedulingRepository interface {
	FindByScheduledByAndRequestID(ctx context.Context, scheduledBy, requestID uuid.UUID) (*model.Interview, error)
	CreateWithOutbox(ctx context.Context, iv *model.Interview, topic string, occurredAt time.Time) (*model.Interview, bool, error)
}

type CompanyVerifier interface {
	VerifyActiveRecruiterContext(ctx context.Context, authorizationHeader string) (*client.RecruiterContext, error)
}

type ApplicationVerifier interface {
	GetSchedulingContext(ctx context.Context, applicationID uuid.UUID, authorizationHeader string) (*client.ApplicationSchedulingContext, error)
}

type SchedulingResult struct {
	Response model.InterviewResponse
	Created  bool
}

type SchedulingService struct {
	repo              SchedulingRepository
	companyClient     CompanyVerifier
	applicationClient ApplicationVerifier
	topic             string
	nowFunc           func() time.Time
}

func NewSchedulingService(
	repo SchedulingRepository,
	companyClient CompanyVerifier,
	applicationClient ApplicationVerifier,
	topic string,
) *SchedulingService {
	return &SchedulingService{
		repo:              repo,
		companyClient:     companyClient,
		applicationClient: applicationClient,
		topic:             topic,
		nowFunc:           time.Now,
	}
}

func (s *SchedulingService) ScheduleInterview(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	req model.CreateInterviewRequest,
) (*SchedulingResult, error) {
	if err := requireRecruiterRole(principal); err != nil {
		return nil, err
	}
	norm, err := normalizeCreateRequest(req, principal.Subject, s.nowFunc().UTC())
	if err != nil {
		return nil, err
	}

	recruiterCtx, err := s.companyClient.VerifyActiveRecruiterContext(ctx, authorizationHeader)
	if err != nil {
		return nil, err
	}
	if err := ensureAuthorizedRecruiterMatchesActor(principal, recruiterCtx); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByScheduledByAndRequestID(ctx, principal.Subject, norm.RequestID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing.CompanyID != recruiterCtx.CompanyID || existing.RequestHash != norm.RequestHash {
			return nil, apierror.NewStatus(http.StatusConflict, "IDEMPOTENCY_CONFLICT", "requestId was already used with a different interview payload", nil)
		}
		return &SchedulingResult{
			Response: model.ToInterviewResponse(existing),
			Created:  false,
		}, nil
	}

	appCtx, err := s.applicationClient.GetSchedulingContext(ctx, norm.ApplicationID, authorizationHeader)
	if err != nil {
		return nil, err
	}
	if appCtx.CompanyID != recruiterCtx.CompanyID {
		return nil, apierror.NewStatus(http.StatusNotFound, "APPLICATION_NOT_FOUND", "Application was not found", nil)
	}
	if appCtx.Status != "INTERVIEW" {
		return nil, apierror.NewStatus(http.StatusConflict, "APPLICATION_NOT_SCHEDULABLE", "Application status does not allow scheduling interviews", map[string]any{
			"applicationStatus": appCtx.Status,
		})
	}

	nowUTC := s.nowFunc().UTC().Truncate(time.Millisecond)
	interviewID := uuid.New()
	var roomURL *string
	if norm.Mode == model.ModeOnline {
		u := fmt.Sprintf("/interviews/%s/room", interviewID.String())
		roomURL = &u
	}

	entity := &model.Interview{
		ID:                          interviewID,
		ApplicationID:               appCtx.ApplicationID,
		ApplicationVersion:          appCtx.Version,
		ApplicationStatusAtSchedule: appCtx.Status,
		CompanyID:                   recruiterCtx.CompanyID,
		JobID:                       appCtx.JobID,
		CandidateID:                 appCtx.CandidateID,
		InterviewerID:               norm.InterviewerID,
		ScheduledBy:                 principal.Subject,
		RequestID:                   norm.RequestID,
		RequestHash:                 norm.RequestHash,
		RoundNumber:                 norm.RoundNumber,
		ScheduleRevision:            1,
		ScheduledStartAt:            norm.ScheduledStartAt,
		ScheduledEndAt:              norm.ScheduledEndAt,
		TimeZone:                    norm.TimeZone,
		DurationMinutes:             norm.DurationMinutes,
		Mode:                        norm.Mode,
		Location:                    norm.Location,
		RoomURL:                     roomURL,
		Notes:                       norm.Notes,
		Status:                      model.StatusScheduled,
		CreatedAt:                   nowUTC,
		UpdatedAt:                   nowUTC,
		Version:                     0,
	}

	saved, created, err := s.repo.CreateWithOutbox(ctx, entity, s.topic, nowUTC)
	if err != nil {
		return nil, err
	}
	if !created {
		if saved.CompanyID != recruiterCtx.CompanyID || saved.RequestHash != norm.RequestHash {
			return nil, apierror.NewStatus(http.StatusConflict, "IDEMPOTENCY_CONFLICT", "requestId was already used with a different interview payload", nil)
		}
	}
	return &SchedulingResult{
		Response: model.ToInterviewResponse(saved),
		Created:  created,
	}, nil
}

type normalizedScheduleInput struct {
	ApplicationID    uuid.UUID
	RequestID        uuid.UUID
	InterviewerID    uuid.UUID
	RoundNumber      int
	ScheduledStartAt time.Time
	ScheduledEndAt   time.Time
	TimeZone         string
	DurationMinutes  int
	Mode             model.InterviewMode
	Location         *string
	Notes            *string
	RequestHash      string
}

func normalizeCreateRequest(req model.CreateInterviewRequest, callerID uuid.UUID, now time.Time) (*normalizedScheduleInput, error) {
	fieldErrors := make(map[string]any)
	nowUTC := now.UTC().Truncate(time.Millisecond)

	var applicationID uuid.UUID
	if req.ApplicationID == nil || *req.ApplicationID == uuid.Nil {
		fieldErrors["applicationId"] = "applicationId is required"
	} else {
		applicationID = *req.ApplicationID
	}

	var requestID uuid.UUID
	if req.RequestID == nil || *req.RequestID == uuid.Nil {
		fieldErrors["requestId"] = "requestId is required"
	} else {
		requestID = *req.RequestID
	}

	interviewerID := callerID
	if req.InterviewerID != nil && *req.InterviewerID != uuid.Nil {
		interviewerID = *req.InterviewerID
	}

	if req.RoundNumber < 1 || req.RoundNumber > 20 {
		fieldErrors["roundNumber"] = "roundNumber must be between 1 and 20"
	}

	if req.DurationMinutes != 30 && req.DurationMinutes != 45 && req.DurationMinutes != 60 {
		fieldErrors["durationMinutes"] = "durationMinutes must be 30, 45, or 60"
	}

	timeZone := normalizeZoneId(req.TimeZone, fieldErrors)
	scheduledStartAt := normalizeScheduledStart(req.ScheduledStart, nowUTC, fieldErrors)
	mode := normalizeMode(req.Mode, fieldErrors)
	location := normalizeLocation(req.Location, mode, fieldErrors)
	notes := normalizeOptionalText("notes", req.Notes, 2000, fieldErrors)

	if len(fieldErrors) > 0 {
		return nil, apierror.ValidationFailed(fieldErrors)
	}

	scheduledEndAt := scheduledStartAt.Add(time.Duration(req.DurationMinutes) * time.Minute)
	locVal := ""
	if location != nil {
		locVal = *location
	}
	notesVal := ""
	if notes != nil {
		notesVal = *notes
	}

	hashInput := fmt.Sprintf(
		"%s|%d|%s|%s|%d|%s|%s|%s|%s",
		applicationID.String(),
		req.RoundNumber,
		model.FormatMillisUTC(scheduledStartAt),
		timeZone,
		req.DurationMinutes,
		string(mode),
		locVal,
		notesVal,
		interviewerID.String(),
	)
	sum := sha256.Sum256([]byte(hashInput))

	return &normalizedScheduleInput{
		ApplicationID:    applicationID,
		RequestID:        requestID,
		InterviewerID:    interviewerID,
		RoundNumber:      req.RoundNumber,
		ScheduledStartAt: scheduledStartAt,
		ScheduledEndAt:   scheduledEndAt,
		TimeZone:         timeZone,
		DurationMinutes:  req.DurationMinutes,
		Mode:             mode,
		Location:         location,
		Notes:            notes,
		RequestHash:      hex.EncodeToString(sum[:]),
	}, nil
}

func normalizeZoneId(raw string, fieldErrors map[string]any) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		fieldErrors["timeZone"] = "timeZone is required"
		return ""
	}
	if len(trimmed) > 100 || containsControlChars(trimmed) {
		fieldErrors["timeZone"] = "timeZone must be a valid IANA time zone"
		return ""
	}
	loc, err := time.LoadLocation(trimmed)
	if err != nil || loc == nil {
		fieldErrors["timeZone"] = "timeZone must be a valid IANA time zone"
		return ""
	}
	return loc.String()
}

func normalizeScheduledStart(raw string, nowUTC time.Time, fieldErrors map[string]any) time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		fieldErrors["scheduledStart"] = "scheduledStart is required"
		return time.Time{}
	}
	if !hasExplicitOffset(trimmed) {
		fieldErrors["scheduledStart"] = "scheduledStart must be an ISO-8601 timestamp with an explicit timezone offset"
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339Nano, trimmed)
	if err != nil {
		fieldErrors["scheduledStart"] = "scheduledStart must be an ISO-8601 timestamp with an explicit timezone offset"
		return time.Time{}
	}
	normalized := parsed.UTC().Truncate(time.Millisecond)
	if !normalized.After(nowUTC) {
		fieldErrors["scheduledStart"] = "scheduledStart must be in the future"
		return time.Time{}
	}
	if normalized.After(nowUTC.Add(365 * 24 * time.Hour)) {
		fieldErrors["scheduledStart"] = "scheduledStart must be within 365 days"
		return time.Time{}
	}
	return normalized
}

func normalizeMode(raw string, fieldErrors map[string]any) model.InterviewMode {
	trimmed := strings.ToUpper(strings.TrimSpace(raw))
	if trimmed == "" {
		fieldErrors["mode"] = "mode is required"
		return ""
	}
	switch model.InterviewMode(trimmed) {
	case model.ModeOffline:
		return model.ModeOffline
	case model.ModeOnline:
		return model.ModeOnline
	default:
		fieldErrors["mode"] = "mode must be OFFLINE or ONLINE"
		return ""
	}
}

func normalizeLocation(raw *string, mode model.InterviewMode, fieldErrors map[string]any) *string {
	if mode == model.ModeOnline {
		return nil
	}
	trimmed := ""
	if raw != nil {
		trimmed = strings.TrimSpace(*raw)
	}
	if trimmed == "" {
		fieldErrors["location"] = "location is required for offline interviews"
		return nil
	}
	if len(trimmed) > 500 {
		fieldErrors["location"] = "location must be at most 500 characters"
		return nil
	}
	if containsControlChars(trimmed) {
		fieldErrors["location"] = "location must not contain control characters"
		return nil
	}
	return &trimmed
}

func normalizeOptionalText(field string, raw *string, maxLen int, fieldErrors map[string]any) *string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	if len(trimmed) > maxLen {
		fieldErrors[field] = fmt.Sprintf("%s must be at most %d characters", field, maxLen)
		return nil
	}
	if containsControlChars(trimmed) {
		fieldErrors[field] = fmt.Sprintf("%s must not contain control characters", field)
		return nil
	}
	return &trimmed
}

func hasExplicitOffset(s string) bool {
	tIdx := strings.IndexAny(s, "Tt")
	if tIdx < 0 || tIdx == len(s)-1 {
		return false
	}
	timePart := s[tIdx+1:]
	return strings.HasSuffix(timePart, "Z") ||
		strings.HasSuffix(timePart, "z") ||
		strings.Contains(timePart, "+") ||
		strings.Contains(timePart, "-")
}

func containsControlChars(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

func requireRecruiterRole(principal *middleware.Principal) error {
	if principal == nil {
		return apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil)
	}
	if principal.Role != "RECRUITER" {
		return apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Only recruiters can perform this action", nil)
	}
	return nil
}

func ensureAuthorizedRecruiterMatchesActor(principal *middleware.Principal, recruiterCtx *client.RecruiterContext) error {
	if recruiterCtx == nil || recruiterCtx.UserID != principal.Subject {
		return apierror.NewStatus(http.StatusForbidden, "RECRUITER_CONTEXT_MISMATCH", "Recruiter authorization context did not match caller identity", nil)
	}
	if principal.CompanyID != nil && *principal.CompanyID != recruiterCtx.CompanyID {
		return apierror.NewStatus(http.StatusForbidden, "RECRUITER_COMPANY_MISMATCH", "Token company claim did not match active recruiter membership", nil)
	}
	return nil
}
