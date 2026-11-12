package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"interview-service/internal/model"
)

type OutboxMessage struct {
	EventID          uuid.UUID
	StreamPosition   int64
	InterviewID      uuid.UUID
	AggregateVersion int64
	Action           string
	Topic            string
	EventKey         uuid.UUID
	Payload          []byte
	Attempts         int
	LeaseOwner       string
	LeaseFence       int64
}

type OutboxRepository struct {
	pool *pgxpool.Pool
}

func NewOutboxRepository(pool *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{pool: pool}
}

func AppendOutboxTx(ctx context.Context, tx pgx.Tx, topic string, action model.EventAction, iv *model.Interview, actorID uuid.UUID, occurredAt time.Time) error {
	eventID := uuid.New()
	occurredUTC := occurredAt.UTC().Truncate(time.Millisecond)
	_, payloadBytes, err := model.NewInterviewEventV1(eventID, action, iv, actorID, occurredUTC)
	if err != nil {
		return fmt.Errorf("build interview outbox event: %w", err)
	}

	const sql = `
		INSERT INTO interview_event_outbox (
			event_id,
			interview_id,
			aggregate_version,
			action,
			topic,
			event_key,
			payload,
			attempts,
			next_attempt_at,
			lease_owner,
			lease_fence,
			lease_expires_at,
			published_at,
			last_error_code,
			created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7::jsonb, 0, $8, NULL, 0, NULL, NULL, NULL, $8
		)
	`
	_, err = tx.Exec(ctx, sql,
		eventID,
		iv.ID,
		iv.Version,
		string(action),
		topic,
		iv.ID,
		string(payloadBytes),
		occurredUTC,
	)
	if err != nil {
		return fmt.Errorf("insert interview_event_outbox: %w", err)
	}
	return nil
}

func (r *OutboxRepository) ClaimBatch(ctx context.Context, owner string, batchSize int, now time.Time, leaseExpiresAt time.Time) ([]OutboxMessage, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	leaseUTC := leaseExpiresAt.UTC().Truncate(time.Millisecond)

	const sql = `
		WITH due AS (
			SELECT o.event_id
			FROM interview_event_outbox o
			WHERE o.published_at IS NULL
			  AND o.next_attempt_at <= $1
			  AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= $1)
			  AND NOT EXISTS (
				  SELECT 1
				  FROM interview_event_outbox earlier
				  WHERE earlier.interview_id = o.interview_id
				    AND earlier.published_at IS NULL
				    AND earlier.aggregate_version < o.aggregate_version
			  )
			ORDER BY o.next_attempt_at ASC, o.stream_position ASC
			LIMIT $2
			FOR UPDATE OF o SKIP LOCKED
		)
		UPDATE interview_event_outbox target
		SET lease_owner = $3,
		    lease_fence = target.lease_fence + 1,
		    lease_expires_at = $4
		FROM due
		WHERE target.event_id = due.event_id
		RETURNING
			target.event_id,
			target.stream_position,
			target.interview_id,
			target.aggregate_version,
			target.action,
			target.topic,
			target.event_key,
			target.payload::text,
			target.attempts,
			target.lease_owner,
			target.lease_fence
	`

	rows, err := r.pool.Query(ctx, sql, nowUTC, batchSize, owner, leaseUTC)
	if err != nil {
		return nil, fmt.Errorf("claim outbox batch: %w", err)
	}
	defer rows.Close()

	var messages []OutboxMessage
	for rows.Next() {
		var m OutboxMessage
		var payloadText string
		if err := rows.Scan(
			&m.EventID,
			&m.StreamPosition,
			&m.InterviewID,
			&m.AggregateVersion,
			&m.Action,
			&m.Topic,
			&m.EventKey,
			&payloadText,
			&m.Attempts,
			&m.LeaseOwner,
			&m.LeaseFence,
		); err != nil {
			return nil, fmt.Errorf("scan claimed outbox row: %w", err)
		}
		m.Payload = []byte(payloadText)
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate claimed outbox rows: %w", err)
	}
	return messages, nil
}

func (r *OutboxRepository) MarkPublished(ctx context.Context, eventID uuid.UUID, owner string, fence int64, publishedAt time.Time) (bool, error) {
	pubUTC := publishedAt.UTC().Truncate(time.Millisecond)
	const sql = `
		UPDATE interview_event_outbox
		SET published_at = $1,
		    lease_owner = NULL,
		    lease_expires_at = NULL,
		    last_error_code = NULL
		WHERE event_id = $2
		  AND published_at IS NULL
		  AND lease_owner = $3
		  AND lease_fence = $4
	`
	tag, err := r.pool.Exec(ctx, sql, pubUTC, eventID, owner, fence)
	if err != nil {
		return false, fmt.Errorf("mark outbox published: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *OutboxRepository) MarkFailed(ctx context.Context, eventID uuid.UUID, owner string, fence int64, errorCode string, nextAttemptAt time.Time) (bool, error) {
	nextUTC := nextAttemptAt.UTC().Truncate(time.Millisecond)
	const sql = `
		UPDATE interview_event_outbox
		SET attempts = attempts + 1,
		    next_attempt_at = $1,
		    lease_owner = NULL,
		    lease_expires_at = NULL,
		    last_error_code = $2
		WHERE event_id = $3
		  AND published_at IS NULL
		  AND lease_owner = $4
		  AND lease_fence = $5
	`
	tag, err := r.pool.Exec(ctx, sql, nextUTC, errorCode, eventID, owner, fence)
	if err != nil {
		return false, fmt.Errorf("mark outbox failed: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *OutboxRepository) OldestUnpublishedCreatedAt(ctx context.Context) (*time.Time, error) {
	const sql = `
		SELECT MIN(created_at)
		FROM interview_event_outbox
		WHERE published_at IS NULL
	`
	var t *time.Time
	if err := r.pool.QueryRow(ctx, sql).Scan(&t); err != nil {
		return nil, fmt.Errorf("query oldest unpublished outbox row: %w", err)
	}
	return t, nil
}

