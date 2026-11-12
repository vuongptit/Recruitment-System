package apierror

import (
	"encoding/json"
	"errors"
	"net/http"
)

type BusinessError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Status  int            `json:"-"`
	Details map[string]any `json:"details,omitempty"`
}

type Error = BusinessError

func (e *BusinessError) Error() string {
	return e.Code + ": " + e.Message
}

func New(code, message string, status int) *BusinessError {
	return &BusinessError{
		Code:    code,
		Message: message,
		Status:  status,
	}
}

func NewStatus(status int, code, message string, details map[string]any) *BusinessError {
	return &BusinessError{
		Code:    code,
		Message: message,
		Status:  status,
		Details: details,
	}
}

func NewWithDetails(code, message string, status int, details map[string]string) *BusinessError {
	m := make(map[string]any, len(details))
	for k, v := range details {
		m[k] = v
	}
	return &BusinessError{
		Code:    code,
		Message: message,
		Status:  status,
		Details: m,
	}
}

func ValidationError(field, message string) *BusinessError {
	return &BusinessError{
		Code:    "VALIDATION_FAILED",
		Message: "Request validation failed",
		Status:  http.StatusBadRequest,
		Details: map[string]any{field: message},
	}
}

func ValidationFailed(fieldErrors map[string]any) *BusinessError {
	return &BusinessError{
		Code:    "VALIDATION_FAILED",
		Message: "Request validation failed",
		Status:  http.StatusBadRequest,
		Details: map[string]any{"fieldErrors": fieldErrors},
	}
}

func WritePrivateHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, private")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Vary", "Authorization")
}

func WriteJSON(w http.ResponseWriter, status int, data any) {
	WritePrivateHeaders(w)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
}

func WriteData(w http.ResponseWriter, status int, data any) {
	WriteJSON(w, status, data)
}

func WriteError(w http.ResponseWriter, err error) {
	WritePrivateHeaders(w)
	var bizErr *BusinessError
	if errors.As(err, &bizErr) {
		status := bizErr.Status
		if status == 0 {
			status = http.StatusBadRequest
		}
		w.WriteHeader(status)
		resp := map[string]any{
			"code":    bizErr.Code,
			"message": bizErr.Message,
		}
		if len(bizErr.Details) > 0 {
			resp["details"] = bizErr.Details
		}
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    "INTERNAL_ERROR",
		"message": "An unexpected error occurred",
	})
}
