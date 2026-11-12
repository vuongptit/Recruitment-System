package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"interview-service/internal/apierror"

	"github.com/google/uuid"
)

func TestApplicationClientAuthorizeScheduling(t *testing.T) {
	appID := uuid.New()
	jobID := uuid.New()
	compID := uuid.New()
	candID := uuid.New()
	secretKey := "0123456789abcdef0123456789abcdef-internal-key"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Service") != "interview-service" || r.Header.Get("X-Internal-Api-Key") != secretKey {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"applicationId":      appID.String(),
				"jobId":              jobID.String(),
				"companyId":          compID.String(),
				"candidateId":        candID.String(),
				"status":             "REVIEWING",
				"applicationVersion": 2,
			},
		})
	}))
	defer srv.Close()

	c, err := NewApplicationClient(srv.URL, "127.0.0.1,localhost", 2*time.Second, secretKey)
	if err != nil {
		t.Fatalf("unexpected error creating client: %v", err)
	}

	res, err := c.AuthorizeScheduling(context.Background(), appID, "Bearer test-token")
	if err != nil {
		t.Fatalf("AuthorizeScheduling failed: %v", err)
	}
	if res.CompanyID != compID || res.CandidateID != candID || res.Status != "REVIEWING" {
		t.Fatalf("unexpected context: %+v", res)
	}
}

func TestCompanyClientResolveMembership(t *testing.T) {
	recruiterID := uuid.New()
	compID := uuid.New()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, recruiterID.String()) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"companyId":      compID.String(),
				"name":           "Tech Corp",
				"verifiedStatus": "VERIFIED",
				"memberRole":     "MEMBER",
			},
		})
	}))
	defer srv.Close()

	c, err := NewCompanyClient(srv.URL, "127.0.0.1,localhost", 2*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mem, err := c.ResolveMembership(context.Background(), recruiterID, "Bearer valid-jwt")
	if err != nil {
		t.Fatalf("ResolveMembership failed: %v", err)
	}
	if mem.CompanyID != compID || mem.MemberRole != "MEMBER" {
		t.Fatalf("unexpected membership: %+v", mem)
	}

	_, err = c.ResolveMembership(context.Background(), uuid.New(), "Bearer valid-jwt")
	var bizErr *apierror.BusinessError
	if err == nil {
		t.Fatal("expected 404 to return error")
	}
	_ = bizErr
}
