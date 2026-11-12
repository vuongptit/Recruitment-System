package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"

	"interview-service/internal/config"
	"interview-service/internal/model"
	"interview-service/internal/repository"
)

type OutboxPublisher struct {
	repo            *repository.OutboxRepository
	writer          *kafka.Writer
	cfg             *config.Config
	owner           string
	lastSuccessNano atomic.Int64
	lastError       atomic.Value
}

func NewOutboxPublisher(repo *repository.OutboxRepository, cfg *config.Config) *OutboxPublisher {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker"
	}
	suffix := strings.ReplaceAll(uuid.New().String(), "-", "")[:12]
	prefix := sanitizeIdentifier(hostname, 32)
	owner := prefix + "-" + suffix

	var writer *kafka.Writer
	if len(cfg.KafkaBrokers) > 0 {
		writer = &kafka.Writer{
			Addr:         kafka.TCP(cfg.KafkaBrokers...),
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireAll,
			BatchTimeout: 10 * time.Millisecond,
			WriteTimeout: cfg.OutboxSendTimeout,
			ReadTimeout:  cfg.OutboxSendTimeout,
		}
	}

	p := &OutboxPublisher{
		repo:   repo,
		writer: writer,
		cfg:    cfg,
		owner:  owner,
	}
	p.lastSuccessNano.Store(time.Now().UnixNano())
	return p
}

func (p *OutboxPublisher) Start(ctx context.Context) {
	if !p.cfg.OutboxEnabled {
		slog.Info("interview outbox publisher disabled by configuration")
		return
	}
	ticker := time.NewTicker(p.cfg.OutboxPollDelay)
	defer ticker.Stop()

	p.PublishAvailable(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.PublishAvailable(ctx)
		}
	}
}

func (p *OutboxPublisher) Close() error {
	if p.writer != nil {
		return p.writer.Close()
	}
	return nil
}

func (p *OutboxPublisher) PublishAvailable(ctx context.Context) int {
	now := time.Now().UTC().Truncate(time.Millisecond)
	leaseExpiresAt := now.Add(p.cfg.OutboxLeaseDuration)

	batch, err := p.repo.ClaimBatch(ctx, p.owner, p.cfg.OutboxBatchSize, now, leaseExpiresAt)
	if err != nil {
		p.lastError.Store("OUTBOX_CLAIM_FAILED")
		slog.Warn("failed to claim interview outbox batch", "error", err)
		return 0
	}
	if len(batch) == 0 {
		p.lastSuccessNano.Store(time.Now().UnixNano())
		p.lastError.Store("")
		return 0
	}

	publishedCount := 0
	for _, msg := range batch {
		if time.Now().UTC().After(leaseExpiresAt) {
			break
		}
		if p.publishOne(ctx, msg) {
			publishedCount++
		}
	}
	return publishedCount
}

func (p *OutboxPublisher) publishOne(ctx context.Context, msg repository.OutboxMessage) bool {
	if p.writer == nil {
		p.recordFailure(ctx, msg, "KAFKA_WRITER_UNAVAILABLE")
		return false
	}

	var ev model.InterviewEventV1
	if err := json.Unmarshal(msg.Payload, &ev); err != nil {
		p.recordFailure(ctx, msg, "OUTBOX_CORRUPT_PAYLOAD")
		return false
	}

	sendCtx, cancel := context.WithTimeout(ctx, p.cfg.OutboxSendTimeout)
	defer cancel()

	kMsg := kafka.Message{
		Topic: msg.Topic,
		Key:   []byte(msg.EventKey.String()),
		Value: msg.Payload,
		Headers: []kafka.Header{
			{Key: "schema-version", Value: []byte(strconv.Itoa(ev.SchemaVersion))},
			{Key: "event-id", Value: []byte(ev.EventID)},
			{Key: "event-action", Value: []byte(ev.Action)},
			{Key: "interview-id", Value: []byte(ev.InterviewID)},
			{Key: "application-id", Value: []byte(ev.ApplicationID)},
			{Key: "aggregate-version", Value: []byte(strconv.FormatInt(ev.AggregateVersion, 10))},
			{Key: "occurred-at", Value: []byte(ev.OccurredAt)},
		},
	}

	if err := p.writer.WriteMessages(sendCtx, kMsg); err != nil {
		p.recordFailure(ctx, msg, "KAFKA_WRITE_ERROR")
		slog.Warn("failed to publish interview event to kafka",
			"eventId", msg.EventID,
			"interviewId", msg.InterviewID,
			"action", msg.Action,
			"attempt", msg.Attempts+1,
			"error", err,
		)
		return false
	}

	marked, err := p.repo.MarkPublished(ctx, msg.EventID, p.owner, msg.LeaseFence, time.Now().UTC())
	if err != nil || !marked {
		return false
	}
	p.lastSuccessNano.Store(time.Now().UnixNano())
	p.lastError.Store("")
	return true
}

func (p *OutboxPublisher) recordFailure(ctx context.Context, msg repository.OutboxMessage, code string) {
	p.lastError.Store(code)
	nextAttempt := time.Now().UTC().Add(p.nextBackoff(msg.Attempts + 1))
	_, _ = p.repo.MarkFailed(ctx, msg.EventID, p.owner, msg.LeaseFence, code, nextAttempt)
}

func (p *OutboxPublisher) nextBackoff(nextAttemptNumber int) time.Duration {
	shift := nextAttemptNumber - 1
	if shift < 0 {
		shift = 0
	}
	if shift > 16 {
		shift = 16
	}
	candidate := p.cfg.OutboxInitialBackoff * time.Duration(1<<shift)
	if candidate <= 0 || candidate > p.cfg.OutboxMaxBackoff {
		return p.cfg.OutboxMaxBackoff
	}
	return candidate
}

func (p *OutboxPublisher) IsHealthy(ctx context.Context) (bool, map[string]any) {
	details := map[string]any{
		"enabled": p.cfg.OutboxEnabled,
	}
	if !p.cfg.OutboxEnabled {
		return true, details
	}
	oldest, err := p.repo.OldestUnpublishedCreatedAt(ctx)
	if err != nil {
		details["error"] = "OUTBOX_QUERY_FAILED"
		return false, details
	}
	if oldest == nil {
		details["oldestPendingAgeMs"] = 0
		return true, details
	}
	age := time.Since(*oldest)
	if age < 0 {
		age = 0
	}
	details["oldestPendingAgeMs"] = age.Milliseconds()
	if lastErr, ok := p.lastError.Load().(string); ok && lastErr != "" {
		details["lastErrorCode"] = lastErr
	}
	return age <= p.cfg.OutboxMaxAllowedLag, details
}

func sanitizeIdentifier(s string, maxLen int) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
		if b.Len() >= maxLen {
			break
		}
	}
	res := strings.Trim(b.String(), "_-.")
	if res == "" {
		return "worker"
	}
	return res
}
