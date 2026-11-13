package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"interview-service/internal/apierror"
	"interview-service/internal/client"
	"interview-service/internal/cursor"
	"interview-service/internal/livekit"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"interview-service/internal/repository"
)

type mockCompanyVerifier struct {
	ctx *client.RecruiterContext
	err error
}

func (m *mockCompanyVerifier) VerifyActiveRecruiterContext(_ context.Context, _ string) (*client.RecruiterContext, error) {
	return m.ctx, m.err
}

type mockAppVerifier struct {
	ctx *client.ApplicationSchedulingContext
	err error
}

func (m *mockAppVerifier) GetSchedulingContext(_ context.Context, _ uuid.UUID, _ string) (*client.ApplicationSchedulingContext, error) {
	return m.ctx, m.err
}
func (m *mockAppVerifier) GetActiveApplicationContext(_ context.Context, _ uuid.UUID, _ string) (*client.ApplicationSchedulingContext, error) {
	return m.ctx, m.err
}

type mockSchedulingRepo struct {
	existing *model.Interview
	saved    *model.Interview
	created  bool
	err      error
}

func (m *mockSchedulingRepo) FindByScheduledByAndRequestID(_ context.Context, _, _ uuid.UUID) (*model.Interview, error) {
	return m.existing, nil
}

func (m *mockSchedulingRepo) CreateWithOutbox(_ context.Context, iv *model.Interview, _ string, _ time.Time) (*model.Interview, bool, error) {
	if m.err != nil {
		return nil, false, m.err
	}
	if m.saved != nil {
		return m.saved, m.created, nil
	}
	return iv, true, nil
}

func TestScheduleInterviewOnlineAndOffline(t *testing.T) {
	recruiterID := uuid.New()
	companyID := uuid.New()
	appID := uuid.New()
	jobID := uuid.New()
	candidateID := uuid.New()
	reqID := uuid.New()

	repo := &mockSchedulingRepo{created: true}
	comp := &mockCompanyVerifier{ctx: &client.RecruiterContext{UserID: recruiterID, CompanyID: companyID}}
	app := &mockAppVerifier{ctx: &client.ApplicationSchedulingContext{
		ApplicationID: appID,
		CompanyID:     companyID,
		JobID:         jobID,
		CandidateID:   candidateID,
		Status:        "INTERVIEW",
		Version:       2,
	}}

	svc := NewSchedulingService(repo, comp, app, "interview-events")
	fixedNow := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	svc.nowFunc = func() time.Time { return fixedNow }

	principal := &middleware.Principal{
		Subject:   recruiterID,
		Role:      "RECRUITER",
		CompanyID: &companyID,
	}

	// 1. ONLINE interview should auto-populate roomUrl and require no location
	onlineRes, err := svc.ScheduleInterview(context.Background(), principal, "Bearer tok", model.CreateInterviewRequest{
		ApplicationID:   &appID,
		RequestID:       &reqID,
		RoundNumber:     1,
		ScheduledStart:  "2026-12-05T14:00:00Z",
		TimeZone:        "Asia/Ho_Chi_Minh",
		DurationMinutes: 45,
		Mode:            "ONLINE",
	})
	if err != nil {
		t.Fatalf("expected online scheduling to succeed, got %v", err)
	}
	if !onlineRes.Created {
		t.Fatalf("expected Created=true")
	}
	if onlineRes.Response.Mode != model.ModeOnline {
		t.Fatalf("expected Mode=ONLINE, got %s", onlineRes.Response.Mode)
	}
	if onlineRes.Response.RoomURL == nil || *onlineRes.Response.RoomURL == "" {
		t.Fatalf("expected RoomURL to be populated for ONLINE interview")
	}

	// 2. OFFLINE interview without location should fail validation
	reqID2 := uuid.New()
	_, err = svc.ScheduleInterview(context.Background(), principal, "Bearer tok", model.CreateInterviewRequest{
		ApplicationID:   &appID,
		RequestID:       &reqID2,
		RoundNumber:     2,
		ScheduledStart:  "2026-12-06T14:00:00Z",
		TimeZone:        "Asia/Ho_Chi_Minh",
		DurationMinutes: 30,
		Mode:            "OFFLINE",
	})
	if err == nil {
		t.Fatalf("expected validation error for OFFLINE interview without location")
	}
	apiErr, ok := err.(*apierror.Error)
	if !ok || apiErr.Code != "VALIDATION_FAILED" {
		t.Fatalf("expected VALIDATION_FAILED, got %v", err)
	}
}

type mockLifecycleRepo struct {
	iv       *model.Interview
	feedback *model.InterviewFeedback
	err      error
}

func (m *mockLifecycleRepo) GetByID(_ context.Context, _ uuid.UUID) (*model.Interview, error) {
	return m.iv, m.err
}
func (m *mockLifecycleRepo) Confirm(_ context.Context, _, _ uuid.UUID, _ string, _ time.Time) (*model.Interview, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.iv.Status = model.StatusConfirmed
	return m.iv, nil
}
func (m *mockLifecycleRepo) RequestReschedule(_ context.Context, _, _ uuid.UUID, reason string, slots []string, _ string, _ time.Time) (*model.Interview, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.iv.Status = model.StatusRescheduleRequested
	m.iv.RescheduleReason = &reason
	m.iv.ReschedulePreferredSlots = slots
	return m.iv, nil
}
func (m *mockLifecycleRepo) RescheduleByRecruiter(_ context.Context, _, _, _ uuid.UUID, newIv *model.Interview, _, _ string, _ time.Time) (*model.Interview, error) {
	if m.err != nil {
		return nil, m.err
	}
	newIv.ScheduleRevision = m.iv.ScheduleRevision + 1
	return newIv, nil
}
func (m *mockLifecycleRepo) Cancel(_ context.Context, _, _ uuid.UUID, _ string, _ *uuid.UUID, reason, _ string, _ time.Time) (*model.Interview, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.iv.Status = model.StatusCancelled
	m.iv.CancelReason = &reason
	return m.iv, nil
}
func (m *mockLifecycleRepo) JoinRoom(_ context.Context, _, _ uuid.UUID, _ string, _ *uuid.UUID, roomURL, _ string, _ time.Time) (*model.Interview, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.iv.Status = model.StatusInProgress
	m.iv.RoomURL = &roomURL
	return m.iv, nil
}
func (m *mockLifecycleRepo) LeaveRoom(_ context.Context, _, _ uuid.UUID, _ string, _ *uuid.UUID, _ time.Time) (*model.Interview, error) {
	return m.iv, m.err
}
func (m *mockLifecycleRepo) SubmitFeedback(_ context.Context, _, _, evaluatorID uuid.UUID, req model.SubmitFeedbackRequest, _ string, _ time.Time) (*model.Interview, *model.InterviewFeedback, error) {
	if m.err != nil {
		return nil, nil, m.err
	}
	m.iv.Status = model.StatusCompleted
	fb := &model.InterviewFeedback{
		ID:                         uuid.New(),
		InterviewID:                m.iv.ID,
		EvaluatorID:                evaluatorID,
		CriteriaScores:             req.CriteriaScores,
		OverallScore:               req.OverallScore,
		Comment:                    req.Comment,
		Conclusion:                 model.FeedbackConclusion(req.Conclusion),
		SuggestedApplicationAction: "OFFER",
		CreatedAt:                  "2026-12-05T15:00:00.000Z",
	}
	return m.iv, fb, nil
}
func (m *mockLifecycleRepo) GetFeedback(_ context.Context, _, _ uuid.UUID, _ string, _ *uuid.UUID) (*model.InterviewFeedback, error) {
	return m.feedback, m.err
}

func TestLifecycleCandidateAndRecruiterFlows(t *testing.T) {
	candID := uuid.New()
	recruiterID := uuid.New()
	compID := uuid.New()
	ivID := uuid.New()
	appID := uuid.New()

	baseIv := &model.Interview{
		ID:               ivID,
		ApplicationID:    appID,
		CompanyID:        compID,
		JobID:            uuid.New(),
		CandidateID:      candID,
		InterviewerID:    recruiterID,
		ScheduledBy:      recruiterID,
		RoundNumber:      1,
		ScheduleRevision: 1,
		ScheduledStartAt: time.Date(2026, 12, 5, 14, 0, 0, 0, time.UTC),
		ScheduledEndAt:   time.Date(2026, 12, 5, 14, 45, 0, 0, time.UTC),
		TimeZone:         "UTC",
		DurationMinutes:  45,
		Mode:             model.ModeOnline,
		Status:           model.StatusScheduled,
		CreatedAt:        time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC),
		UpdatedAt:        time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC),
	}

	repo := &mockLifecycleRepo{iv: baseIv}
	comp := &mockCompanyVerifier{ctx: &client.RecruiterContext{UserID: recruiterID, CompanyID: compID}}
	issuer := livekit.NewTokenIssuer("ws://localhost:7880", "devkey", "devsecret123456789012345678901234")

	svc := NewLifecycleService(repo, comp, &mockAppVerifier{ctx: &client.ApplicationSchedulingContext{Status: "INTERVIEW"}}, issuer, "ws://localhost:7880", "interview-events")
	svc.nowFunc = func() time.Time { return time.Date(2026, 12, 5, 13, 50, 0, 0, time.UTC) }

	candPrincipal := &middleware.Principal{Subject: candID, Role: "CANDIDATE"}
	recPrincipal := &middleware.Principal{Subject: recruiterID, Role: "RECRUITER", CompanyID: &compID}

	// Candidate Confirm
	confRes, err := svc.ConfirmInterview(context.Background(), candPrincipal, "Bearer tok", ivID)
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	if confRes.Status != model.StatusConfirmed {
		t.Fatalf("expected CONFIRMED, got %s", confRes.Status)
	}

	// Candidate Request Reschedule with 2 slots
	reason := "Medical appointment"
	reschedRes, err := svc.RescheduleInterview(context.Background(), candPrincipal, "", ivID, model.RescheduleRequest{
		Reason:         &reason,
		PreferredSlots: []string{"2026-12-06T09:00:00Z", "2026-12-06T14:00:00Z"},
	})
	if err != nil {
		t.Fatalf("candidate reschedule failed: %v", err)
	}
	if reschedRes.Status != model.StatusRescheduleRequested {
		t.Fatalf("expected RESCHEDULE_REQUESTED, got %s", reschedRes.Status)
	}

	// Join Room
	joinRes, err := svc.JoinRoom(context.Background(), candPrincipal, "", ivID, model.JoinRoomRequest{
		DisplayName: "Alice Candidate",
	})
	if err != nil {
		t.Fatalf("join room failed: %v", err)
	}
	if joinRes.Token == "" || joinRes.RoomName == "" {
		t.Fatalf("expected non-empty token and room name")
	}

	// Submit Feedback
	fb, err := svc.SubmitFeedback(context.Background(), recPrincipal, "Bearer tok", ivID, model.SubmitFeedbackRequest{
		CriteriaScores: model.FeedbackCriteriaScores{
			Technical:     9,
			Communication: 8,
			Attitude:      9,
			CultureFit:    8,
		},
		OverallScore: 8.5,
		Comment:      "Strong Go concurrency and system design fundamentals",
		Conclusion:   "PASS",
	})
	if err != nil {
		t.Fatalf("submit feedback failed: %v", err)
	}
	if fb.Conclusion != model.ConclusionPass || fb.SuggestedApplicationAction != "OFFER" {
		t.Fatalf("unexpected feedback result: %+v", fb)
	}
}

type mockQueryRepo struct {
	detail *model.Interview
	page   []*model.Interview
	busy   []repository.BusyInterval
}

func (m *mockQueryRepo) FindDetail(_ context.Context, _ uuid.UUID, _ repository.VisibilityScope) (*model.Interview, error) {
	return m.detail, nil
}
func (m *mockQueryRepo) FindPage(_ context.Context, _ repository.VisibilityScope, _ repository.QueryFilters, _ *cursor.KeysetPosition, _ bool, _ int, _ time.Time) ([]*model.Interview, error) {
	return m.page, nil
}
func (m *mockQueryRepo) FindBusyIntervals(_ context.Context, _, _ uuid.UUID, _, _ time.Time) ([]repository.BusyInterval, error) {
	return m.busy, nil
}

func TestQueryServiceAvailabilitySlots(t *testing.T) {
	recruiterID := uuid.New()
	compID := uuid.New()
	appID := uuid.New()
	candID := uuid.New()

	qRepo := &mockQueryRepo{
		busy: []repository.BusyInterval{
			{
				StartAt: time.Date(2026, 12, 5, 10, 15, 0, 0, time.UTC),
				EndAt:   time.Date(2026, 12, 5, 10, 45, 0, 0, time.UTC),
			},
		},
	}
	comp := &mockCompanyVerifier{ctx: &client.RecruiterContext{UserID: recruiterID, CompanyID: compID}}
	app := &mockAppVerifier{ctx: &client.ApplicationSchedulingContext{
		ApplicationID: appID,
		CompanyID:     compID,
		JobID:         uuid.New(),
		CandidateID:   candID,
		Status:        "INTERVIEW",
		Version:       1,
	}}
	codec, err := cursor.NewCodec("dev-only-interview-cursor-secret-32-bytes")
	if err != nil {
		t.Fatalf("new codec: %v", err)
	}

	svc := NewQueryService(qRepo, comp, app, codec)
	svc.nowFunc = func() time.Time { return time.Date(2026, 12, 1, 9, 0, 0, 0, time.UTC) }

	principal := &middleware.Principal{Subject: recruiterID, Role: "RECRUITER", CompanyID: &compID}
	avail, err := svc.GetAvailability(context.Background(), principal, "Bearer tok", AvailabilityQuery{
		ApplicationID:   appID.String(),
		From:            "2026-12-05T10:00:00Z",
		To:              "2026-12-05T11:30:00Z",
		TimeZone:        "UTC",
		DurationMinutes: "30",
		Limit:           "10",
	})
	if err != nil {
		t.Fatalf("GetAvailability failed: %v", err)
	}
	// Busy is [10:15, 10:45). For 30m duration in [10:00, 11:30]:
	// 10:00-10:30 overlaps, 10:15-10:45 overlaps, 10:30-11:00 overlaps,
	// 10:45-11:15 free, 11:00-11:30 free!
	if len(avail.Slots) != 2 {
		t.Fatalf("expected 2 free slots, got %d (%+v)", len(avail.Slots), avail.Slots)
	}
	if avail.Slots[0].Start != "2026-12-05T10:45:00.000Z" || avail.Slots[1].Start != "2026-12-05T11:00:00.000Z" {
		t.Fatalf("unexpected slots: %+v", avail.Slots)
	}
}
