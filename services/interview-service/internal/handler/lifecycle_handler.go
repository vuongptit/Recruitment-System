package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"interview-service/internal/apierror"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"interview-service/internal/service"
)

type LifecycleHandler struct {
	svc *service.LifecycleService
}

func NewLifecycleHandler(svc *service.LifecycleService) *LifecycleHandler {
	return &LifecycleHandler{svc: svc}
}

func (h *LifecycleHandler) ConfirmInterview(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.ConfirmInterview(r.Context(), principal, id)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) RescheduleInterview(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	var req model.RescheduleRequest
	if err := decodeStrictJSON(w, r, &req); err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.RescheduleInterview(r.Context(), principal, r.Header.Get("Authorization"), id, req)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) CancelInterview(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	var req model.CancelInterviewRequest
	if err := decodeStrictJSON(w, r, &req); err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.CancelInterview(r.Context(), principal, r.Header.Get("Authorization"), id, req)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	var req model.JoinRoomRequest
	if err := decodeOptionalJSON(w, r, &req); err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.JoinRoom(r.Context(), principal, r.Header.Get("Authorization"), id, req)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) LeaveRoom(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.LeaveRoom(r.Context(), principal, r.Header.Get("Authorization"), id)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	var req model.SubmitFeedbackRequest
	if err := decodeStrictJSON(w, r, &req); err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.SubmitFeedback(r.Context(), principal, r.Header.Get("Authorization"), id, req)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func (h *LifecycleHandler) GetFeedback(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	id, err := parsePathUUID(r, "id")
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	res, err := h.svc.GetFeedback(r.Context(), principal, r.Header.Get("Authorization"), id)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}
	apierror.WriteData(w, http.StatusOK, res)
}

func parsePathUUID(r *http.Request, param string) (uuid.UUID, error) {
	raw := strings.TrimSpace(chi.URLParam(r, param))
	parsed, err := uuid.Parse(raw)
	if err != nil || parsed.Version() != 4 || parsed.Variant() != uuid.RFC4122 || !strings.EqualFold(parsed.String(), raw) {
		return uuid.Nil, apierror.ValidationFailed(map[string]any{
			param: param + " must be a valid UUIDv4",
		})
	}
	return parsed, nil
}
