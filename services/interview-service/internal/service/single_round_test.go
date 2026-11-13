package service

import (
	"github.com/google/uuid"
	"interview-service/internal/model"
	"testing"
	"time"
)

func TestCreateOnlyAllowsSingleInterviewRound(t *testing.T) {
	applicationID, requestID, actorID := uuid.New(), uuid.New(), uuid.New()
	now := time.Now().UTC()
	req := model.CreateInterviewRequest{ApplicationID: &applicationID, RequestID: &requestID, ScheduledStart: now.Add(24 * time.Hour).Format(time.RFC3339), TimeZone: "Asia/Ho_Chi_Minh", DurationMinutes: 45, Mode: "ONLINE"}
	for _, round := range []int{0, 1, 2, 20, -1} {
		req.RoundNumber = round
		result, err := normalizeCreateRequest(req, actorID, now)
		if round == 0 || round == 1 {
			if err != nil || result.RoundNumber != 1 {
				t.Fatalf("round %d should normalize to 1: %v", round, err)
			}
		} else if err == nil {
			t.Fatalf("round %d was accepted", round)
		}
	}
}
