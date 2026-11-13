package test

import (
	"context"
	"github.com/google/uuid"
	"interview-service/internal/config"
	"interview-service/internal/db"
	"interview-service/internal/model"
	"interview-service/internal/repository"
	"os"
	"strings"
	"testing"
	"time"
)

// This test deliberately requires TEST_DATABASE_URL; never falls back to a user database.
func TestInterviewConsentAndAttendancePolicies(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires isolated TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := db.ConnectAndMigrate(ctx, &config.Config{DatabaseURL: url, DBMaxConns: 5, DBMinConns: 1})
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := repository.NewInterviewRepository(pool)
	now := time.Now().UTC().Truncate(time.Millisecond)
	create := func(start time.Time, mode model.InterviewMode) *model.Interview {
		t.Helper()
		var location *string
		if mode == model.ModeOffline {
			value := "Fixture office"
			location = &value
		}
		iv := &model.Interview{ID: uuid.New(), ApplicationID: uuid.New(), ApplicationVersion: 1, ApplicationStatusAtSchedule: "INTERVIEW", CompanyID: uuid.New(), JobID: uuid.New(), CandidateID: uuid.New(), InterviewerID: uuid.New(), ScheduledBy: uuid.New(), RequestID: uuid.New(), RequestHash: strings.Repeat("a", 64), RoundNumber: 1, ScheduleRevision: 1, ScheduledStartAt: start, ScheduledEndAt: start.Add(45 * time.Minute), TimeZone: "Asia/Ho_Chi_Minh", DurationMinutes: 45, Mode: mode, Location: location, Status: model.StatusScheduled, CreatedAt: now.Add(-48 * time.Hour), UpdatedAt: now}
		saved, _, err := repo.CreateWithOutbox(ctx, iv, "interview-events", now)
		if err != nil {
			t.Fatal(err)
		}
		return saved
	}
	t.Run("reschedule requires a new candidate confirmation and retries keep one revision", func(t *testing.T) {
		old := create(now.Add(24*time.Hour), model.ModeOnline)
		if _, err := repo.Confirm(ctx, old.ID, uuid.New(), "interview-events", now); err == nil {
			t.Fatal("other candidate could confirm")
		}
		if _, err := repo.Confirm(ctx, old.ID, old.CandidateID, "interview-events", now); err != nil {
			t.Fatal(err)
		}
		if _, err := repo.RequestReschedule(ctx, old.ID, old.CandidateID, "Busy", []string{now.Add(30 * time.Hour).Format(time.RFC3339), now.Add(36 * time.Hour).Format(time.RFC3339)}, "interview-events", now); err != nil {
			t.Fatal(err)
		}
		if _, err := repo.Confirm(ctx, old.ID, old.CandidateID, "interview-events", now); err == nil {
			t.Fatal("pending change request was silently confirmed")
		}
		next := *old
		next.ID = uuid.New()
		next.RequestID = uuid.New()
		next.RequestHash = strings.Repeat("b", 64)
		next.ScheduledStartAt = now.Add(36 * time.Hour)
		next.ScheduledEndAt = next.ScheduledStartAt.Add(45 * time.Minute)
		next.Status = model.StatusScheduled
		next.ConfirmedAt = nil
		saved, err := repo.RescheduleByRecruiter(ctx, old.ID, old.CompanyID, old.ScheduledBy, &next, "New time", "interview-events", now)
		if err != nil {
			t.Fatal(err)
		}
		if saved.Status != model.StatusScheduled || saved.ConfirmedAt != nil || saved.ScheduleRevision != 2 {
			t.Fatal("new revision inherited candidate consent")
		}
		replay, err := repo.RescheduleByRecruiter(ctx, old.ID, old.CompanyID, old.ScheduledBy, &next, "New time", "interview-events", now)
		if err != nil || replay.ID != saved.ID {
			t.Fatalf("retry should return same revision: %v", err)
		}
		if _, err := repo.Confirm(ctx, saved.ID, saved.CandidateID, "interview-events", now); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("recruiter preparation is not candidate attendance", func(t *testing.T) {
		iv := create(now.Add(10*time.Minute), model.ModeOnline)
		prepared, err := repo.JoinRoom(ctx, iv.ID, iv.InterviewerID, "RECRUITER", &iv.CompanyID, "/room", "interview-events", now)
		if err != nil {
			t.Fatal(err)
		}
		if prepared.Status != model.StatusScheduled || prepared.StartedAt != nil || prepared.ConfirmedAt != nil {
			t.Fatal("recruiter falsely recorded candidate attendance")
		}
		joined, err := repo.JoinRoom(ctx, iv.ID, iv.CandidateID, "CANDIDATE", nil, "/room", "interview-events", now)
		if err != nil || joined.StartedAt == nil || joined.ConfirmedAt == nil || joined.Status != model.StatusInProgress {
			t.Fatalf("candidate join must record attendance: %v", err)
		}
	})
	t.Run("offline interviews and online join grace are not marked absent", func(t *testing.T) {
		offline := create(now.Add(-3*time.Hour), model.ModeOffline)
		grace := create(now.Add(-50*time.Minute), model.ModeOnline)
		overdue := create(now.Add(-3*time.Hour), model.ModeOnline)
		if _, err := repo.MarkNoShowsBatch(ctx, "interview-events", now, 100); err != nil {
			t.Fatal(err)
		}
		for _, iv := range []*model.Interview{offline, grace} {
			saved, err := repo.GetByID(ctx, iv.ID)
			if err != nil || saved.Status != model.StatusScheduled {
				t.Fatal("incorrect automatic absence")
			}
		}
		saved, err := repo.GetByID(ctx, overdue.ID)
		if err != nil || saved.Status != model.StatusNoShow {
			t.Fatal("overdue online attendance not handled")
		}
	})
	t.Run("future interview cannot be completed by feedback", func(t *testing.T) {
		iv := create(now.Add(24*time.Hour), model.ModeOffline)
		if _, _, err := repo.SubmitFeedback(ctx, iv.ID, iv.CompanyID, iv.InterviewerID, model.SubmitFeedbackRequest{}, "interview-events", now); err == nil {
			t.Fatal("future interview was completed")
		}
	})
}
