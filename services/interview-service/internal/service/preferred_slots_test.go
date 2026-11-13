package service

import (
	"context"
	"github.com/google/uuid"
	"interview-service/internal/apierror"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"testing"
)

func TestCandidateCannotNegotiateAlternativeSlots(t *testing.T) {
	svc := NewLifecycleService(&mockLifecycleRepo{}, nil, nil, nil, "", "interview-events")
	_, err := svc.RescheduleInterview(context.Background(), &middleware.Principal{Subject: uuid.New(), Role: "CANDIDATE"}, "", uuid.New(), model.RescheduleRequest{})
	if apiErr, ok := err.(*apierror.Error); !ok || apiErr.Code != "INTERVIEW_RESCHEDULE_DISABLED" {
		t.Fatalf("expected disabled candidate rescheduling, got %v", err)
	}
}
