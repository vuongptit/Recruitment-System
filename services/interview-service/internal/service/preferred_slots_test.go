package service

import (
	"context"
	"github.com/google/uuid"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"testing"
	"time"
)

func TestPreferredSlotsMustBeDistinctFutureTimestamps(t *testing.T) {
	now := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	reason := "Có lịch làm việc cần thay đổi"
	for _, slots := range [][]string{
		{"tomorrow morning", "Friday afternoon"},
		{"2029-01-01T00:00:00Z", "2030-01-02T00:00:00Z"},
		{"2030-01-02T00:00:00Z", "2030-01-02T07:00:00+07:00"},
	} {
		svc := NewLifecycleService(&mockLifecycleRepo{}, nil, nil, nil, "", "interview-events")
		svc.nowFunc = func() time.Time { return now }
		_, err := svc.RescheduleInterview(context.Background(), &middleware.Principal{Subject: uuid.New(), Role: "CANDIDATE"}, "", uuid.New(), model.RescheduleRequest{Reason: &reason, PreferredSlots: slots})
		if err == nil {
			t.Fatal("invalid preferred slots were accepted")
		}
	}
}
