package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"interview-service/internal/worker"
)

type HealthHandler struct {
	pool      *pgxpool.Pool
	publisher *worker.OutboxPublisher
}

func NewHealthHandler(pool *pgxpool.Pool, publisher *worker.OutboxPublisher) *HealthHandler {
	return &HealthHandler{
		pool:      pool,
		publisher: publisher,
	}
}

func (h *HealthHandler) Live(w http.ResponseWriter, _ *http.Request) {
	writeHealthJSON(w, http.StatusOK, map[string]any{
		"status":  "UP",
		"service": "interview-service",
	})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	dbUp := true
	if h.pool == nil || h.pool.Ping(ctx) != nil {
		dbUp = false
	}

	outboxUp := true
	var outboxDetails map[string]any
	if h.publisher != nil {
		outboxUp, outboxDetails = h.publisher.IsHealthy(ctx)
	}

	status := "UP"
	httpCode := http.StatusOK
	if !dbUp || !outboxUp {
		status = "DOWN"
		httpCode = http.StatusServiceUnavailable
	}

	writeHealthJSON(w, httpCode, map[string]any{
		"status":  status,
		"service": "interview-service",
		"components": map[string]any{
			"db":     map[string]any{"status": upDown(dbUp)},
			"outbox": map[string]any{"status": upDown(outboxUp), "details": outboxDetails},
		},
	})
}

func (h *HealthHandler) Docs(w http.ResponseWriter, _ *http.Request) {
	writeHealthJSON(w, http.StatusOK, map[string]any{
		"service": "interview-service",
		"version": "1.0.0",
		"runtime": "go",
		"endpoints": []string{
			"POST   /interviews",
			"GET    /interviews",
			"GET    /interviews/my",
			"GET    /interviews/calendar",
			"GET    /interviews/availability",
			"GET    /interviews/{id}",
			"PATCH  /interviews/{id}/confirm",
			"PATCH  /interviews/{id}/reschedule",
			"PATCH  /interviews/{id}/cancel",
			"POST   /interviews/{id}/join",
			"POST   /interviews/{id}/leave",
			"PATCH  /interviews/{id}/feedback",
			"GET    /interviews/{id}/feedback",
			"GET    /health/live",
			"GET    /health/ready",
		},
	})
}

func upDown(ok bool) string {
	if ok {
		return "UP"
	}
	return "DOWN"
}

func writeHealthJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

