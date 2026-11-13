package test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	golangjwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"interview-service/internal/client"
	"interview-service/internal/config"
	"interview-service/internal/cursor"
	"interview-service/internal/db"
	"interview-service/internal/handler"
	"interview-service/internal/jwt"
	"interview-service/internal/livekit"
	"interview-service/internal/model"
	"interview-service/internal/repository"
	"interview-service/internal/service"
)

func TestFullInterviewLifecycleDatabaseIntegration(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("requires isolated TEST_DATABASE_URL")
	}

	ctx := context.Background()
	cfg := &config.Config{
		DatabaseURL:          dbURL,
		DBMaxConns:           5,
		DBMinConns:           1,
		DBSchema:             "interview",
		KafkaInterviewTopic:  "interview-events",
		LiveKitURL:           "ws://localhost:7880",
		LiveKitAPIKey:        "devkey",
		LiveKitAPISecret:     "devsecret123456789012345678901234",
		LiveKitTokenTTL:      4 * time.Hour,
		OutboxEnabled:        true,
		OutboxBatchSize:      25,
		OutboxLeaseDuration:  15 * time.Second,
		OutboxInitialBackoff: time.Second,
		OutboxMaxBackoff:     time.Minute,
		OutboxMaxAllowedLag:  2 * time.Minute,
	}

	pool, err := db.ConnectAndMigrate(ctx, cfg)
	if err != nil {
		t.Fatalf("ConnectAndMigrate failed: %v", err)
	}
	defer pool.Close()

	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	pubDER, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	pubPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubDER}))

	verifier, err := jwt.NewVerifier(pubPEM, "", "auth-service", "recruitment-platform")
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	kid, err := jwt.ComputeThumbprint(&privKey.PublicKey)
	if err != nil {
		t.Fatalf("compute thumbprint: %v", err)
	}

	recruiterID := uuid.New()
	companyID := uuid.New()
	candidateID := uuid.New()
	applicationID := uuid.New()
	jobID := uuid.New()

	// Cleanup after test
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `
			ALTER TABLE interview_event_outbox DISABLE TRIGGER interview_event_outbox_immutable_trigger;
			DELETE FROM interview_event_outbox WHERE interview_id IN (SELECT id FROM interviews WHERE application_id = $1);
			ALTER TABLE interview_event_outbox ENABLE TRIGGER interview_event_outbox_immutable_trigger;
			DELETE FROM interview_feedbacks WHERE interview_id IN (SELECT id FROM interviews WHERE application_id = $1);
			UPDATE interviews SET supersedes_interview_id = NULL WHERE application_id = $1;
			DELETE FROM interviews WHERE application_id = $1;
		`, applicationID)
	})

	companyUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"companyId":      companyID.String(),
				"name":           "Acme Corp",
				"verifiedStatus": "VERIFIED",
				"memberRole":     "MEMBER",
			},
		})
	}))
	defer companyUpstream.Close()

	appUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": applicationID, "jobId": jobID, "companyId": companyID, "candidateId": candidateID, "status": "INTERVIEW", "version": 1}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"applicationId":      applicationID.String(),
				"companyId":          companyID.String(),
				"jobId":              jobID.String(),
				"candidateId":        candidateID.String(),
				"status":             "INTERVIEW",
				"applicationVersion": 1,
			},
		})
	}))
	defer appUpstream.Close()

	companyClient, _ := client.NewCompanyClient(companyUpstream.URL, "127.0.0.1,localhost", 3*time.Second)
	appClient, _ := client.NewApplicationClient(appUpstream.URL, "127.0.0.1,localhost", 3*time.Second, "0123456789abcdef0123456789abcdef-internal-key")
	cursorCodec, _ := cursor.NewCodec("dev-only-interview-cursor-secret-32-bytes")
	tokenIssuer := livekit.NewTokenIssuer(cfg.LiveKitURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)

	ivRepo := repository.NewInterviewRepository(pool)
	qRepo := repository.NewQueryRepository(pool)
	schedSvc := service.NewSchedulingService(ivRepo, companyClient, appClient, cfg.KafkaInterviewTopic)
	lifeSvc := service.NewLifecycleService(ivRepo, companyClient, appClient, tokenIssuer, cfg.LiveKitURL, cfg.KafkaInterviewTopic)
	qSvc := service.NewQueryService(qRepo, companyClient, appClient, cursorCodec)

	router := handler.NewRouter(
		verifier,
		[]string{"http://localhost:3000"},
		handler.NewSchedulingHandler(schedSvc),
		handler.NewLifecycleHandler(lifeSvc),
		handler.NewQueryHandler(qSvc),
		handler.NewHealthHandler(pool, nil),
	)
	ts := httptest.NewServer(router)
	defer ts.Close()

	signToken := func(sub uuid.UUID, role string, comp *uuid.UUID) string {
		now := time.Now().UTC()
		claims := golangjwt.MapClaims{
			"iss":  "auth-service",
			"aud":  []string{"recruitment-platform"},
			"sub":  sub.String(),
			"jti":  uuid.New().String(),
			"role": role,
			"iat":  now.Unix(),
			"exp":  now.Add(15 * time.Minute).Unix(),
		}
		if comp != nil {
			claims["company_id"] = comp.String()
		}
		tok := golangjwt.NewWithClaims(golangjwt.SigningMethodRS256, claims)
		tok.Header["kid"] = kid
		s, err := tok.SignedString(privKey)
		if err != nil {
			t.Fatalf("sign token: %v", err)
		}
		return s
	}

	recToken := signToken(recruiterID, "RECRUITER", &companyID)
	candToken := signToken(candidateID, "CANDIDATE", nil)

	// 1. Schedule Round 1 ONLINE Interview (starts in 48 hours)
	start1 := time.Now().UTC().Add(48 * time.Hour).Truncate(15 * time.Minute)
	reqID1 := uuid.New()
	body1, _ := json.Marshal(map[string]any{
		"applicationId":   applicationID.String(),
		"requestId":       reqID1.String(),
		"roundNumber":     1,
		"scheduledStart":  start1.Format(time.RFC3339),
		"timeZone":        "Asia/Ho_Chi_Minh",
		"durationMinutes": 45,
		"mode":            "ONLINE",
		"notes":           "Technical architecture round",
	})

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/interviews", bytes.NewReader(body1))
	req.Header.Set("Authorization", "Bearer "+recToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /interviews failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", resp.StatusCode)
	}

	var createEnv struct {
		Data model.InterviewResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&createEnv); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	interviewID := createEnv.Data.ID
	if createEnv.Data.Mode != model.ModeOnline || createEnv.Data.RoomURL == nil {
		t.Fatalf("expected ONLINE mode with RoomURL, got %+v", createEnv.Data)
	}

	// 2. Candidate confirms interview
	confReq, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/interviews/%s/confirm", ts.URL, interviewID), nil)
	confReq.Header.Set("Authorization", "Bearer "+candToken)
	confResp, err := http.DefaultClient.Do(confReq)
	if err != nil {
		t.Fatalf("PATCH /confirm failed: %v", err)
	}
	defer confResp.Body.Close()
	if confResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on confirm, got %d", confResp.StatusCode)
	}

	// 3. Candidate requests reschedule with 2 preferred slots
	reschedBody, _ := json.Marshal(map[string]any{
		"reason":         "Need to shift by 1 day",
		"preferredSlots": []string{start1.Add(24 * time.Hour).Format(time.RFC3339), start1.Add(26 * time.Hour).Format(time.RFC3339)},
	})
	reschedReq, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/interviews/%s/reschedule", ts.URL, interviewID), bytes.NewReader(reschedBody))
	reschedReq.Header.Set("Authorization", "Bearer "+candToken)
	reschedReq.Header.Set("Content-Type", "application/json")
	reschedResp, err := http.DefaultClient.Do(reschedReq)
	if err != nil {
		t.Fatalf("PATCH /reschedule by candidate failed: %v", err)
	}
	defer reschedResp.Body.Close()
	if reschedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on candidate reschedule, got %d", reschedResp.StatusCode)
	}

	// 4. Recruiter reschedules to a new slot (creates revision 2)
	newStart := start1.Add(24 * time.Hour)
	recReschedBody, _ := json.Marshal(map[string]any{
		"scheduledStart":  newStart.Format(time.RFC3339),
		"timeZone":        "Asia/Ho_Chi_Minh",
		"durationMinutes": 45,
		"mode":            "ONLINE",
	})
	recReschedReq, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/interviews/%s/reschedule", ts.URL, interviewID), bytes.NewReader(recReschedBody))
	recReschedReq.Header.Set("Authorization", "Bearer "+recToken)
	recReschedReq.Header.Set("Content-Type", "application/json")
	recReschedResp, err := http.DefaultClient.Do(recReschedReq)
	if err != nil {
		t.Fatalf("PATCH /reschedule by recruiter failed: %v", err)
	}
	defer recReschedResp.Body.Close()
	if recReschedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on recruiter reschedule, got %d", recReschedResp.StatusCode)
	}
	var rev2Env struct {
		Data model.InterviewResponse `json:"data"`
	}
	_ = json.NewDecoder(recReschedResp.Body).Decode(&rev2Env)
	if rev2Env.Data.ScheduleRevision != 2 || rev2Env.Data.SupersedesInterviewID == nil || *rev2Env.Data.SupersedesInterviewID != interviewID {
		t.Fatalf("expected revision 2 superseding %s, got %+v", interviewID, rev2Env.Data)
	}

	// 5. Submit feedback for revision 2
	fbBody, _ := json.Marshal(map[string]any{
		"criteriaScores": map[string]any{
			"technical":     9,
			"communication": 8,
			"attitude":      9,
			"cultureFit":    9,
		},
		"overallScore": 8.75,
		"comment":      "Excellent performance across all competencies",
		"conclusion":   "PASS",
	})
	fbReq, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("%s/interviews/%s/feedback", ts.URL, rev2Env.Data.ID), bytes.NewReader(fbBody))
	fbReq.Header.Set("Authorization", "Bearer "+recToken)
	fbReq.Header.Set("Content-Type", "application/json")
	fbResp, err := http.DefaultClient.Do(fbReq)
	if err != nil {
		t.Fatalf("PATCH /feedback failed: %v", err)
	}
	defer fbResp.Body.Close()
	if fbResp.StatusCode != http.StatusConflict {
		t.Fatalf("expected future-feedback conflict, got %d", fbResp.StatusCode)
	}
	var feedback model.SubmitFeedbackRequest
	if err := json.Unmarshal(fbBody, &feedback); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ivRepo.SubmitFeedback(ctx, rev2Env.Data.ID, companyID, recruiterID, feedback, cfg.KafkaInterviewTopic, newStart.Add(46*time.Minute)); err != nil {
		t.Fatalf("feedback after the interview failed: %v", err)
	}

	// 6. Verify background batch queries (MarkNoShowsBatch & SendRemindersBatch)
	if _, err := ivRepo.MarkNoShowsBatch(ctx, "interview-events", time.Now().UTC(), 10); err != nil {
		t.Fatalf("MarkNoShowsBatch failed: %v", err)
	}
	if _, err := ivRepo.SendRemindersBatch(ctx, "interview-events", time.Now().UTC(), 10); err != nil {
		t.Fatalf("SendRemindersBatch failed: %v", err)
	}
}
