package worker

import (
	"context"
	"log/slog"
	"time"

	"interview-service/internal/config"
	"interview-service/internal/repository"
)

type LifecycleScheduler struct {
	repo *repository.InterviewRepository
	cfg  *config.Config
}

func NewLifecycleScheduler(repo *repository.InterviewRepository, cfg *config.Config) *LifecycleScheduler {
	return &LifecycleScheduler{
		repo: repo,
		cfg:  cfg,
	}
}

func (s *LifecycleScheduler) Start(ctx context.Context) {
	noShowInterval := s.cfg.NoShowCheckInterval
	if noShowInterval <= 0 {
		noShowInterval = 15 * time.Minute
	}
	reminderInterval := s.cfg.ReminderCheckInterval
	if reminderInterval <= 0 {
		reminderInterval = 15 * time.Minute
	}

	noShowTicker := time.NewTicker(noShowInterval)
	reminderTicker := time.NewTicker(reminderInterval)
	defer noShowTicker.Stop()
	defer reminderTicker.Stop()

	s.RunOnce(ctx, time.Now().UTC())

	for {
		select {
		case <-ctx.Done():
			return
		case <-noShowTicker.C:
			s.runNoShowSweep(ctx, time.Now().UTC())
		case <-reminderTicker.C:
			s.runReminderSweep(ctx, time.Now().UTC())
		}
	}
}

func (s *LifecycleScheduler) RunOnce(ctx context.Context, now time.Time) {
	s.runNoShowSweep(ctx, now)
	s.runReminderSweep(ctx, now)
}

func (s *LifecycleScheduler) runNoShowSweep(ctx context.Context, now time.Time) {
	count, err := s.repo.MarkNoShowsBatch(ctx, s.cfg.KafkaInterviewTopic, now, 100)
	if err != nil {
		slog.Warn("lifecycle scheduler failed to mark no-show interviews", "error", err)
		return
	}
	if count > 0 {
		slog.Info("marked overdue interviews as NO_SHOW", "count", count)
	}
}

func (s *LifecycleScheduler) runReminderSweep(ctx context.Context, now time.Time) {
	count, err := s.repo.SendRemindersBatch(ctx, s.cfg.KafkaInterviewTopic, now, 100)
	if err != nil {
		slog.Warn("lifecycle scheduler failed to queue 24h unconfirmed reminders", "error", err)
		return
	}
	if count > 0 {
		slog.Info("queued 24h unconfirmed interview reminders", "count", count)
	}
}
