package kafka

import (
	"encoding/json"
	"fmt"

	"notification-service/internal/model"

	"github.com/google/uuid"
)

// notificationDraft holds the data needed to create a notification from an event.
type notificationDraft struct {
	UserID   uuid.UUID
	Type     string
	Title    string
	Body     string
	Metadata json.RawMessage
}

// mapApplicationEvent converts an ApplicationEvent into a notification draft.
// Returns nil when no notification should be created (e.g. actor is recipient).
func mapApplicationEvent(event model.ApplicationEvent) *notificationDraft {
	initialSubmission := event.Action == "STATUS_CHANGED" &&
		event.FromStatus == nil &&
		event.ToStatus == "APPLIED"

	actorIsCandidate := event.ActorID != nil && *event.ActorID == event.CandidateID
	candidateWithdrawal := event.ToStatus == "WITHDRAWN"
	candidateOfferResponse := event.OfferStatus != nil &&
		(*event.OfferStatus == "ACCEPTED" || *event.OfferStatus == "DECLINED")

	// Determine recipient
	var recipientIDStr string
	if initialSubmission || actorIsCandidate || candidateWithdrawal || candidateOfferResponse {
		recipientIDStr = event.RecruiterID
	} else {
		recipientIDStr = event.CandidateID
	}

	// Don't notify the actor themselves
	if event.ActorID != nil && *event.ActorID == recipientIDStr {
		return nil
	}

	recipientID, err := uuid.Parse(recipientIDStr)
	if err != nil {
		return nil
	}

	var notifType, title, body string

	switch {
	case event.Action == "OFFER_SENT":
		notifType = model.TypeOfferReceived
		title = "Bạn có thư mời nhận việc mới"
		body = fmt.Sprintf("Bạn nhận được thư mời nhận việc cho vị trí %s.", event.JobTitle)

	case initialSubmission:
		notifType = model.TypeApplicationReceived
		title = "Có hồ sơ ứng tuyển mới"
		body = fmt.Sprintf("Một ứng viên đã ứng tuyển vị trí %s.", event.JobTitle)

	case event.OfferStatus != nil && *event.OfferStatus == "ACCEPTED":
		notifType = model.TypeOfferAccepted
		title = "Ứng viên đã chấp nhận thư mời nhận việc"
		body = fmt.Sprintf("Ứng viên đã chấp nhận thư mời nhận việc cho vị trí %s.", event.JobTitle)

	case event.OfferStatus != nil && *event.OfferStatus == "DECLINED":
		notifType = model.TypeOfferDeclined
		title = "Ứng viên đã từ chối thư mời nhận việc"
		body = fmt.Sprintf("Ứng viên đã từ chối thư mời nhận việc cho vị trí %s.", event.JobTitle)

	default:
		notifType = model.TypeApplicationStatusChanged
		title = "Trạng thái hồ sơ ứng tuyển đã cập nhật"
		if label, ok := applicationStatusLabel(event.ToStatus); ok {
			body = fmt.Sprintf("Hồ sơ ứng tuyển vị trí %s đã chuyển sang trạng thái: %s.", event.JobTitle, label)
		} else {
			body = fmt.Sprintf("Hồ sơ ứng tuyển vị trí %s vừa được cập nhật.", event.JobTitle)
		}
	}

	metadata := map[string]string{
		"application_id": event.ApplicationID,
		"job_id":         event.JobID,
		"to_status":      event.ToStatus,
		"deep_link":      fmt.Sprintf("/applications/%s", event.ApplicationID),
	}
	if event.OfferID != nil {
		metadata["offer_id"] = *event.OfferID
	}
	metadataJSON, _ := json.Marshal(metadata)

	return &notificationDraft{
		UserID:   recipientID,
		Type:     notifType,
		Title:    title,
		Body:     body,
		Metadata: metadataJSON,
	}
}

// mapInterviewEvent converts an InterviewEvent into notification drafts.
// Returns nil when no notification should be created.
func mapInterviewEvent(event model.InterviewEvent) *notificationDraft {
	var recipientIDStr string
	if event.ActorID == event.CandidateID {
		recipientIDStr = event.InterviewerID
	} else {
		recipientIDStr = event.CandidateID
	}

	if recipientIDStr == "" || recipientIDStr == event.ActorID {
		return nil
	}

	recipientID, err := uuid.Parse(recipientIDStr)
	if err != nil {
		return nil
	}

	title := "Lịch phỏng vấn mới"
	body := "Bạn có lịch phỏng vấn mới. Mở chi tiết để xem thời gian và địa điểm."
	switch event.Action {
	case "CONFIRMED":
		title = "Ứng viên đã xác nhận lịch phỏng vấn"
		body = fmt.Sprintf("Ứng viên đã xác nhận tham gia phỏng vấn vòng %d.", event.RoundNumber)
	case "RESCHEDULE_REQUESTED":
		title = "Ứng viên đề nghị dời lịch phỏng vấn"
		body = fmt.Sprintf("Ứng viên đã gửi yêu cầu xin dời lịch phỏng vấn vòng %d.", event.RoundNumber)
	case "RESCHEDULED":
		title = "Lịch phỏng vấn đã được cập nhật"
		body = fmt.Sprintf("Nhà tuyển dụng đã cập nhật thời gian mới cho phỏng vấn vòng %d.", event.RoundNumber)
	case "CANCELLED":
		title = "Lịch phỏng vấn đã bị hủy"
		body = fmt.Sprintf("Buổi phỏng vấn vòng %d đã bị hủy.", event.RoundNumber)
	case "REMINDER":
		title = "Nhắc lịch phỏng vấn sắp diễn ra"
		body = fmt.Sprintf("Bạn có lịch phỏng vấn vòng %d trong 24 giờ tới. Vui lòng xác nhận tham gia.", event.RoundNumber)
	case "COMPLETED":
		title = "Hoàn thành phỏng vấn"
		body = fmt.Sprintf("Buổi phỏng vấn vòng %d đã hoàn tất.", event.RoundNumber)
	case "NO_SHOW":
		title = "Vắng mặt buổi phỏng vấn"
		body = fmt.Sprintf("Buổi phỏng vấn vòng %d được ghi nhận vắng mặt.", event.RoundNumber)
	case "IN_PROGRESS":
		return nil
	}

	metadata := map[string]string{
		"interview_id":    event.InterviewID,
		"application_id":  event.ApplicationID,
		"action":          event.Action,
		"scheduled_start": event.ScheduledStartAt,
		"scheduled_end":   event.ScheduledEndAt,
		"deep_link":       fmt.Sprintf("/interviews/%s", event.InterviewID),
	}
	metadataJSON, _ := json.Marshal(metadata)

	return &notificationDraft{
		UserID:   recipientID,
		Type:     model.TypeInterviewScheduled,
		Title:    title,
		Body:     body,
		Metadata: metadataJSON,
	}
}

func applicationStatusLabel(status string) (string, bool) {
	labels := map[string]string{
		"APPLIED": "Đã ứng tuyển", "REVIEWING": "Đang xem xét", "INTERVIEW": "Phỏng vấn",
		"OFFER": "Chờ phản hồi thư mời", "HIRED": "Đã tuyển", "REJECTED": "Đã từ chối", "WITHDRAWN": "Đã rút hồ sơ",
	}
	label, ok := labels[status]
	return label, ok
}
