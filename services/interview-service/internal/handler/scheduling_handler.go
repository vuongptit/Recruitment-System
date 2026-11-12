package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"interview-service/internal/apierror"
	"interview-service/internal/middleware"
	"interview-service/internal/model"
	"interview-service/internal/service"
)

const maxRequestBodyBytes = 64 * 1024

type SchedulingHandler struct {
	svc *service.SchedulingService
}

func NewSchedulingHandler(svc *service.SchedulingService) *SchedulingHandler {
	return &SchedulingHandler{svc: svc}
}

func (h *SchedulingHandler) CreateInterview(w http.ResponseWriter, r *http.Request) {
	principal := middleware.GetPrincipal(r.Context())
	if principal == nil {
		apierror.WriteError(w, apierror.NewStatus(http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "Valid bearer token is required", nil))
		return
	}

	var req model.CreateInterviewRequest
	if err := decodeStrictJSON(w, r, &req); err != nil {
		apierror.WriteError(w, err)
		return
	}

	authHeader := r.Header.Get("Authorization")
	res, err := h.svc.ScheduleInterview(r.Context(), principal, authHeader, req)
	if err != nil {
		apierror.WriteError(w, err)
		return
	}

	status := http.StatusOK
	if res.Created {
		status = http.StatusCreated
	}
	apierror.WriteData(w, status, res.Response)
}

func decodeStrictJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	defer r.Body.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return apierror.NewStatus(http.StatusBadRequest, "INVALID_JSON", "Malformed or unreadable JSON request body", nil)
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return apierror.NewStatus(http.StatusBadRequest, "INVALID_JSON", "Request body is required", nil)
	}

	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apierror.NewStatus(http.StatusBadRequest, "INVALID_JSON", "Malformed JSON request body or unknown fields", nil)
	}
	return nil
}

func decodeOptionalJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	if r.Body == nil {
		return nil
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	defer r.Body.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return apierror.NewStatus(http.StatusBadRequest, "INVALID_JSON", "Malformed JSON request body", nil)
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	dec := json.NewDecoder(strings.NewReader(string(body)))
	if err := dec.Decode(dst); err != nil {
		return apierror.NewStatus(http.StatusBadRequest, "INVALID_JSON", "Malformed JSON request body", nil)
	}
	return nil
}
