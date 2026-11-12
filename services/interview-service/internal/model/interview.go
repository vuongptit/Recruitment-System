package model

import (
	"time"

	"github.com/google/uuid"
)

type InterviewMode string

const (
	ModeOffline InterviewMode = "OFFLINE"
	ModeOnline  InterviewMode = "ONLINE"
)

type InterviewStatus string

const (
	StatusScheduled           InterviewStatus = "SCHEDULED"
	StatusConfirmed           InterviewStatus = "CONFIRMED"
	StatusRescheduleRequested InterviewStatus = "RESCHEDULE_REQUESTED"
	StatusInProgress          InterviewStatus = "IN_PROGRESS"
	StatusCompleted           InterviewStatus = "COMPLETED"
	StatusCancelled           InterviewStatus = "CANCELLED"
	StatusNoShow              InterviewStatus = "NO_SHOW"
)

func IsValidStatus(s string) bool {
	switch InterviewStatus(s) {
	case StatusScheduled, StatusConfirmed, StatusRescheduleRequested, StatusInProgress, StatusCompleted, StatusCancelled, StatusNoShow:
		return true
	default:
		return false
	}
}

type FeedbackConclusion string

const (
	ConclusionPass      FeedbackConclusion = "PASS"
	ConclusionFail      FeedbackConclusion = "FAIL"
	ConclusionNextRound FeedbackConclusion = "NEXT_ROUND"
)

type Interview struct {
	ID                          uuid.UUID       `json:"id"`
	ApplicationID               uuid.UUID       `json:"applicationId"`
	ApplicationVersion          int64           `json:"applicationVersion"`
	ApplicationStatusAtSchedule string          `json:"-"`
	CompanyID                   uuid.UUID       `json:"companyId"`
	JobID                       uuid.UUID       `json:"jobId"`
	CandidateID                 uuid.UUID       `json:"candidateId"`
	InterviewerID               uuid.UUID       `json:"interviewerId"`
	ScheduledBy                 uuid.UUID       `json:"scheduledBy"`
	RequestID                   uuid.UUID       `json:"-"`
	RequestHash                 string          `json:"-"`
	RoundNumber                 int             `json:"roundNumber"`
	ScheduleRevision            int             `json:"scheduleRevision"`
	SupersedesInterviewID       *uuid.UUID      `json:"supersedesInterviewId,omitempty"`
	ScheduledStartAt            time.Time       `json:"scheduledStart"`
	ScheduledEndAt              time.Time       `json:"scheduledEnd"`
	TimeZone                    string          `json:"timeZone"`
	DurationMinutes             int             `json:"durationMinutes"`
	Mode                        InterviewMode   `json:"mode"`
	Location                    *string         `json:"location"`
	RoomURL                     *string         `json:"roomUrl,omitempty"`
	Notes                       *string         `json:"notes"`
	Status                      InterviewStatus `json:"status"`
	ConfirmedAt                 *time.Time      `json:"confirmedAt,omitempty"`
	RescheduleReason            *string         `json:"rescheduleReason,omitempty"`
	ReschedulePreferredSlots    []string        `json:"reschedulePreferredSlots,omitempty"`
	CancelledAt                 *time.Time      `json:"cancelledAt,omitempty"`
	CancelledBy                 *uuid.UUID      `json:"cancelledBy,omitempty"`
	CancelReason                *string         `json:"cancelReason,omitempty"`
	StartedAt                   *time.Time      `json:"startedAt,omitempty"`
	EndedAt                     *time.Time      `json:"endedAt,omitempty"`
	ReminderSentAt              *time.Time      `json:"reminderSentAt,omitempty"`
	CreatedAt                   time.Time       `json:"createdAt"`
	UpdatedAt                   time.Time       `json:"updatedAt"`
	Version                     int64           `json:"version"`
}

type InterviewResponse struct {
	ID                       uuid.UUID       `json:"id"`
	ApplicationID            uuid.UUID       `json:"applicationId"`
	ApplicationVersion       int64           `json:"applicationVersion"`
	JobID                    uuid.UUID       `json:"jobId"`
	CompanyID                uuid.UUID       `json:"companyId"`
	CandidateID              uuid.UUID       `json:"candidateId"`
	InterviewerID            uuid.UUID       `json:"interviewerId"`
	RoundNumber              int             `json:"roundNumber"`
	ScheduleRevision         int             `json:"scheduleRevision"`
	SupersedesInterviewID    *uuid.UUID      `json:"supersedesInterviewId,omitempty"`
	ScheduledStart           string          `json:"scheduledStart"`
	ScheduledEnd             string          `json:"scheduledEnd"`
	TimeZone                 string          `json:"timeZone"`
	DurationMinutes          int             `json:"durationMinutes"`
	Mode                     InterviewMode   `json:"mode"`
	Location                 *string         `json:"location"`
	RoomURL                  *string         `json:"roomUrl,omitempty"`
	Notes                    *string         `json:"notes"`
	Status                   InterviewStatus `json:"status"`
	ConfirmedAt              *string         `json:"confirmedAt,omitempty"`
	RescheduleReason         *string         `json:"rescheduleReason,omitempty"`
	ReschedulePreferredSlots []string        `json:"reschedulePreferredSlots,omitempty"`
	CancelReason             *string         `json:"cancelReason,omitempty"`
	StartedAt                *string         `json:"startedAt,omitempty"`
	EndedAt                  *string         `json:"endedAt,omitempty"`
	CreatedAt                string          `json:"createdAt"`
	Version                  int64           `json:"version"`
}

func FormatMillisUTC(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func formatOptionalTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := FormatMillisUTC(*t)
	return &s
}

func ToInterviewResponse(iv *Interview) InterviewResponse {
	return InterviewResponse{
		ID:                       iv.ID,
		ApplicationID:            iv.ApplicationID,
		ApplicationVersion:       iv.ApplicationVersion,
		JobID:                    iv.JobID,
		CompanyID:                iv.CompanyID,
		CandidateID:              iv.CandidateID,
		InterviewerID:            iv.InterviewerID,
		RoundNumber:              iv.RoundNumber,
		ScheduleRevision:         iv.ScheduleRevision,
		SupersedesInterviewID:    iv.SupersedesInterviewID,
		ScheduledStart:           FormatMillisUTC(iv.ScheduledStartAt),
		ScheduledEnd:             FormatMillisUTC(iv.ScheduledEndAt),
		TimeZone:                 iv.TimeZone,
		DurationMinutes:          iv.DurationMinutes,
		Mode:                     iv.Mode,
		Location:                 iv.Location,
		RoomURL:                  iv.RoomURL,
		Notes:                    iv.Notes,
		Status:                   iv.Status,
		ConfirmedAt:              formatOptionalTime(iv.ConfirmedAt),
		RescheduleReason:         iv.RescheduleReason,
		ReschedulePreferredSlots: iv.ReschedulePreferredSlots,
		CancelReason:             iv.CancelReason,
		StartedAt:                formatOptionalTime(iv.StartedAt),
		EndedAt:                  formatOptionalTime(iv.EndedAt),
		CreatedAt:                FormatMillisUTC(iv.CreatedAt),
		Version:                  iv.Version,
	}
}

type QueryItem struct {
	ID                       uuid.UUID       `json:"id"`
	ApplicationID            uuid.UUID       `json:"applicationId"`
	CompanyID                *uuid.UUID      `json:"companyId,omitempty"`
	JobID                    uuid.UUID       `json:"jobId"`
	CandidateID              *uuid.UUID      `json:"candidateId,omitempty"`
	InterviewerID            *uuid.UUID      `json:"interviewerId,omitempty"`
	ScheduledBy              *uuid.UUID      `json:"scheduledBy,omitempty"`
	RoundNumber              int             `json:"roundNumber"`
	ScheduleRevision         int             `json:"scheduleRevision"`
	SupersedesInterviewID    *uuid.UUID      `json:"supersedesInterviewId,omitempty"`
	ScheduledStart           string          `json:"scheduledStart"`
	ScheduledEnd             string          `json:"scheduledEnd"`
	TimeZone                 string          `json:"timeZone"`
	DurationMinutes          int             `json:"durationMinutes"`
	Mode                     InterviewMode   `json:"mode"`
	Location                 *string         `json:"location,omitempty"`
	RoomURL                  *string         `json:"roomUrl,omitempty"`
	Notes                    *string         `json:"notes,omitempty"`
	Status                   InterviewStatus `json:"status"`
	ConfirmedAt              *string         `json:"confirmedAt,omitempty"`
	RescheduleReason         *string         `json:"rescheduleReason,omitempty"`
	ReschedulePreferredSlots []string        `json:"reschedulePreferredSlots,omitempty"`
	CancelReason             *string         `json:"cancelReason,omitempty"`
	StartedAt                *string         `json:"startedAt,omitempty"`
	EndedAt                  *string         `json:"endedAt,omitempty"`
	CreatedAt                *string         `json:"createdAt,omitempty"`
	UpdatedAt                *string         `json:"updatedAt,omitempty"`
	Version                  int64           `json:"version"`
}

func ToQueryItem(iv *Interview, role string, detail bool) QueryItem {
	isRecruiter := role == "RECRUITER"
	item := QueryItem{
		ID:                       iv.ID,
		ApplicationID:            iv.ApplicationID,
		JobID:                    iv.JobID,
		RoundNumber:              iv.RoundNumber,
		ScheduleRevision:         iv.ScheduleRevision,
		SupersedesInterviewID:    iv.SupersedesInterviewID,
		ScheduledStart:           FormatMillisUTC(iv.ScheduledStartAt),
		ScheduledEnd:             FormatMillisUTC(iv.ScheduledEndAt),
		TimeZone:                 iv.TimeZone,
		DurationMinutes:          iv.DurationMinutes,
		Mode:                     iv.Mode,
		Location:                 iv.Location,
		RoomURL:                  iv.RoomURL,
		Status:                   iv.Status,
		ConfirmedAt:              formatOptionalTime(iv.ConfirmedAt),
		RescheduleReason:         iv.RescheduleReason,
		ReschedulePreferredSlots: iv.ReschedulePreferredSlots,
		CancelReason:             iv.CancelReason,
		StartedAt:                formatOptionalTime(iv.StartedAt),
		EndedAt:                  formatOptionalTime(iv.EndedAt),
		Version:                  iv.Version,
	}
	if isRecruiter {
		compID := iv.CompanyID
		candID := iv.CandidateID
		interviewerID := iv.InterviewerID
		item.CompanyID = &compID
		item.CandidateID = &candID
		item.InterviewerID = &interviewerID
		if detail {
			schedBy := iv.ScheduledBy
			created := FormatMillisUTC(iv.CreatedAt)
			updated := FormatMillisUTC(iv.UpdatedAt)
			item.ScheduledBy = &schedBy
			item.Notes = iv.Notes
			item.CreatedAt = &created
			item.UpdatedAt = &updated
		}
	}
	return item
}

type QueryPage struct {
	Items      []QueryItem `json:"items"`
	NextCursor *string     `json:"nextCursor"`
	AsOf       string      `json:"asOf"`
}

type Slot struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type AvailabilityResponse struct {
	ApplicationID   uuid.UUID `json:"applicationId"`
	InterviewerID   uuid.UUID `json:"interviewerId"`
	From            string    `json:"from"`
	To              string    `json:"to"`
	TimeZone        string    `json:"timeZone"`
	DurationMinutes int       `json:"durationMinutes"`
	StepMinutes     int       `json:"stepMinutes"`
	Slots           []Slot    `json:"slots"`
	NextCursor      *string   `json:"nextCursor"`
	AsOf            string    `json:"asOf"`
}

type CreateInterviewRequest struct {
	ApplicationID   *uuid.UUID `json:"applicationId"`
	RequestID       *uuid.UUID `json:"requestId"`
	InterviewerID   *uuid.UUID `json:"interviewerId,omitempty"`
	RoundNumber     int        `json:"roundNumber"`
	ScheduledStart  string     `json:"scheduledStart"`
	TimeZone        string     `json:"timeZone"`
	DurationMinutes int        `json:"durationMinutes"`
	Mode            string     `json:"mode"`
	Location        *string    `json:"location"`
	Notes           *string    `json:"notes"`
}

type RescheduleRequest struct {
	// Candidate reschedule request fields:
	Reason         *string  `json:"reason,omitempty"`
	PreferredSlots []string `json:"preferredSlots,omitempty"`

	// Recruiter reschedule fields:
	RequestID       *uuid.UUID `json:"requestId,omitempty"`
	ScheduledStart  *string    `json:"scheduledStart,omitempty"`
	TimeZone        *string    `json:"timeZone,omitempty"`
	DurationMinutes *int       `json:"durationMinutes,omitempty"`
	Mode            *string    `json:"mode,omitempty"`
	Location        *string    `json:"location,omitempty"`
	Notes           *string    `json:"notes,omitempty"`
}

type CancelInterviewRequest struct {
	Reason string `json:"reason"`
}

type JoinRoomRequest struct {
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

type JoinRoomResponse struct {
	Token      string    `json:"token"`
	LiveKitURL string    `json:"livekit_url"`
	RoomName   string    `json:"room_name"`
	RoomURL    string    `json:"room_url"`
	Interview  QueryItem `json:"interview"`
}

type FeedbackCriteriaScores struct {
	Technical     int `json:"technical"`
	Communication int `json:"communication"`
	Attitude      int `json:"attitude"`
	CultureFit    int `json:"cultureFit"`
}

type SubmitFeedbackRequest struct {
	CriteriaScores FeedbackCriteriaScores `json:"criteriaScores"`
	OverallScore   float64                `json:"overallScore"`
	Comment        string                 `json:"comment"`
	Conclusion     string                 `json:"conclusion"`
}

type InterviewFeedback struct {
	ID                         uuid.UUID              `json:"id"`
	InterviewID                uuid.UUID              `json:"interviewId"`
	EvaluatorID                uuid.UUID              `json:"evaluatorId"`
	CriteriaScores             FeedbackCriteriaScores `json:"criteriaScores"`
	OverallScore               float64                `json:"overallScore"`
	Comment                    string                 `json:"comment"`
	Conclusion                 FeedbackConclusion     `json:"conclusion"`
	SuggestedApplicationAction string                 `json:"suggestedApplicationAction"`
	CreatedAt                  string                 `json:"createdAt"`
}
