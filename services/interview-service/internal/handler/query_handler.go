package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"interview-service/internal/apierror"
	"interview-service/internal/middleware"
	"interview-service/internal/service"
)

type QueryHandler struct {
	svc *service.QueryService
}

func NewQueryHandler(svc *service.QueryService) *QueryHandler {
	return &QueryHandler{svc: svc}
}

func (h *QueryHandler) ListApplicationInterviews(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	q := r.URL.Query()
	res, err := h.svc.ListApplicationInterviews(r.Context(), principal, r.Header.Get("Authorization"), service.ApplicationInterviewsQuery{
		ApplicationID: q.Get("applicationId"),
		Statuses:      q["status"],
		RoundNumber:   q.Get("roundNumber"),
		Limit:         q.Get("limit"),
		Cursor:        q.Get("cursor"),
	})
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *QueryHandler) ListMyInterviews(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	q := r.URL.Query()
	view := q.Get("view")
	if view == "" {
		view = q.Get("period")
	}
	res, err := h.svc.ListMyInterviews(r.Context(), principal, r.Header.Get("Authorization"), service.MyInterviewsQuery{
		View:          view,
		Statuses:      q["status"],
		Mode:          q.Get("mode"),
		From:          q.Get("from"),
		To:            q.Get("to"),
		ApplicationID: q.Get("applicationId"),
		JobID:         q.Get("jobId"),
		Limit:         q.Get("limit"),
		Cursor:        q.Get("cursor"),
	})
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *QueryHandler) ListCompanyCalendar(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	q := r.URL.Query()
	res, err := h.svc.ListCompanyCalendar(r.Context(), principal, r.Header.Get("Authorization"), service.CompanyCalendarQuery{
		From:          q.Get("from"),
		To:            q.Get("to"),
		InterviewerID: q.Get("interviewerId"),
		CandidateID:   q.Get("candidateId"),
		JobID:         q.Get("jobId"),
		ApplicationID: q.Get("applicationId"),
		Statuses:      q["status"],
		Mode:          q.Get("mode"),
		Limit:         q.Get("limit"),
		Cursor:        q.Get("cursor"),
	})
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *QueryHandler) GetAvailability(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	q := r.URL.Query()
	res, err := h.svc.GetAvailability(r.Context(), principal, r.Header.Get("Authorization"), service.AvailabilityQuery{
		ApplicationID:   q.Get("applicationId"),
		From:            q.Get("from"),
		To:              q.Get("to"),
		TimeZone:        q.Get("timeZone"),
		DurationMinutes: q.Get("durationMinutes"),
		Limit:           q.Get("limit"),
		Cursor:          q.Get("cursor"),
	})
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *QueryHandler) GetInterviewDetail(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id := chi.URLParam(r, "id")
	res, err := h.svc.GetInterviewDetail(r.Context(), principal, r.Header.Get("Authorization"), id)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}
