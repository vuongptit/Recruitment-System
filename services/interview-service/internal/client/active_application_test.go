package client

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestActiveApplicationReadRetainsParticipantAuthorization(t *testing.T) {
	appID, jobID, companyID, candidateID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	status := "INTERVIEW"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/"+appID.String() || r.Header.Get("Authorization") != "Bearer fixture" || r.Header.Get("X-Internal-Api-Key") != "" {
			t.Error("unexpected participant authorization request")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": appID, "jobId": jobID, "companyId": companyID, "candidateId": candidateID, "status": status, "version": 2, "timeline": []any{}}})
	}))
	defer upstream.Close()
	client, err := NewApplicationClient(upstream.URL, "127.0.0.1,localhost", time.Second, "0123456789abcdef0123456789abcdef-internal-key")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetActiveApplicationContext(context.Background(), appID, "Bearer fixture"); err != nil {
		t.Fatal(err)
	}
	for _, closed := range []string{"REJECTED", "HIRED", "WITHDRAWN", "OFFER"} {
		status = closed
		if _, err := client.GetActiveApplicationContext(context.Background(), appID, "Bearer fixture"); err == nil {
			t.Fatal("inactive application was allowed")
		}
	}
}
