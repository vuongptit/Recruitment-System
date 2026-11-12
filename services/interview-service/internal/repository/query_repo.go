package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"interview-service/internal/cursor"
	"interview-service/internal/model"
)

type VisibilityScope struct {
	CompanyID   *uuid.UUID
	CandidateID *uuid.UUID
}

func ForCompany(companyID uuid.UUID) VisibilityScope {
	return VisibilityScope{CompanyID: &companyID}
}

func ForCandidate(candidateID uuid.UUID) VisibilityScope {
	return VisibilityScope{CandidateID: &candidateID}
}

type QueryFilters struct {
	ApplicationID *uuid.UUID
	JobID         *uuid.UUID
	InterviewerID *uuid.UUID
	CandidateID   *uuid.UUID
	Statuses      []model.InterviewStatus
	Mode          *model.InterviewMode
	RoundNumber   *int
	From          *time.Time
	To            *time.Time
}

type BusyInterval struct {
	StartAt time.Time
	EndAt   time.Time
}

type QueryRepository struct {
	pool *pgxpool.Pool
}

func NewQueryRepository(pool *pgxpool.Pool) *QueryRepository {
	return &QueryRepository{pool: pool}
}

func (r *QueryRepository) FindDetail(ctx context.Context, id uuid.UUID, visibility VisibilityScope) (*model.Interview, error) {
	var args []any
	args = append(args, id)
	var where []string
	where = append(where, "id = $1")

	if visibility.CompanyID != nil {
		args = append(args, *visibility.CompanyID)
		where = append(where, fmt.Sprintf("company_id = $%d", len(args)))
	} else if visibility.CandidateID != nil {
		args = append(args, *visibility.CandidateID)
		where = append(where, fmt.Sprintf("candidate_id = $%d", len(args)))
	}

	sql := `SELECT ` + interviewSelectColumns + ` FROM interviews WHERE ` + strings.Join(where, " AND ")
	iv, err := scanInterview(r.pool.QueryRow(ctx, sql, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find interview detail: %w", err)
	}
	return iv, nil
}

func (r *QueryRepository) FindPage(
	ctx context.Context,
	visibility VisibilityScope,
	filters QueryFilters,
	position *cursor.KeysetPosition,
	ascending bool,
	limit int,
	asOf time.Time,
) ([]*model.Interview, error) {
	var args []any
	var where []string

	if visibility.CompanyID != nil {
		args = append(args, *visibility.CompanyID)
		where = append(where, fmt.Sprintf("company_id = $%d", len(args)))
	} else if visibility.CandidateID != nil {
		args = append(args, *visibility.CandidateID)
		where = append(where, fmt.Sprintf("candidate_id = $%d", len(args)))
	}

	args = append(args, asOf.UTC().Truncate(time.Millisecond))
	where = append(where, fmt.Sprintf("created_at <= $%d", len(args)))

	if filters.ApplicationID != nil {
		args = append(args, *filters.ApplicationID)
		where = append(where, fmt.Sprintf("application_id = $%d", len(args)))
	}
	if filters.JobID != nil {
		args = append(args, *filters.JobID)
		where = append(where, fmt.Sprintf("job_id = $%d", len(args)))
	}
	if filters.InterviewerID != nil {
		args = append(args, *filters.InterviewerID)
		where = append(where, fmt.Sprintf("interviewer_id = $%d", len(args)))
	}
	if filters.CandidateID != nil {
		args = append(args, *filters.CandidateID)
		where = append(where, fmt.Sprintf("candidate_id = $%d", len(args)))
	}
	if len(filters.Statuses) > 0 {
		statusStrings := make([]string, len(filters.Statuses))
		for i, s := range filters.Statuses {
			statusStrings[i] = string(s)
		}
		args = append(args, statusStrings)
		where = append(where, fmt.Sprintf("status = ANY($%d)", len(args)))
	}
	if filters.Mode != nil {
		args = append(args, string(*filters.Mode))
		where = append(where, fmt.Sprintf("mode = $%d", len(args)))
	}
	if filters.RoundNumber != nil {
		args = append(args, *filters.RoundNumber)
		where = append(where, fmt.Sprintf("round_number = $%d", len(args)))
	}
	if filters.From != nil {
		args = append(args, filters.From.UTC().Truncate(time.Millisecond))
		where = append(where, fmt.Sprintf("scheduled_start_at >= $%d", len(args)))
	}
	if filters.To != nil {
		args = append(args, filters.To.UTC().Truncate(time.Millisecond))
		where = append(where, fmt.Sprintf("scheduled_start_at < $%d", len(args)))
	}

	if position != nil {
		args = append(args, position.ScheduledStartAt.UTC().Truncate(time.Millisecond), position.InterviewID)
		startIdx := len(args) - 1
		idIdx := len(args)
		if ascending {
			where = append(where, fmt.Sprintf(
				"(scheduled_start_at > $%d OR (scheduled_start_at = $%d AND id > $%d))",
				startIdx, startIdx, idIdx,
			))
		} else {
			where = append(where, fmt.Sprintf(
				"(scheduled_start_at < $%d OR (scheduled_start_at = $%d AND id < $%d))",
				startIdx, startIdx, idIdx,
			))
		}
	}

	orderBy := " ORDER BY scheduled_start_at DESC, id DESC"
	if ascending {
		orderBy = " ORDER BY scheduled_start_at ASC, id ASC"
	}

	args = append(args, limit+1)
	sql := fmt.Sprintf(
		"SELECT %s FROM interviews WHERE %s%s LIMIT $%d",
		interviewSelectColumns,
		strings.Join(where, " AND "),
		orderBy,
		len(args),
	)

	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query interview page: %w", err)
	}
	defer rows.Close()

	var result []*model.Interview
	for rows.Next() {
		iv, err := scanInterview(rows)
		if err != nil {
			return nil, fmt.Errorf("scan interview page row: %w", err)
		}
		result = append(result, iv)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate interview page rows: %w", err)
	}
	return result, nil
}

func (r *QueryRepository) FindBusyIntervals(
	ctx context.Context,
	interviewerID uuid.UUID,
	candidateID uuid.UUID,
	from time.Time,
	to time.Time,
) ([]BusyInterval, error) {
	const sql = `
		SELECT scheduled_start_at, scheduled_end_at
		FROM interviews
		WHERE status IN ('SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'IN_PROGRESS')
		  AND scheduled_start_at < $1
		  AND scheduled_end_at > $2
		  AND (interviewer_id = $3 OR candidate_id = $4)
		ORDER BY scheduled_start_at ASC, scheduled_end_at ASC
	`
	rows, err := r.pool.Query(ctx, sql,
		to.UTC().Truncate(time.Millisecond),
		from.UTC().Truncate(time.Millisecond),
		interviewerID,
		candidateID,
	)
	if err != nil {
		return nil, fmt.Errorf("query busy intervals: %w", err)
	}
	defer rows.Close()

	var intervals []BusyInterval
	for rows.Next() {
		var b BusyInterval
		if err := rows.Scan(&b.StartAt, &b.EndAt); err != nil {
			return nil, fmt.Errorf("scan busy interval: %w", err)
		}
		b.StartAt = b.StartAt.UTC()
		b.EndAt = b.EndAt.UTC()
		intervals = append(intervals, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate busy intervals: %w", err)
	}
	return intervals, nil
}

