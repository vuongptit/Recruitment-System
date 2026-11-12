package model

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	EventSchemaVersion = 1
	MaxJSONSafeInt     = 9007199254740991
)

type EventAction string

const (
	ActionScheduled           EventAction = "SCHEDULED"
	ActionConfirmed           EventAction = "CONFIRMED"
	ActionRescheduleRequested EventAction = "RESCHEDULE_REQUESTED"
	ActionRescheduled         EventAction = "RESCHEDULED"
	ActionInProgress          EventAction = "IN_PROGRESS"
	ActionCompleted           EventAction = "COMPLETED"
	ActionCancelled           EventAction = "CANCELLED"
	ActionNoShow              EventAction = "NO_SHOW"
	ActionReminder            EventAction = "REMINDER"
)

type InterviewEventV1 struct {
	SchemaVersion    int             `json:"schema_version"`
	EventID          string          `json:"event_id"`
	Action           EventAction     `json:"action"`
	InterviewID      string          `json:"interview_id"`
	ApplicationID    string          `json:"application_id"`
	CandidateID      string          `json:"candidate_id"`
	InterviewerID    string          `json:"interviewer_id"`
	ActorID          string          `json:"actor_id"`
	RoundNumber      int             `json:"round_number"`
	ScheduleRevision int             `json:"schedule_revision"`
	ScheduledStartAt string          `json:"scheduled_start_at"`
	ScheduledEndAt   string          `json:"scheduled_end_at"`
	Status           InterviewStatus `json:"status"`
	AggregateVersion int64           `json:"aggregate_version"`
	OccurredAt       string          `json:"occurred_at"`
}

func NewInterviewEventV1(eventID uuid.UUID, action EventAction, iv *Interview, actorID uuid.UUID, occurredAt time.Time) (*InterviewEventV1, []byte, error) {
	if eventID.Version() != 4 || eventID.Variant() != uuid.RFC4122 {
		return nil, nil, errors.New("interview event ID must be a canonical UUIDv4")
	}
	if iv == nil {
		return nil, nil, errors.New("interview is required")
	}
	if iv.Version < 0 || iv.Version > MaxJSONSafeInt {
		return nil, nil, errors.New("interview aggregate version must be a non-negative JSON-safe integer")
	}
	if iv.RoundNumber < 1 || iv.RoundNumber > 20 || iv.ScheduleRevision < 1 {
		return nil, nil, errors.New("interview round and schedule revision are invalid")
	}
	if !iv.ScheduledEndAt.After(iv.ScheduledStartAt) {
		return nil, nil, errors.New("interview schedule interval is invalid")
	}
	if actorID == uuid.Nil {
		actorID = iv.InterviewerID
	}

	ev := &InterviewEventV1{
		SchemaVersion:    EventSchemaVersion,
		EventID:          eventID.String(),
		Action:           action,
		InterviewID:      iv.ID.String(),
		ApplicationID:    iv.ApplicationID.String(),
		CandidateID:      iv.CandidateID.String(),
		InterviewerID:    iv.InterviewerID.String(),
		ActorID:          actorID.String(),
		RoundNumber:      iv.RoundNumber,
		ScheduleRevision: iv.ScheduleRevision,
		ScheduledStartAt: FormatMillisUTC(iv.ScheduledStartAt),
		ScheduledEndAt:   FormatMillisUTC(iv.ScheduledEndAt),
		Status:           iv.Status,
		AggregateVersion: iv.Version,
		OccurredAt:       FormatMillisUTC(occurredAt),
	}
	payloadBytes, err := json.Marshal(ev)
	if err != nil {
		return nil, nil, err
	}
	return ev, payloadBytes, nil
}
