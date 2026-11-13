package service

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"interview-service/internal/apierror"
	"interview-service/internal/cursor"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"interview-service/internal/repository"
)

const (
	DefaultLimit         = 20
	MaxLimit             = 50
	DefaultCalendarLimit = 50
	MaxCalendarLimit     = 100
	DefaultSlotLimit     = 20
	MaxSlotLimit         = 50
	SlotStepMinutes      = 15
	MaxCalendarWindow    = 31 * 24 * time.Hour
	MaxAvailabilityWin   = 14 * 24 * time.Hour
	MaxRangeSpan         = 93 * 24 * time.Hour
)

type QueryRepositoryInterface interface {
	FindDetail(ctx context.Context, id uuid.UUID, visibility repository.VisibilityScope) (*model.Interview, error)
	FindPage(ctx context.Context, visibility repository.VisibilityScope, filters repository.QueryFilters, position *cursor.KeysetPosition, ascending bool, limit int, asOf time.Time) ([]*model.Interview, error)
	FindBusyIntervals(ctx context.Context, interviewerID, candidateID uuid.UUID, from, to time.Time) ([]repository.BusyInterval, error)
}

type QueryService struct {
	repo              QueryRepositoryInterface
	companyClient     CompanyVerifier
	applicationClient ApplicationVerifier
	cursorCodec       *cursor.Codec
	nowFunc           func() time.Time
}

func NewQueryService(
	repo QueryRepositoryInterface,
	companyClient CompanyVerifier,
	applicationClient ApplicationVerifier,
	cursorCodec *cursor.Codec,
) *QueryService {
	return &QueryService{
		repo:              repo,
		companyClient:     companyClient,
		applicationClient: applicationClient,
		cursorCodec:       cursorCodec,
		nowFunc:           time.Now,
	}
}

func (s *QueryService) GetInterviewDetail(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewIDRaw string,
) (model.QueryItem, error) {
	scope, err := s.resolveAccessScope(ctx, principal, authorizationHeader)
	if err != nil {
		return model.QueryItem{}, err
	}
	fieldErrors := make(map[string]any)
	interviewID := parseRequiredUUID("id", interviewIDRaw, fieldErrors)
	if len(fieldErrors) > 0 {
		return model.QueryItem{}, apierror.ValidationFailed(fieldErrors)
	}

	iv, err := s.repo.FindDetail(ctx, interviewID, scope.visibility)
	if err != nil {
		return model.QueryItem{}, err
	}
	if iv == nil {
		return model.QueryItem{}, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	return model.ToQueryItem(iv, scope.role, true), nil
}

type ApplicationInterviewsQuery struct {
	ApplicationID string
	Statuses      []string
	RoundNumber   string
	Limit         string
	Cursor        string
}

func (s *QueryService) ListApplicationInterviews(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	q ApplicationInterviewsQuery,
) (model.QueryPage, error) {
	scope, err := s.resolveAccessScope(ctx, principal, authorizationHeader)
	if err != nil {
		return model.QueryPage{}, err
	}

	fieldErrors := make(map[string]any)
	appID := parseRequiredUUID("applicationId", q.ApplicationID, fieldErrors)
	statuses := parseStatuses(q.Statuses, fieldErrors)
	roundNumber := parseOptionalRound(q.RoundNumber, fieldErrors)
	limit := parseLimit(q.Limit, DefaultLimit, MaxLimit, fieldErrors)
	if len(fieldErrors) > 0 {
		return model.QueryPage{}, apierror.ValidationFailed(fieldErrors)
	}

	filters := repository.QueryFilters{
		ApplicationID: &appID,
		Statuses:      statuses,
		RoundNumber:   roundNumber,
	}

	fingerprint := cursor.Fingerprint(map[string]string{
		"endpoint":      "application-interviews",
		"role":          scope.role,
		"visibility":    scope.visibilityKey(),
		"applicationId": appID.String(),
		"status":        joinStatuses(statuses),
		"roundNumber":   intPtrString(roundNumber),
		"sort":          "scheduledStart:asc,id:asc",
	})

	return s.executePageQuery(ctx, scope, filters, true, limit, q.Cursor, fingerprint)
}

type MyInterviewsQuery struct {
	View          string
	Statuses      []string
	Mode          string
	From          string
	To            string
	ApplicationID string
	JobID         string
	Limit         string
	Cursor        string
}

func (s *QueryService) ListMyInterviews(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	q MyInterviewsQuery,
) (model.QueryPage, error) {
	scope, err := s.resolveAccessScope(ctx, principal, authorizationHeader)
	if err != nil {
		return model.QueryPage{}, err
	}
	nowUTC := s.nowFunc().UTC().Truncate(time.Millisecond)

	fieldErrors := make(map[string]any)
	view := parseView(q.View, fieldErrors)
	statuses := parseStatuses(q.Statuses, fieldErrors)
	mode := parseOptionalMode(q.Mode, fieldErrors)
	from := parseOptionalInstant("from", q.From, fieldErrors)
	to := parseOptionalInstant("to", q.To, fieldErrors)
	appID := parseOptionalUUID("applicationId", q.ApplicationID, fieldErrors)
	jobID := parseOptionalUUID("jobId", q.JobID, fieldErrors)
	limit := parseLimit(q.Limit, DefaultLimit, MaxLimit, fieldErrors)
	validateRange(from, to, MaxRangeSpan, false, fieldErrors)

	var decodedCursor *cursor.DecodedKeyset
	asOf := nowUTC
	trimmedCursor := strings.TrimSpace(q.Cursor)
	if trimmedCursor != "" {
		dec, decErr := s.cursorCodec.DecodeKeyset(trimmedCursor)
		if decErr != nil {
			return model.QueryPage{}, decErr
		}
		decodedCursor = dec
		asOf = dec.AsOf
	}

	effectiveFrom := from
	effectiveTo := to
	ascending := true
	switch view {
	case "UPCOMING":
		if effectiveFrom == nil || effectiveFrom.Before(asOf) {
			t := asOf
			effectiveFrom = &t
		}
		ascending = true
	case "PAST":
		if effectiveTo == nil || effectiveTo.After(asOf) {
			t := asOf
			effectiveTo = &t
		}
		ascending = false
	case "ALL":
		ascending = false
	}
	validateRange(effectiveFrom, effectiveTo, MaxRangeSpan, false, fieldErrors)
	if len(fieldErrors) > 0 {
		return model.QueryPage{}, apierror.ValidationFailed(fieldErrors)
	}

	var interviewerFilter *uuid.UUID
	if scope.role == "RECRUITER" {
		u := scope.userID
		interviewerFilter = &u
	}

	filters := repository.QueryFilters{
		ApplicationID: appID,
		JobID:         jobID,
		InterviewerID: interviewerFilter,
		Statuses:      statuses,
		Mode:          mode,
		From:          effectiveFrom,
		To:            effectiveTo,
	}

	sortKey := "scheduledStart:desc,id:desc"
	if ascending {
		sortKey = "scheduledStart:asc,id:asc"
	}
	fingerprint := cursor.Fingerprint(map[string]string{
		"endpoint":      "my-interviews",
		"role":          scope.role,
		"visibility":    scope.visibilityKey(),
		"actorId":       scope.userID.String(),
		"view":          view,
		"status":        joinStatuses(statuses),
		"mode":          modePtrString(mode),
		"from":          timePtrString(effectiveFrom),
		"to":            timePtrString(effectiveTo),
		"applicationId": uuidPtrString(appID),
		"jobId":         uuidPtrString(jobID),
		"sort":          sortKey,
	})

	if decodedCursor != nil && decodedCursor.FilterHash != fingerprint {
		return model.QueryPage{}, apierror.NewStatus(http.StatusBadRequest, "INVALID_CURSOR", "cursor does not match query filters", nil)
	}

	var pos *cursor.KeysetPosition
	if decodedCursor != nil {
		pos = &decodedCursor.Position
	}
	return s.fetchPage(ctx, scope, filters, pos, ascending, limit, asOf, fingerprint)
}

type CompanyCalendarQuery struct {
	From          string
	To            string
	InterviewerID string
	CandidateID   string
	JobID         string
	ApplicationID string
	Statuses      []string
	Mode          string
	Limit         string
	Cursor        string
}

func (s *QueryService) ListCompanyCalendar(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	q CompanyCalendarQuery,
) (model.QueryPage, error) {
	scope, err := s.resolveRecruiterScope(ctx, principal, authorizationHeader)
	if err != nil {
		return model.QueryPage{}, err
	}

	fieldErrors := make(map[string]any)
	from := parseRequiredInstant("from", q.From, fieldErrors)
	to := parseRequiredInstant("to", q.To, fieldErrors)
	interviewerID := parseOptionalUUID("interviewerId", q.InterviewerID, fieldErrors)
	candidateID := parseOptionalUUID("candidateId", q.CandidateID, fieldErrors)
	jobID := parseOptionalUUID("jobId", q.JobID, fieldErrors)
	appID := parseOptionalUUID("applicationId", q.ApplicationID, fieldErrors)
	statuses := parseStatuses(q.Statuses, fieldErrors)
	mode := parseOptionalMode(q.Mode, fieldErrors)
	limit := parseLimit(q.Limit, DefaultCalendarLimit, MaxCalendarLimit, fieldErrors)
	validateRange(from, to, MaxCalendarWindow, true, fieldErrors)
	if len(fieldErrors) > 0 {
		return model.QueryPage{}, apierror.ValidationFailed(fieldErrors)
	}

	filters := repository.QueryFilters{
		ApplicationID: appID,
		JobID:         jobID,
		InterviewerID: interviewerID,
		CandidateID:   candidateID,
		Statuses:      statuses,
		Mode:          mode,
		From:          from,
		To:            to,
	}

	fingerprint := cursor.Fingerprint(map[string]string{
		"endpoint":      "company-calendar",
		"companyId":     scope.companyID.String(),
		"from":          timePtrString(from),
		"to":            timePtrString(to),
		"interviewerId": uuidPtrString(interviewerID),
		"candidateId":   uuidPtrString(candidateID),
		"jobId":         uuidPtrString(jobID),
		"applicationId": uuidPtrString(appID),
		"status":        joinStatuses(statuses),
		"mode":          modePtrString(mode),
		"sort":          "scheduledStart:asc,id:asc",
	})

	return s.executePageQuery(ctx, scope, filters, true, limit, q.Cursor, fingerprint)
}

type AvailabilityQuery struct {
	ApplicationID   string
	From            string
	To              string
	TimeZone        string
	DurationMinutes string
	Limit           string
	Cursor          string
}

func (s *QueryService) GetAvailability(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	q AvailabilityQuery,
) (model.AvailabilityResponse, error) {
	scope, err := s.resolveRecruiterScope(ctx, principal, authorizationHeader)
	if err != nil {
		return model.AvailabilityResponse{}, err
	}

	fieldErrors := make(map[string]any)
	appID := parseRequiredUUID("applicationId", q.ApplicationID, fieldErrors)
	from := parseRequiredInstant("from", q.From, fieldErrors)
	to := parseRequiredInstant("to", q.To, fieldErrors)
	tz := normalizeZoneId(q.TimeZone, fieldErrors)
	duration := parseDurationMinutes(q.DurationMinutes, fieldErrors)
	limit := parseLimit(q.Limit, DefaultSlotLimit, MaxSlotLimit, fieldErrors)
	validateRange(from, to, MaxAvailabilityWin, true, fieldErrors)
	if len(fieldErrors) > 0 {
		return model.AvailabilityResponse{}, apierror.ValidationFailed(fieldErrors)
	}

	durationSpan := time.Duration(duration) * time.Minute
	if from.Add(durationSpan).After(*to) {
		fieldErrors["to"] = "availability window must be at least durationMinutes long"
		return model.AvailabilityResponse{}, apierror.ValidationFailed(fieldErrors)
	}

	fingerprint := cursor.Fingerprint(map[string]string{
		"endpoint":        "availability",
		"companyId":       scope.companyID.String(),
		"interviewerId":   scope.userID.String(),
		"applicationId":   appID.String(),
		"from":            model.FormatMillisUTC(*from),
		"to":              model.FormatMillisUTC(*to),
		"timeZone":        tz,
		"durationMinutes": strconv.Itoa(duration),
		"stepMinutes":     strconv.Itoa(SlotStepMinutes),
	})

	nowUTC := s.nowFunc().UTC().Truncate(time.Millisecond)
	asOf := nowUTC
	var afterSlotStart *time.Time
	trimmedCursor := strings.TrimSpace(q.Cursor)
	if trimmedCursor != "" {
		dec, decErr := s.cursorCodec.DecodeSlotPosition(trimmedCursor, fingerprint)
		if decErr != nil {
			return model.AvailabilityResponse{}, decErr
		}
		asOf = dec.AsOf
		slotStart := dec.LastSlotStartAt
		afterSlotStart = &slotStart
	}

	appCtx, err := s.applicationClient.GetSchedulingContext(ctx, appID, authorizationHeader)
	if err != nil {
		return model.AvailabilityResponse{}, err
	}
	if scope.companyID == nil || appCtx.CompanyID != *scope.companyID {
		return model.AvailabilityResponse{}, apierror.NewStatus(http.StatusNotFound, "APPLICATION_NOT_FOUND", "Application was not found", nil)
	}
	if appCtx.Status != "INTERVIEW" {
		return model.AvailabilityResponse{}, apierror.NewStatus(http.StatusConflict, "APPLICATION_NOT_SCHEDULABLE", "Application status does not allow scheduling interviews", map[string]any{
			"applicationStatus": appCtx.Status,
		})
	}

	earliest := *from
	minFuture := nowUTC.Add(time.Millisecond)
	if minFuture.After(earliest) {
		earliest = minFuture
	}
	if afterSlotStart != nil {
		nextAfterCursor := afterSlotStart.Add(time.Duration(SlotStepMinutes) * time.Minute)
		if nextAfterCursor.After(earliest) {
			earliest = nextAfterCursor
		}
	}

	firstSlotStart := alignUpToQuarterHour(earliest)
	lastValidStart := to.Add(-durationSpan)
	if firstSlotStart.After(lastValidStart) {
		return model.AvailabilityResponse{
			ApplicationID:   appID,
			InterviewerID:   scope.userID,
			From:            model.FormatMillisUTC(*from),
			To:              model.FormatMillisUTC(*to),
			TimeZone:        tz,
			DurationMinutes: duration,
			StepMinutes:     SlotStepMinutes,
			Slots:           []model.Slot{},
			NextCursor:      nil,
			AsOf:            model.FormatMillisUTC(asOf),
		}, nil
	}

	busyIntervals, err := s.repo.FindBusyIntervals(ctx, scope.userID, appCtx.CandidateID, firstSlotStart, *to)
	if err != nil {
		return model.AvailabilityResponse{}, err
	}

	stepDuration := time.Duration(SlotStepMinutes) * time.Minute
	var matchedStarts []time.Time
	for slotStart := firstSlotStart; !slotStart.After(lastValidStart) && len(matchedStarts) <= limit; slotStart = slotStart.Add(stepDuration) {
		slotEnd := slotStart.Add(durationSpan)
		if !overlapsAny(slotStart, slotEnd, busyIntervals) {
			matchedStarts = append(matchedStarts, slotStart)
		}
	}

	hasMore := len(matchedStarts) > limit
	pageStarts := matchedStarts
	if hasMore {
		pageStarts = matchedStarts[:limit]
	}

	slots := make([]model.Slot, len(pageStarts))
	for i, st := range pageStarts {
		slots[i] = model.Slot{
			Start: model.FormatMillisUTC(st),
			End:   model.FormatMillisUTC(st.Add(durationSpan)),
		}
	}

	var nextCursor *string
	if hasMore && len(pageStarts) > 0 {
		lastStart := pageStarts[len(pageStarts)-1]
		tok := s.cursorCodec.EncodeSlotPosition(lastStart, asOf, fingerprint)
		nextCursor = &tok
	}

	return model.AvailabilityResponse{
		ApplicationID:   appID,
		InterviewerID:   scope.userID,
		From:            model.FormatMillisUTC(*from),
		To:              model.FormatMillisUTC(*to),
		TimeZone:        tz,
		DurationMinutes: duration,
		StepMinutes:     SlotStepMinutes,
		Slots:           slots,
		NextCursor:      nextCursor,
		AsOf:            model.FormatMillisUTC(asOf),
	}, nil
}

type accessScope struct {
	userID     uuid.UUID
	role       string
	companyID  *uuid.UUID
	visibility repository.VisibilityScope
}

func (a accessScope) visibilityKey() string {
	if a.companyID != nil {
		return "company:" + a.companyID.String()
	}
	return "candidate:" + a.userID.String()
}

func (s *QueryService) resolveAccessScope(ctx context.Context, principal *middleware.Principal, authorizationHeader string) (accessScope, error) {
	if principal == nil {
		return accessScope{}, apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil)
	}
	if principal.Role == "RECRUITER" {
		return s.resolveRecruiterScope(ctx, principal, authorizationHeader)
	}
	if principal.Role == "CANDIDATE" {
		return accessScope{
			userID:     principal.Subject,
			role:       "CANDIDATE",
			visibility: repository.ForCandidate(principal.Subject),
		}, nil
	}
	return accessScope{}, apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Unsupported role", nil)
}

func (s *QueryService) resolveRecruiterScope(ctx context.Context, principal *middleware.Principal, authorizationHeader string) (accessScope, error) {
	if err := requireRecruiterRole(principal); err != nil {
		return accessScope{}, err
	}
	recruiterCtx, err := s.companyClient.VerifyActiveRecruiterContext(ctx, authorizationHeader)
	if err != nil {
		return accessScope{}, err
	}
	if err := ensureAuthorizedRecruiterMatchesActor(principal, recruiterCtx); err != nil {
		return accessScope{}, err
	}
	compID := recruiterCtx.CompanyID
	return accessScope{
		userID:     principal.Subject,
		role:       "RECRUITER",
		companyID:  &compID,
		visibility: repository.ForCompany(compID),
	}, nil
}

func (s *QueryService) executePageQuery(
	ctx context.Context,
	scope accessScope,
	filters repository.QueryFilters,
	ascending bool,
	limit int,
	rawCursor string,
	fingerprint string,
) (model.QueryPage, error) {
	asOf := s.nowFunc().UTC().Truncate(time.Millisecond)
	var pos *cursor.KeysetPosition
	trimmed := strings.TrimSpace(rawCursor)
	if trimmed != "" {
		dec, err := s.cursorCodec.DecodeKeysetWithHash(trimmed, fingerprint)
		if err != nil {
			return model.QueryPage{}, err
		}
		asOf = dec.AsOf
		pos = &dec.Position
	}
	return s.fetchPage(ctx, scope, filters, pos, ascending, limit, asOf, fingerprint)
}

func (s *QueryService) fetchPage(
	ctx context.Context,
	scope accessScope,
	filters repository.QueryFilters,
	pos *cursor.KeysetPosition,
	ascending bool,
	limit int,
	asOf time.Time,
	fingerprint string,
) (model.QueryPage, error) {
	rows, err := s.repo.FindPage(ctx, scope.visibility, filters, pos, ascending, limit, asOf)
	if err != nil {
		return model.QueryPage{}, err
	}
	hasMore := len(rows) > limit
	pageRows := rows
	if hasMore {
		pageRows = rows[:limit]
	}

	items := make([]model.QueryItem, len(pageRows))
	for i, r := range pageRows {
		items[i] = model.ToQueryItem(r, scope.role, false)
	}

	var nextCursor *string
	if hasMore && len(pageRows) > 0 {
		last := pageRows[len(pageRows)-1]
		tok := s.cursorCodec.EncodeKeyset(cursor.KeysetPosition{
			ScheduledStartAt: last.ScheduledStartAt,
			InterviewID:      last.ID,
		}, asOf, fingerprint)
		nextCursor = &tok
	}

	return model.QueryPage{
		Items:      items,
		NextCursor: nextCursor,
		AsOf:       model.FormatMillisUTC(asOf),
	}, nil
}

func parseRequiredUUID(field, raw string, fieldErrors map[string]any) uuid.UUID {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		fieldErrors[field] = field + " is required"
		return uuid.Nil
	}
	parsed, err := uuid.Parse(trimmed)
	if err != nil || parsed.Version() != 4 || parsed.Variant() != uuid.RFC4122 || !strings.EqualFold(parsed.String(), trimmed) {
		fieldErrors[field] = field + " must be a valid UUIDv4"
		return uuid.Nil
	}
	return parsed
}

func parseOptionalUUID(field, raw string, fieldErrors map[string]any) *uuid.UUID {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	parsed := parseRequiredUUID(field, trimmed, fieldErrors)
	if parsed == uuid.Nil {
		return nil
	}
	return &parsed
}

func parseRequiredInstant(field, raw string, fieldErrors map[string]any) *time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		fieldErrors[field] = field + " is required"
		return nil
	}
	return parseOptionalInstant(field, trimmed, fieldErrors)
}

func parseOptionalInstant(field, raw string, fieldErrors map[string]any) *time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if !hasExplicitOffset(trimmed) {
		fieldErrors[field] = field + " must be an ISO-8601 timestamp with an explicit timezone offset"
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, trimmed)
	if err != nil {
		fieldErrors[field] = field + " must be an ISO-8601 timestamp with an explicit timezone offset"
		return nil
	}
	t := parsed.UTC().Truncate(time.Millisecond)
	return &t
}

func validateRange(from, to *time.Time, maxSpan time.Duration, requireBoth bool, fieldErrors map[string]any) {
	if requireBoth && (from == nil || to == nil) {
		return
	}
	if from != nil && to != nil {
		if !to.After(*from) {
			fieldErrors["to"] = "to must be after from"
		} else if to.Sub(*from) > maxSpan {
			days := int(maxSpan.Hours() / 24)
			fieldErrors["to"] = fmt.Sprintf("date range must not exceed %d days", days)
		}
	}
}

func parseStatuses(rawValues []string, fieldErrors map[string]any) []model.InterviewStatus {
	if len(rawValues) == 0 {
		return nil
	}
	seen := make(map[model.InterviewStatus]bool)
	for _, raw := range rawValues {
		for _, token := range strings.Split(raw, ",") {
			trimmed := strings.ToUpper(strings.TrimSpace(token))
			if trimmed == "" {
				continue
			}
			if !model.IsValidStatus(trimmed) {
				fieldErrors["status"] = "status contains an unsupported interview status"
				return nil
			}
			seen[model.InterviewStatus(trimmed)] = true
		}
	}
	out := make([]model.InterviewStatus, 0, len(seen))
	for s := range seen {
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i] < out[j]
	})
	return out
}

func parseOptionalMode(raw string, fieldErrors map[string]any) *model.InterviewMode {
	trimmed := strings.ToUpper(strings.TrimSpace(raw))
	if trimmed == "" {
		return nil
	}
	switch model.InterviewMode(trimmed) {
	case model.ModeOffline:
		m := model.ModeOffline
		return &m
	case model.ModeOnline:
		m := model.ModeOnline
		return &m
	default:
		fieldErrors["mode"] = "mode must be OFFLINE or ONLINE"
		return nil
	}
}

func parseOptionalRound(raw string, fieldErrors map[string]any) *int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	v, err := strconv.Atoi(trimmed)
	if err != nil || v < 1 || v > 20 {
		fieldErrors["roundNumber"] = "roundNumber must be between 1 and 20"
		return nil
	}
	return &v
}

func parseDurationMinutes(raw string, fieldErrors map[string]any) int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 30
	}
	v, err := strconv.Atoi(trimmed)
	if err != nil || (v != 30 && v != 45 && v != 60) {
		fieldErrors["durationMinutes"] = "durationMinutes must be 30, 45, or 60"
		return 30
	}
	return v
}

func parseLimit(raw string, defaultLimit, maxLimit int, fieldErrors map[string]any) int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultLimit
	}
	v, err := strconv.Atoi(trimmed)
	if err != nil || v < 1 || v > maxLimit {
		fieldErrors["limit"] = fmt.Sprintf("limit must be an integer between 1 and %d", maxLimit)
		return defaultLimit
	}
	return v
}

func parseView(raw string, fieldErrors map[string]any) string {
	trimmed := strings.ToUpper(strings.TrimSpace(raw))
	if trimmed == "" {
		return "UPCOMING"
	}
	switch trimmed {
	case "UPCOMING", "PAST", "ALL":
		return trimmed
	default:
		fieldErrors["view"] = "view must be UPCOMING, PAST, or ALL"
		return "UPCOMING"
	}
}

func alignUpToQuarterHour(t time.Time) time.Time {
	stepMillis := int64(SlotStepMinutes) * 60 * 1000
	epochMillis := t.UnixMilli()
	remainder := epochMillis % stepMillis
	if remainder == 0 {
		return t
	}
	return time.UnixMilli(epochMillis + (stepMillis - remainder)).UTC()
}

func overlapsAny(slotStart, slotEnd time.Time, busyIntervals []repository.BusyInterval) bool {
	for _, b := range busyIntervals {
		if !b.StartAt.Before(slotEnd) {
			return false
		}
		if b.StartAt.Before(slotEnd) && b.EndAt.After(slotStart) {
			return true
		}
	}
	return false
}

func joinStatuses(statuses []model.InterviewStatus) string {
	if len(statuses) == 0 {
		return ""
	}
	parts := make([]string, len(statuses))
	for i, s := range statuses {
		parts[i] = string(s)
	}
	return strings.Join(parts, ",")
}

func intPtrString(v *int) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(*v)
}

func modePtrString(m *model.InterviewMode) string {
	if m == nil {
		return ""
	}
	return string(*m)
}

func timePtrString(t *time.Time) string {
	if t == nil {
		return ""
	}
	return model.FormatMillisUTC(*t)
}

func uuidPtrString(u *uuid.UUID) string {
	if u == nil {
		return ""
	}
	return u.String()
}
