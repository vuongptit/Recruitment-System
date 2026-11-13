package kafka

import (
	"encoding/json"
	"strings"
	"testing"

	"notification-service/internal/model"
)

func TestApplicationNotificationsUseVietnameseAndPreserveRecipientAndMetadata(t *testing.T) {
	candidate := "10000000-0000-4000-8000-000000000001"
	recruiter := "20000000-0000-4000-8000-000000000002"
	previous := "APPLIED"
	accepted, declined := "ACCEPTED", "DECLINED"
	cases := []struct {
		name, action, status, actor, recipient, title, body string
		from, offerStatus                                   *string
	}{
		{"submitted", "STATUS_CHANGED", "APPLIED", candidate, recruiter, "Có hồ sơ ứng tuyển mới", "Một ứng viên đã ứng tuyển vị trí Senior Backend Engineer.", nil, nil},
		{"offer", "OFFER_SENT", "OFFER", recruiter, candidate, "Bạn có thư mời nhận việc mới", "Bạn nhận được thư mời nhận việc cho vị trí Senior Backend Engineer.", &previous, nil},
		{"accepted", "STATUS_CHANGED", "HIRED", candidate, recruiter, "Ứng viên đã chấp nhận thư mời nhận việc", "Ứng viên đã chấp nhận thư mời nhận việc cho vị trí Senior Backend Engineer.", &previous, &accepted},
		{"declined", "STATUS_CHANGED", "REJECTED", candidate, recruiter, "Ứng viên đã từ chối thư mời nhận việc", "Ứng viên đã từ chối thư mời nhận việc cho vị trí Senior Backend Engineer.", &previous, &declined},
		{"reviewing", "STATUS_CHANGED", "REVIEWING", recruiter, candidate, "Trạng thái hồ sơ ứng tuyển đã cập nhật", "Hồ sơ ứng tuyển vị trí Senior Backend Engineer đã chuyển sang trạng thái: Đang xem xét.", &previous, nil},
		{"future", "STATUS_CHANGED", "FUTURE_STATUS", recruiter, candidate, "Trạng thái hồ sơ ứng tuyển đã cập nhật", "Hồ sơ ứng tuyển vị trí Senior Backend Engineer vừa được cập nhật.", &previous, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			event := model.ApplicationEvent{Action: tc.action, ToStatus: tc.status, FromStatus: tc.from, ActorID: &tc.actor,
				CandidateID: candidate, RecruiterID: recruiter, ApplicationID: "application-id", JobID: "job-id", JobTitle: "Senior Backend Engineer", OfferStatus: tc.offerStatus}
			draft := mapApplicationEvent(event)
			if draft == nil {
				t.Fatal("missing notification")
			}
			if draft.UserID.String() != tc.recipient || draft.Title != tc.title || draft.Body != tc.body {
				t.Fatalf("incorrect localized notification: %+v", draft)
			}
			var metadata map[string]string
			if err := json.Unmarshal(draft.Metadata, &metadata); err != nil {
				t.Fatal(err)
			}
			if metadata["to_status"] != tc.status || metadata["application_id"] != "application-id" {
				t.Fatalf("changed contract metadata: %+v", metadata)
			}
		})
	}
}

func TestInterviewNotificationsUseVietnameseAndKeepCandidateActions(t *testing.T) {
	candidate := "10000000-0000-4000-8000-000000000001"
	recruiter := "20000000-0000-4000-8000-000000000002"
	event := model.InterviewEvent{Action: "SCHEDULED", CandidateID: candidate, InterviewerID: recruiter, ActorID: recruiter, RoundNumber: 2, InterviewID: "interview-id"}
	draft := mapInterviewEvent(event)
	if draft == nil || draft.Title != "Lịch phỏng vấn mới" || draft.UserID.String() != candidate || !strings.Contains(draft.Body, "thời gian và địa điểm") {
		t.Fatalf("incorrect schedule notification: %+v", draft)
	}
	event.Action, event.ActorID = "CONFIRMED", candidate
	draft = mapInterviewEvent(event)
	if draft == nil || draft.UserID.String() != recruiter || draft.Title != "Ứng viên đã xác nhận lịch phỏng vấn" {
		t.Fatalf("candidate action was changed: %+v", draft)
	}
	event.Action = "IN_PROGRESS"
	if mapInterviewEvent(event) != nil {
		t.Fatal("must not introduce notifications for an ignored action")
	}
}
