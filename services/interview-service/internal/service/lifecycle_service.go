package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"interview-service/internal/apierror"
	"interview-service/internal/livekit"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
)

type LifecycleRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Interview, error)
	Confirm(ctx context.Context, id, candidateID uuid.UUID, topic string, now time.Time) (*model.Interview, error)
	RequestReschedule(ctx context.Context, id, candidateID uuid.UUID, reason string, preferredSlots []string, topic string, now time.Time) (*model.Interview, error)
	RescheduleByRecruiter(ctx context.Context, oldID, companyID, recruiterID uuid.UUID, newInterview *model.Interview, cancelReason, topic string, now time.Time) (*model.Interview, error)
	Cancel(ctx context.Context, id, actorID uuid.UUID, role string, companyID *uuid.UUID, reason, topic string, now time.Time) (*model.Interview, error)
	JoinRoom(ctx context.Context, id, actorID uuid.UUID, role string, companyID *uuid.UUID, roomURL, topic string, now time.Time) (*model.Interview, error)
	LeaveRoom(ctx context.Context, id, actorID uuid.UUID, role string, companyID *uuid.UUID, now time.Time) (*model.Interview, error)
	SubmitFeedback(ctx context.Context, id, companyID, evaluatorID uuid.UUID, req model.SubmitFeedbackRequest, topic string, now time.Time) (*model.Interview, *model.InterviewFeedback, error)
	GetFeedback(ctx context.Context, interviewID, actorID uuid.UUID, role string, companyID *uuid.UUID) (*model.InterviewFeedback, error)
}

type LifecycleService struct {
	repo              LifecycleRepository
	companyClient     CompanyVerifier
	applicationClient ApplicationVerifier
	tokenIssuer       *livekit.TokenIssuer
	livekitURL        string
	topic             string
	nowFunc           func() time.Time
}

func NewLifecycleService(
	repo LifecycleRepository,
	companyClient CompanyVerifier,
	applicationClient ApplicationVerifier,
	tokenIssuer *livekit.TokenIssuer,
	livekitURL string,
	topic string,
) *LifecycleService {
	return &LifecycleService{
		repo:              repo,
		companyClient:     companyClient,
		applicationClient: applicationClient,
		tokenIssuer:       tokenIssuer,
		livekitURL:        livekitURL,
		topic:             topic,
		nowFunc:           time.Now,
	}
}

func (s *LifecycleService) ConfirmInterview(ctx context.Context, principal *middleware.Principal, authorizationHeader string, interviewID uuid.UUID) (model.InterviewResponse, error) {
	if principal == nil {
		return model.InterviewResponse{}, apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil)
	}
	if principal.Role != "CANDIDATE" {
		return model.InterviewResponse{}, apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Only candidates can confirm interviews", nil)
	}
	if err := s.ensureActiveApplication(ctx, interviewID, authorizationHeader); err != nil {
		return model.InterviewResponse{}, err
	}
	iv, err := s.repo.Confirm(ctx, interviewID, principal.Subject, s.topic, s.nowFunc().UTC())
	if err != nil {
		return model.InterviewResponse{}, err
	}
	return model.ToInterviewResponse(iv), nil
}

func (s *LifecycleService) RescheduleInterview(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
	req model.RescheduleRequest,
) (model.InterviewResponse, error) {
	if principal == nil {
		return model.InterviewResponse{}, apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil)
	}
	nowUTC := s.nowFunc().UTC().Truncate(time.Millisecond)

	if principal.Role == "CANDIDATE" {
		fieldErrors := make(map[string]any)
		reason := ""
		if req.Reason != nil {
			reason = strings.TrimSpace(*req.Reason)
		}
		if reason == "" {
			fieldErrors["reason"] = "reason is required when requesting a reschedule"
		} else if utf8.RuneCountInString(reason) > 500 || containsControlChars(reason) {
			fieldErrors["reason"] = "reason must be at most 500 printable characters"
		}

		var slots []string
		seenSlots := make(map[int64]bool)
		for _, rawSlot := range req.PreferredSlots {
			trimmed := strings.TrimSpace(rawSlot)
			if trimmed == "" {
				continue
			}
			parsed, parseErr := time.Parse(time.RFC3339, trimmed)
			if parseErr != nil || !parsed.After(nowUTC) || seenSlots[parsed.UnixMilli()] {
				fieldErrors["preferredSlots"] = "preferred slots must be distinct future ISO-8601 timestamps"
				break
			}
			seenSlots[parsed.UnixMilli()] = true
			slots = append(slots, model.FormatMillisUTC(parsed))
		}
		if len(slots) < 2 || len(slots) > 3 {
			fieldErrors["preferredSlots"] = "preferredSlots must contain between 2 and 3 suggested time slots"
		}
		if len(fieldErrors) > 0 {
			return model.InterviewResponse{}, apierror.ValidationFailed(fieldErrors)
		}

		if err := s.ensureActiveApplication(ctx, interviewID, authorizationHeader); err != nil {
			return model.InterviewResponse{}, err
		}
		updated, err := s.repo.RequestReschedule(ctx, interviewID, principal.Subject, reason, slots, s.topic, nowUTC)
		if err != nil {
			return model.InterviewResponse{}, err
		}
		return model.ToInterviewResponse(updated), nil
	}

	if principal.Role == "RECRUITER" {
		recruiterCtx, err := s.companyClient.VerifyActiveRecruiterContext(ctx, authorizationHeader)
		if err != nil {
			return model.InterviewResponse{}, err
		}
		if err := ensureAuthorizedRecruiterMatchesActor(principal, recruiterCtx); err != nil {
			return model.InterviewResponse{}, err
		}

		oldIv, err := s.repo.GetByID(ctx, interviewID)
		if err != nil {
			return model.InterviewResponse{}, err
		}
		if oldIv == nil || oldIv.CompanyID != recruiterCtx.CompanyID {
			return model.InterviewResponse{}, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
		}
		appCtx, authErr := s.applicationClient.GetSchedulingContext(ctx, oldIv.ApplicationID, authorizationHeader)
		if authErr != nil {
			return model.InterviewResponse{}, authErr
		}
		if appCtx.CompanyID != oldIv.CompanyID || appCtx.Status != "INTERVIEW" {
			return model.InterviewResponse{}, apierror.NewStatus(http.StatusConflict, "APPLICATION_NOT_SCHEDULABLE", "Application is no longer in the interview stage", nil)
		}

		fieldErrors := make(map[string]any)
		requestID := uuid.New()
		if req.RequestID != nil && *req.RequestID != uuid.Nil {
			requestID = *req.RequestID
		}

		scheduledStartStr := ""
		if req.ScheduledStart != nil {
			scheduledStartStr = *req.ScheduledStart
		}
		scheduledStartAt := normalizeScheduledStart(scheduledStartStr, nowUTC, fieldErrors)

		tzStr := oldIv.TimeZone
		if req.TimeZone != nil && strings.TrimSpace(*req.TimeZone) != "" {
			tzStr = normalizeZoneId(*req.TimeZone, fieldErrors)
		}

		duration := oldIv.DurationMinutes
		if req.DurationMinutes != nil {
			duration = *req.DurationMinutes
			if duration != 30 && duration != 45 && duration != 60 {
				fieldErrors["durationMinutes"] = "durationMinutes must be 30, 45, or 60"
			}
		}

		mode := oldIv.Mode
		if req.Mode != nil && strings.TrimSpace(*req.Mode) != "" {
			mode = normalizeMode(*req.Mode, fieldErrors)
		}

		locInput := req.Location
		if locInput == nil && mode == model.ModeOffline {
			locInput = oldIv.Location
		}
		location := normalizeLocation(locInput, mode, fieldErrors)

		notesInput := req.Notes
		if notesInput == nil {
			notesInput = oldIv.Notes
		}
		notes := normalizeOptionalText("notes", notesInput, 2000, fieldErrors)

		if len(fieldErrors) > 0 {
			return model.InterviewResponse{}, apierror.ValidationFailed(fieldErrors)
		}

		scheduledEndAt := scheduledStartAt.Add(time.Duration(duration) * time.Minute)
		newID := uuid.New()
		cancelReason := "Rescheduled to a new time slot by recruiter"
		if req.Reason != nil && strings.TrimSpace(*req.Reason) != "" {
			cancelReason = strings.TrimSpace(*req.Reason)
		}
		hashInput, hashErr := json.Marshal([]any{oldIv.ID, model.FormatMillisUTC(scheduledStartAt), tzStr, duration, mode, location, notes, cancelReason})
		if hashErr != nil {
			return model.InterviewResponse{}, fmt.Errorf("hash reschedule request: %w", hashErr)
		}
		sum := sha256.Sum256(hashInput)

		newIv := &model.Interview{
			ID:               newID,
			InterviewerID:    oldIv.InterviewerID,
			ScheduledBy:      principal.Subject,
			RequestID:        requestID,
			RequestHash:      hex.EncodeToString(sum[:]),
			ScheduledStartAt: scheduledStartAt,
			ScheduledEndAt:   scheduledEndAt,
			TimeZone:         tzStr,
			DurationMinutes:  duration,
			Mode:             mode,
			Location:         location,
			Notes:            notes,
			Status:           model.StatusScheduled,
			CreatedAt:        nowUTC,
			UpdatedAt:        nowUTC,
			Version:          0,
		}

		saved, err := s.repo.RescheduleByRecruiter(ctx, interviewID, recruiterCtx.CompanyID, principal.Subject, newIv, cancelReason, s.topic, nowUTC)
		if err != nil {
			return model.InterviewResponse{}, err
		}
		return model.ToInterviewResponse(saved), nil
	}

	return model.InterviewResponse{}, apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Unsupported role", nil)
}

func (s *LifecycleService) CancelInterview(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
	req model.CancelInterviewRequest,
) (model.InterviewResponse, error) {
	companyID, err := s.resolveActorCompanyID(ctx, principal, authorizationHeader)
	if err != nil {
		return model.InterviewResponse{}, err
	}

	reason := strings.TrimSpace(req.Reason)
	if reason == "" || utf8.RuneCountInString(reason) > 500 || containsControlChars(reason) {
		return model.InterviewResponse{}, apierror.ValidationFailed(map[string]any{
			"reason": "reason is required and must be at most 500 printable characters",
		})
	}

	updated, err := s.repo.Cancel(ctx, interviewID, principal.Subject, principal.Role, companyID, reason, s.topic, s.nowFunc().UTC())
	if err != nil {
		return model.InterviewResponse{}, err
	}
	return model.ToInterviewResponse(updated), nil
}

func (s *LifecycleService) JoinRoom(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
	req model.JoinRoomRequest,
) (model.JoinRoomResponse, error) {
	companyID, err := s.resolveActorCompanyID(ctx, principal, authorizationHeader)
	if err != nil {
		return model.JoinRoomResponse{}, err
	}

	if err := s.ensureActiveApplication(ctx, interviewID, authorizationHeader); err != nil {
		return model.JoinRoomResponse{}, err
	}
	roomURL := fmt.Sprintf("/interviews/%s/room", interviewID.String())
	iv, err := s.repo.JoinRoom(ctx, interviewID, principal.Subject, principal.Role, companyID, roomURL, s.topic, s.nowFunc().UTC())
	if err != nil {
		return model.JoinRoomResponse{}, err
	}

	roomName := fmt.Sprintf("interview-%s-%s", iv.ApplicationID.String(), iv.ID.String())
	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		if principal.Role == "RECRUITER" {
			displayName = "Recruiter"
		} else {
			displayName = "Candidate"
		}
	}

	token, err := s.tokenIssuer.IssueToken(
		roomName,
		principal.Subject.String(),
		displayName,
		strings.TrimSpace(req.AvatarURL),
		principal.Role,
	)
	if err != nil {
		return model.JoinRoomResponse{}, apierror.NewStatus(http.StatusInternalServerError, "LIVEKIT_TOKEN_ERROR", "Failed to issue video room token", nil)
	}

	return model.JoinRoomResponse{
		Token:      token,
		LiveKitURL: s.livekitURL,
		RoomName:   roomName,
		RoomURL:    roomURL,
		Interview:  model.ToQueryItem(iv, principal.Role, true),
	}, nil
}

func (s *LifecycleService) LeaveRoom(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
) (model.InterviewResponse, error) {
	companyID, err := s.resolveActorCompanyID(ctx, principal, authorizationHeader)
	if err != nil {
		return model.InterviewResponse{}, err
	}

	iv, err := s.repo.LeaveRoom(ctx, interviewID, principal.Subject, principal.Role, companyID, s.nowFunc().UTC())
	if err != nil {
		return model.InterviewResponse{}, err
	}
	return model.ToInterviewResponse(iv), nil
}

func (s *LifecycleService) SubmitFeedback(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
	req model.SubmitFeedbackRequest,
) (*model.InterviewFeedback, error) {
	if err := requireRecruiterRole(principal); err != nil {
		return nil, err
	}
	recruiterCtx, err := s.companyClient.VerifyActiveRecruiterContext(ctx, authorizationHeader)
	if err != nil {
		return nil, err
	}
	if err := ensureAuthorizedRecruiterMatchesActor(principal, recruiterCtx); err != nil {
		return nil, err
	}

	fieldErrors := make(map[string]any)
	if !isScoreValid(req.CriteriaScores.Technical) ||
		!isScoreValid(req.CriteriaScores.Communication) ||
		!isScoreValid(req.CriteriaScores.Attitude) ||
		!isScoreValid(req.CriteriaScores.CultureFit) {
		fieldErrors["criteriaScores"] = "all criteriaScores (technical, communication, attitude, cultureFit) must be between 1 and 10"
	}

	if req.OverallScore == 0 {
		req.OverallScore = float64(req.CriteriaScores.Technical+req.CriteriaScores.Communication+req.CriteriaScores.Attitude+req.CriteriaScores.CultureFit) / 4.0
	}
	if req.OverallScore < 1.0 || req.OverallScore > 10.0 {
		fieldErrors["overallScore"] = "overallScore must be between 1 and 10"
	}

	comment := strings.TrimSpace(req.Comment)
	if comment == "" || len(comment) > 4000 || containsControlChars(comment) {
		fieldErrors["comment"] = "comment is required and must be at most 4000 printable characters"
	}
	req.Comment = comment

	conclusion := strings.ToUpper(strings.TrimSpace(req.Conclusion))
	switch model.FeedbackConclusion(conclusion) {
	case model.ConclusionPass, model.ConclusionFail, model.ConclusionNextRound:
		req.Conclusion = conclusion
	default:
		fieldErrors["conclusion"] = "conclusion must be PASS, FAIL, or NEXT_ROUND"
	}

	if len(fieldErrors) > 0 {
		return nil, apierror.ValidationFailed(fieldErrors)
	}

	_, fb, err := s.repo.SubmitFeedback(ctx, interviewID, recruiterCtx.CompanyID, principal.Subject, req, s.topic, s.nowFunc().UTC())
	if err != nil {
		return nil, err
	}
	return fb, nil
}

func (s *LifecycleService) GetFeedback(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
	interviewID uuid.UUID,
) (*model.InterviewFeedback, error) {
	companyID, err := s.resolveActorCompanyID(ctx, principal, authorizationHeader)
	if err != nil {
		return nil, err
	}
	return s.repo.GetFeedback(ctx, interviewID, principal.Subject, principal.Role, companyID)
}

func (s *LifecycleService) resolveActorCompanyID(
	ctx context.Context,
	principal *middleware.Principal,
	authorizationHeader string,
) (*uuid.UUID, error) {
	if principal == nil {
		return nil, apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil)
	}
	if principal.Role == "CANDIDATE" {
		return nil, nil
	}
	if principal.Role == "RECRUITER" {
		recruiterCtx, err := s.companyClient.VerifyActiveRecruiterContext(ctx, authorizationHeader)
		if err != nil {
			return nil, err
		}
		if err := ensureAuthorizedRecruiterMatchesActor(principal, recruiterCtx); err != nil {
			return nil, err
		}
		compID := recruiterCtx.CompanyID
		return &compID, nil
	}
	return nil, apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Unsupported role", nil)
}

func (s *LifecycleService) ensureActiveApplication(ctx context.Context, interviewID uuid.UUID, authorizationHeader string) error {
	iv, err := s.repo.GetByID(ctx, interviewID)
	if err != nil {
		return err
	}
	if iv == nil {
		return apierror.New("INTERVIEW_NOT_FOUND", "Interview was not found", http.StatusNotFound)
	}
	app, err := s.applicationClient.GetActiveApplicationContext(ctx, iv.ApplicationID, authorizationHeader)
	if err != nil {
		return err
	}
	if app == nil || app.Status != "INTERVIEW" {
		return apierror.New("APPLICATION_NOT_SCHEDULABLE", "Application is no longer in the interview stage", http.StatusConflict)
	}
	return nil
}

func isScoreValid(score int) bool {
	return score >= 1 && score <= 10
}
