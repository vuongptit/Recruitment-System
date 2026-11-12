package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"interview-service/internal/apierror"
	"interview-service/internal/model"
)

const interviewSelectColumns = `
	id,
	application_id,
	application_version,
	application_status_at_schedule,
	company_id,
	job_id,
	candidate_id,
	interviewer_id,
	scheduled_by,
	request_id,
	request_hash,
	round_number,
	schedule_revision,
	supersedes_interview_id,
	scheduled_start_at,
	scheduled_end_at,
	time_zone,
	duration_minutes,
	mode,
	location,
	room_url,
	notes,
	status,
	confirmed_at,
	reschedule_reason,
	COALESCE(reschedule_preferred_slots::text, '[]'),
	cancelled_at,
	cancelled_by,
	cancel_reason,
	started_at,
	ended_at,
	reminder_sent_at,
	created_at,
	updated_at,
	version
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanInterview(row rowScanner) (*model.Interview, error) {
	var iv model.Interview
	var mode string
	var status string
	var preferredSlotsJSON string

	err := row.Scan(
		&iv.ID,
		&iv.ApplicationID,
		&iv.ApplicationVersion,
		&iv.ApplicationStatusAtSchedule,
		&iv.CompanyID,
		&iv.JobID,
		&iv.CandidateID,
		&iv.InterviewerID,
		&iv.ScheduledBy,
		&iv.RequestID,
		&iv.RequestHash,
		&iv.RoundNumber,
		&iv.ScheduleRevision,
		&iv.SupersedesInterviewID,
		&iv.ScheduledStartAt,
		&iv.ScheduledEndAt,
		&iv.TimeZone,
		&iv.DurationMinutes,
		&mode,
		&iv.Location,
		&iv.RoomURL,
		&iv.Notes,
		&status,
		&iv.ConfirmedAt,
		&iv.RescheduleReason,
		&preferredSlotsJSON,
		&iv.CancelledAt,
		&iv.CancelledBy,
		&iv.CancelReason,
		&iv.StartedAt,
		&iv.EndedAt,
		&iv.ReminderSentAt,
		&iv.CreatedAt,
		&iv.UpdatedAt,
		&iv.Version,
	)
	if err != nil {
		return nil, err
	}
	iv.Mode = model.InterviewMode(mode)
	iv.Status = model.InterviewStatus(status)
	iv.ScheduledStartAt = iv.ScheduledStartAt.UTC()
	iv.ScheduledEndAt = iv.ScheduledEndAt.UTC()
	iv.CreatedAt = iv.CreatedAt.UTC()
	iv.UpdatedAt = iv.UpdatedAt.UTC()
	if preferredSlotsJSON != "" && preferredSlotsJSON != "null" {
		_ = json.Unmarshal([]byte(preferredSlotsJSON), &iv.ReschedulePreferredSlots)
	}
	return &iv, nil
}

type InterviewRepository struct {
	pool *pgxpool.Pool
}

func NewInterviewRepository(pool *pgxpool.Pool) *InterviewRepository {
	return &InterviewRepository{pool: pool}
}

func (r *InterviewRepository) FindByScheduledByAndRequestID(ctx context.Context, scheduledBy, requestID uuid.UUID) (*model.Interview, error) {
	sql := `SELECT ` + interviewSelectColumns + ` FROM interviews WHERE scheduled_by = $1 AND request_id = $2`
	iv, err := scanInterview(r.pool.QueryRow(ctx, sql, scheduledBy, requestID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find interview by request_id: %w", err)
	}
	return iv, nil
}

func (r *InterviewRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Interview, error) {
	sql := `SELECT ` + interviewSelectColumns + ` FROM interviews WHERE id = $1`
	iv, err := scanInterview(r.pool.QueryRow(ctx, sql, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get interview by id: %w", err)
	}
	return iv, nil
}

func (r *InterviewRepository) CreateWithOutbox(ctx context.Context, iv *model.Interview, topic string, occurredAt time.Time) (*model.Interview, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	saved, err := insertInterviewTx(ctx, tx, iv)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && isRequestUniqueConflict(pgErr) {
			_ = tx.Rollback(ctx)
			existing, findErr := r.FindByScheduledByAndRequestID(ctx, iv.ScheduledBy, iv.RequestID)
			if findErr != nil {
				return nil, false, findErr
			}
			if existing != nil {
				return existing, false, nil
			}
		}
		return nil, false, mapPgScheduleError(err)
	}

	if err := AppendOutboxTx(ctx, tx, topic, model.ActionScheduled, saved, saved.ScheduledBy, occurredAt); err != nil {
		return nil, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, mapPgScheduleError(err)
	}
	return saved, true, nil
}

func insertInterviewTx(ctx context.Context, tx pgx.Tx, iv *model.Interview) (*model.Interview, error) {
	sql := `
		INSERT INTO interviews (
			id,
			application_id,
			application_version,
			application_status_at_schedule,
			company_id,
			job_id,
			candidate_id,
			interviewer_id,
			scheduled_by,
			request_id,
			request_hash,
			round_number,
			schedule_revision,
			supersedes_interview_id,
			scheduled_start_at,
			scheduled_end_at,
			time_zone,
			duration_minutes,
			mode,
			location,
			room_url,
			notes,
			status,
			created_at,
			updated_at,
			version
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 0
		)
		RETURNING ` + interviewSelectColumns

	return scanInterview(tx.QueryRow(ctx, sql,
		iv.ID,
		iv.ApplicationID,
		iv.ApplicationVersion,
		iv.ApplicationStatusAtSchedule,
		iv.CompanyID,
		iv.JobID,
		iv.CandidateID,
		iv.InterviewerID,
		iv.ScheduledBy,
		iv.RequestID,
		iv.RequestHash,
		iv.RoundNumber,
		iv.ScheduleRevision,
		iv.SupersedesInterviewID,
		iv.ScheduledStartAt.UTC().Truncate(time.Millisecond),
		iv.ScheduledEndAt.UTC().Truncate(time.Millisecond),
		iv.TimeZone,
		iv.DurationMinutes,
		string(iv.Mode),
		iv.Location,
		iv.RoomURL,
		iv.Notes,
		string(iv.Status),
		iv.CreatedAt.UTC().Truncate(time.Millisecond),
		iv.UpdatedAt.UTC().Truncate(time.Millisecond),
	))
}

func (r *InterviewRepository) Confirm(ctx context.Context, id, candidateID uuid.UUID, topic string, now time.Time) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if iv == nil || iv.CandidateID != candidateID {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if iv.Status == model.StatusConfirmed {
		return iv, nil
	}
	if iv.Status != model.StatusScheduled && iv.Status != model.StatusRescheduleRequested {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Only SCHEDULED interviews can be confirmed", map[string]any{
			"currentStatus": iv.Status,
		})
	}
	if !iv.ScheduledStartAt.After(nowUTC) {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_ALREADY_STARTED", "Cannot confirm an interview that has already started or passed", nil)
	}

	updateSQL := `
		UPDATE interviews
		SET status = 'CONFIRMED',
		    confirmed_at = $1,
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id = $2
		RETURNING ` + interviewSelectColumns

	updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, nowUTC, id))
	if err != nil {
		return nil, fmt.Errorf("update interview confirm: %w", err)
	}

	if err := AppendOutboxTx(ctx, tx, topic, model.ActionConfirmed, updated, candidateID, nowUTC); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit confirm tx: %w", err)
	}
	return updated, nil
}

func (r *InterviewRepository) RequestReschedule(ctx context.Context, id, candidateID uuid.UUID, reason string, preferredSlots []string, topic string, now time.Time) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if iv == nil || iv.CandidateID != candidateID {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if iv.Status != model.StatusScheduled && iv.Status != model.StatusConfirmed {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Only SCHEDULED or CONFIRMED interviews can request reschedule", map[string]any{
			"currentStatus": iv.Status,
		})
	}
	if !iv.ScheduledStartAt.After(nowUTC) {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_ALREADY_STARTED", "Cannot request reschedule after scheduled start time", nil)
	}

	slotsJSON, err := json.Marshal(preferredSlots)
	if err != nil {
		return nil, fmt.Errorf("marshal preferred slots: %w", err)
	}

	updateSQL := `
		UPDATE interviews
		SET status = 'RESCHEDULE_REQUESTED',
		    reschedule_reason = $1,
		    reschedule_preferred_slots = $2::jsonb,
		    updated_at = GREATEST($3, created_at),
		    version = version + 1
		WHERE id = $4
		RETURNING ` + interviewSelectColumns

	updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, reason, string(slotsJSON), nowUTC, id))
	if err != nil {
		return nil, fmt.Errorf("update interview reschedule request: %w", err)
	}

	if err := AppendOutboxTx(ctx, tx, topic, model.ActionRescheduleRequested, updated, candidateID, nowUTC); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit reschedule request tx: %w", err)
	}
	return updated, nil
}

func (r *InterviewRepository) RescheduleByRecruiter(
	ctx context.Context,
	oldID uuid.UUID,
	companyID uuid.UUID,
	recruiterID uuid.UUID,
	newInterview *model.Interview,
	cancelReason string,
	topic string,
	now time.Time,
) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	oldIv, err := lockInterviewTx(ctx, tx, oldID)
	if err != nil {
		return nil, err
	}
	if oldIv == nil || oldIv.CompanyID != companyID {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if oldIv.Status != model.StatusScheduled && oldIv.Status != model.StatusConfirmed && oldIv.Status != model.StatusRescheduleRequested {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Only active interviews (SCHEDULED, CONFIRMED, RESCHEDULE_REQUESTED) can be rescheduled", map[string]any{
			"currentStatus": oldIv.Status,
		})
	}

	cancelSQL := `
		UPDATE interviews
		SET status = 'CANCELLED',
		    cancelled_at = $1,
		    cancelled_by = $2,
		    cancel_reason = $3,
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id = $4
		RETURNING ` + interviewSelectColumns

	cancelledOld, err := scanInterview(tx.QueryRow(ctx, cancelSQL, nowUTC, recruiterID, cancelReason, oldID))
	if err != nil {
		return nil, fmt.Errorf("cancel superseded interview: %w", err)
	}
	if err := AppendOutboxTx(ctx, tx, topic, model.ActionCancelled, cancelledOld, recruiterID, nowUTC); err != nil {
		return nil, err
	}

	newInterview.ApplicationID = oldIv.ApplicationID
	newInterview.ApplicationVersion = oldIv.ApplicationVersion
	newInterview.ApplicationStatusAtSchedule = oldIv.ApplicationStatusAtSchedule
	newInterview.CompanyID = oldIv.CompanyID
	newInterview.JobID = oldIv.JobID
	newInterview.CandidateID = oldIv.CandidateID
	if newInterview.InterviewerID == uuid.Nil {
		newInterview.InterviewerID = oldIv.InterviewerID
	}
	newInterview.RoundNumber = oldIv.RoundNumber
	newInterview.ScheduleRevision = oldIv.ScheduleRevision + 1
	oldIDCopy := oldIv.ID
	newInterview.SupersedesInterviewID = &oldIDCopy
	if newInterview.Mode == model.ModeOnline {
		roomURL := fmt.Sprintf("/interviews/%s/room", newInterview.ID.String())
		newInterview.RoomURL = &roomURL
	}

	savedNew, err := insertInterviewTx(ctx, tx, newInterview)
	if err != nil {
		return nil, mapPgScheduleError(err)
	}
	if err := AppendOutboxTx(ctx, tx, topic, model.ActionRescheduled, savedNew, recruiterID, nowUTC); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, mapPgScheduleError(err)
	}
	return savedNew, nil
}

func (r *InterviewRepository) Cancel(
	ctx context.Context,
	id uuid.UUID,
	actorID uuid.UUID,
	role string,
	companyID *uuid.UUID,
	reason string,
	topic string,
	now time.Time,
) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if iv == nil || !canActorAccessInterview(iv, actorID, role, companyID) {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if iv.Status == model.StatusCancelled {
		return iv, nil
	}
	if iv.Status != model.StatusScheduled && iv.Status != model.StatusConfirmed && iv.Status != model.StatusRescheduleRequested {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Cannot cancel interview in current status", map[string]any{
			"currentStatus": iv.Status,
		})
	}
	minCancelCutoff := nowUTC.Add(2 * time.Hour)
	if iv.ScheduledStartAt.Before(minCancelCutoff) {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_CANCEL_TOO_LATE", "Interviews can only be cancelled at least 2 hours before the scheduled start time", map[string]any{
			"scheduledStart": model.FormatMillisUTC(iv.ScheduledStartAt),
		})
	}

	updateSQL := `
		UPDATE interviews
		SET status = 'CANCELLED',
		    cancelled_at = $1,
		    cancelled_by = $2,
		    cancel_reason = $3,
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id = $4
		RETURNING ` + interviewSelectColumns

	updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, nowUTC, actorID, reason, id))
	if err != nil {
		return nil, fmt.Errorf("update cancel interview: %w", err)
	}

	if err := AppendOutboxTx(ctx, tx, topic, model.ActionCancelled, updated, actorID, nowUTC); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit cancel tx: %w", err)
	}
	return updated, nil
}

func (r *InterviewRepository) JoinRoom(
	ctx context.Context,
	id uuid.UUID,
	actorID uuid.UUID,
	role string,
	companyID *uuid.UUID,
	roomURL string,
	topic string,
	now time.Time,
) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if iv == nil || !canActorAccessInterview(iv, actorID, role, companyID) {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if iv.Mode != model.ModeOnline {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_NOT_ONLINE", "Only ONLINE interviews have a video room", nil)
	}
	if iv.Status != model.StatusScheduled && iv.Status != model.StatusConfirmed && iv.Status != model.StatusInProgress {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Interview is not in a joinable state", map[string]any{
			"currentStatus": iv.Status,
		})
	}

	earliestJoin := iv.ScheduledStartAt.Add(-15 * time.Minute)
	latestJoin := iv.ScheduledEndAt.Add(60 * time.Minute)
	if nowUTC.Before(earliestJoin) {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_JOIN_TOO_EARLY", "Video room opens 15 minutes before scheduled start time", map[string]any{
			"opensAt":        model.FormatMillisUTC(earliestJoin),
			"scheduledStart": model.FormatMillisUTC(iv.ScheduledStartAt),
		})
	}
	if nowUTC.After(latestJoin) {
		return nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_JOIN_WINDOW_EXPIRED", "Interview join window has expired", map[string]any{
			"expiredAt":    model.FormatMillisUTC(latestJoin),
			"scheduledEnd": model.FormatMillisUTC(iv.ScheduledEndAt),
		})
	}

	if iv.Status != model.StatusInProgress || iv.StartedAt == nil {
		updateSQL := `
			UPDATE interviews
			SET status = 'IN_PROGRESS',
			    started_at = COALESCE(started_at, $1),
			    room_url = COALESCE(room_url, $2),
			    updated_at = GREATEST($1, created_at),
			    version = version + 1
			WHERE id = $3
			RETURNING ` + interviewSelectColumns

		updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, nowUTC, roomURL, id))
		if err != nil {
			return nil, fmt.Errorf("update interview in_progress: %w", err)
		}
		if err := AppendOutboxTx(ctx, tx, topic, model.ActionInProgress, updated, actorID, nowUTC); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit join tx: %w", err)
		}
		return updated, nil
	}

	return iv, nil
}

func (r *InterviewRepository) LeaveRoom(
	ctx context.Context,
	id uuid.UUID,
	actorID uuid.UUID,
	role string,
	companyID *uuid.UUID,
	now time.Time,
) (*model.Interview, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if iv == nil || !canActorAccessInterview(iv, actorID, role, companyID) {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}

	updateSQL := `
		UPDATE interviews
		SET ended_at = $1,
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id = $2
		RETURNING ` + interviewSelectColumns

	updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, nowUTC, id))
	if err != nil {
		return nil, fmt.Errorf("update interview leave room: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit leave room tx: %w", err)
	}
	return updated, nil
}

func (r *InterviewRepository) SubmitFeedback(
	ctx context.Context,
	id uuid.UUID,
	companyID uuid.UUID,
	evaluatorID uuid.UUID,
	req model.SubmitFeedbackRequest,
	topic string,
	now time.Time,
) (*model.Interview, *model.InterviewFeedback, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	iv, err := lockInterviewTx(ctx, tx, id)
	if err != nil {
		return nil, nil, err
	}
	if iv == nil || iv.CompanyID != companyID {
		return nil, nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if iv.Status == model.StatusCancelled || iv.Status == model.StatusNoShow {
		return nil, nil, apierror.NewStatus(http.StatusConflict, "INTERVIEW_STATE_INVALID", "Cannot submit feedback for a cancelled or no-show interview", map[string]any{
			"currentStatus": iv.Status,
		})
	}

	scoresJSON, err := json.Marshal(req.CriteriaScores)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal criteria scores: %w", err)
	}

	feedbackID := uuid.New()
	const upsertFeedbackSQL = `
		INSERT INTO interview_feedbacks (
			id,
			interview_id,
			evaluator_id,
			criteria_scores,
			overall_score,
			comment,
			conclusion,
			created_at
		) VALUES (
			$1, $2, $3, $4::jsonb, $5, $6, $7, $8
		)
		ON CONFLICT (interview_id) DO UPDATE
		SET evaluator_id = EXCLUDED.evaluator_id,
		    criteria_scores = EXCLUDED.criteria_scores,
		    overall_score = EXCLUDED.overall_score,
		    comment = EXCLUDED.comment,
		    conclusion = EXCLUDED.conclusion
		RETURNING id, interview_id, evaluator_id, criteria_scores::text, overall_score, comment, conclusion, created_at
	`
	var fb model.InterviewFeedback
	var rawScores string
	var conclusion string
	var createdAt time.Time
	err = tx.QueryRow(ctx, upsertFeedbackSQL,
		feedbackID,
		id,
		evaluatorID,
		string(scoresJSON),
		req.OverallScore,
		req.Comment,
		req.Conclusion,
		nowUTC,
	).Scan(
		&fb.ID,
		&fb.InterviewID,
		&fb.EvaluatorID,
		&rawScores,
		&fb.OverallScore,
		&fb.Comment,
		&conclusion,
		&createdAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("upsert interview feedback: %w", err)
	}
	_ = json.Unmarshal([]byte(rawScores), &fb.CriteriaScores)
	fb.Conclusion = model.FeedbackConclusion(conclusion)
	fb.SuggestedApplicationAction = suggestedActionForConclusion(fb.Conclusion)
	fb.CreatedAt = model.FormatMillisUTC(createdAt)

	wasCompleted := iv.Status == model.StatusCompleted
	updateSQL := `
		UPDATE interviews
		SET status = 'COMPLETED',
		    started_at = COALESCE(started_at, scheduled_start_at),
		    ended_at = COALESCE(ended_at, $1),
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id = $2
		RETURNING ` + interviewSelectColumns

	updated, err := scanInterview(tx.QueryRow(ctx, updateSQL, nowUTC, id))
	if err != nil {
		return nil, nil, fmt.Errorf("update interview completed: %w", err)
	}

	if !wasCompleted {
		if err := AppendOutboxTx(ctx, tx, topic, model.ActionCompleted, updated, evaluatorID, nowUTC); err != nil {
			return nil, nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("commit feedback tx: %w", err)
	}
	return updated, &fb, nil
}

func (r *InterviewRepository) GetFeedback(ctx context.Context, interviewID uuid.UUID, actorID uuid.UUID, role string, companyID *uuid.UUID) (*model.InterviewFeedback, error) {
	iv, err := r.GetByID(ctx, interviewID)
	if err != nil {
		return nil, err
	}
	if iv == nil || !canActorAccessInterview(iv, actorID, role, companyID) {
		return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_NOT_FOUND", "Interview was not found", nil)
	}
	if role != "RECRUITER" {
		return nil, apierror.NewStatus(http.StatusForbidden, "AUTH_FORBIDDEN", "Only recruiters can view detailed interview evaluation scores", nil)
	}

	const sql = `
		SELECT id, interview_id, evaluator_id, criteria_scores::text, overall_score, comment, conclusion, created_at
		FROM interview_feedbacks
		WHERE interview_id = $1
	`
	var fb model.InterviewFeedback
	var rawScores string
	var conclusion string
	var createdAt time.Time
	err = r.pool.QueryRow(ctx, sql, interviewID).Scan(
		&fb.ID,
		&fb.InterviewID,
		&fb.EvaluatorID,
		&rawScores,
		&fb.OverallScore,
		&fb.Comment,
		&conclusion,
		&createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apierror.NewStatus(http.StatusNotFound, "INTERVIEW_FEEDBACK_NOT_FOUND", "No evaluation feedback has been submitted for this interview yet", nil)
		}
		return nil, fmt.Errorf("query interview feedback: %w", err)
	}
	_ = json.Unmarshal([]byte(rawScores), &fb.CriteriaScores)
	fb.Conclusion = model.FeedbackConclusion(conclusion)
	fb.SuggestedApplicationAction = suggestedActionForConclusion(fb.Conclusion)
	fb.CreatedAt = model.FormatMillisUTC(createdAt)
	return &fb, nil
}

func (r *InterviewRepository) MarkNoShowsBatch(ctx context.Context, topic string, now time.Time, batchSize int) (int, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin no-show tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	sql := `
		WITH due AS (
			SELECT id
			FROM interviews
			WHERE status IN ('SCHEDULED', 'CONFIRMED')
			  AND scheduled_end_at < $1
			  AND started_at IS NULL
			ORDER BY scheduled_end_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		UPDATE interviews
		SET status = 'NO_SHOW',
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id IN (SELECT id FROM due)
		RETURNING ` + interviewSelectColumns

	rows, err := tx.Query(ctx, sql, nowUTC, batchSize)
	if err != nil {
		return 0, fmt.Errorf("mark no-shows batch: %w", err)
	}
	var updated []*model.Interview
	for rows.Next() {
		iv, scanErr := scanInterview(rows)
		if scanErr != nil {
			rows.Close()
			return 0, scanErr
		}
		updated = append(updated, iv)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, iv := range updated {
		if err := AppendOutboxTx(ctx, tx, topic, model.ActionNoShow, iv, iv.InterviewerID, nowUTC); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit no-shows batch: %w", err)
	}
	return len(updated), nil
}

func (r *InterviewRepository) SendRemindersBatch(ctx context.Context, topic string, now time.Time, batchSize int) (int, error) {
	nowUTC := now.UTC().Truncate(time.Millisecond)
	horizonUTC := nowUTC.Add(24 * time.Hour)

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin reminder tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	sql := `
		WITH due AS (
			SELECT id
			FROM interviews
			WHERE status = 'SCHEDULED'
			  AND confirmed_at IS NULL
			  AND reminder_sent_at IS NULL
			  AND scheduled_start_at > $1
			  AND scheduled_start_at <= $2
			ORDER BY scheduled_start_at ASC
			LIMIT $3
			FOR UPDATE SKIP LOCKED
		)
		UPDATE interviews
		SET reminder_sent_at = $1,
		    updated_at = GREATEST($1, created_at),
		    version = version + 1
		WHERE id IN (SELECT id FROM due)
		RETURNING ` + interviewSelectColumns

	rows, err := tx.Query(ctx, sql, nowUTC, horizonUTC, batchSize)
	if err != nil {
		return 0, fmt.Errorf("send reminders batch: %w", err)
	}
	var updated []*model.Interview
	for rows.Next() {
		iv, scanErr := scanInterview(rows)
		if scanErr != nil {
			rows.Close()
			return 0, scanErr
		}
		updated = append(updated, iv)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, iv := range updated {
		if err := AppendOutboxTx(ctx, tx, topic, model.ActionReminder, iv, iv.InterviewerID, nowUTC); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit reminders batch: %w", err)
	}
	return len(updated), nil
}

func lockInterviewTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*model.Interview, error) {
	sql := `SELECT ` + interviewSelectColumns + ` FROM interviews WHERE id = $1 FOR UPDATE`
	iv, err := scanInterview(tx.QueryRow(ctx, sql, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("lock interview row: %w", err)
	}
	return iv, nil
}

func canActorAccessInterview(iv *model.Interview, actorID uuid.UUID, role string, companyID *uuid.UUID) bool {
	if role == "CANDIDATE" {
		return iv.CandidateID == actorID
	}
	if role == "RECRUITER" && companyID != nil {
		return iv.CompanyID == *companyID
	}
	return false
}

func suggestedActionForConclusion(c model.FeedbackConclusion) string {
	switch c {
	case model.ConclusionPass:
		return "OFFER"
	case model.ConclusionFail:
		return "REJECTED"
	case model.ConclusionNextRound:
		return "SCHEDULE_NEXT_ROUND"
	default:
		return "REVIEWING"
	}
}

func isRequestUniqueConflict(pgErr *pgconn.PgError) bool {
	return pgErr.Code == "23505" && strings.Contains(strings.ToLower(pgErr.ConstraintName), "request_unique")
}

func mapPgScheduleError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return err
	}
	constraint := strings.ToLower(pgErr.ConstraintName)
	switch {
	case strings.Contains(constraint, "candidate_schedule"):
		return apierror.NewStatus(http.StatusConflict, "INTERVIEW_CANDIDATE_CONFLICT", "Candidate already has an overlapping interview", nil)
	case strings.Contains(constraint, "interviewer_schedule"):
		return apierror.NewStatus(http.StatusConflict, "INTERVIEW_INTERVIEWER_CONFLICT", "Interviewer already has an overlapping interview", nil)
	case strings.Contains(constraint, "active_application_round"):
		return apierror.NewStatus(http.StatusConflict, "INTERVIEW_ROUND_ALREADY_SCHEDULED", "This application round already has an active interview", nil)
	case pgErr.Code == "23P01":
		return apierror.NewStatus(http.StatusConflict, "INTERVIEW_SCHEDULE_CONFLICT", "Interview schedule conflicts with an existing interview", nil)
	default:
		return err
	}
}
