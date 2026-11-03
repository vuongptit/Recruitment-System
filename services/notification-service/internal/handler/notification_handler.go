package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"notification-service/internal/cursor"
	"notification-service/internal/middleware"
	"notification-service/internal/model"
	"notification-service/internal/service"
	"notification-service/internal/sse"


	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type NotificationHandler struct {
	notifService *service.NotificationService
	sseHub       *sse.Hub
	cursorSvc    *cursor.CursorService
}

func NewNotificationHandler(notifService *service.NotificationService, sseHub *sse.Hub, cursorSvc *cursor.CursorService) *NotificationHandler {
	return &NotificationHandler{
		notifService: notifService,
		sseHub:       sseHub,
		cursorSvc:    cursorSvc,
	}
}

func (h *NotificationHandler) Stream(w http.ResponseWriter, r *http.Request) {
	h.sseHub.ServeStream(w, r)
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	limit := 50
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	cursorStr := r.URL.Query().Get("cursor")
	var notifType *string
	if t := r.URL.Query().Get("type"); t != "" {
		notifType = &t
	}

	decodedCursor, err := h.cursorSvc.Decode(cursorStr, userID, notifType)
	if err != nil {
		http.Error(w, `{"error":"invalid cursor"}`, http.StatusBadRequest)
		return
	}

	var cursorCreatedAt time.Time
	var cursorID string
	if decodedCursor != nil {
		cursorCreatedAt = decodedCursor.CreatedAt
		cursorID = decodedCursor.ID
	}

	notifs, err := h.notifService.List(r.Context(), userID, notifType, limit, cursorCreatedAt, cursorID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	if notifs == nil {
		notifs = make([]*model.Notification, 0)
	}

	var nextCursor *string
	if len(notifs) > limit {
		// we have a next page
		lastItem := notifs[limit-1]
		encoded := h.cursorSvc.Encode(userID, notifType, cursor.NotificationCursor{
			CreatedAt: lastItem.CreatedAt,
			ID:        lastItem.ID.String(),
		})
		nextCursor = &encoded
		notifs = notifs[:limit]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": notifs,
		"meta": map[string]any{
			"nextCursor": nextCursor,
			"limit":      limit,
		},
	})
}

func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	count, err := h.notifService.GetUnreadCount(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]int{"unread_count": count},
	})
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	notifIDStr := chi.URLParam(r, "notification_id")
	notifID, err := uuid.Parse(notifIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid notification_id"}`, http.StatusBadRequest)
		return
	}

	if err := h.notifService.MarkAsRead(r.Context(), notifID, userID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]bool{"success": true},
	})
}

func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if err := h.notifService.MarkAllAsRead(r.Context(), userID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]bool{"success": true},
	})
}

func (h *NotificationHandler) RegisterPushToken(w http.ResponseWriter, r *http.Request) {
	// Optional push token registration endpoint
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]string{"message": "push token registered (stub)"},
	})
}

func (h *NotificationHandler) OnlineStatus(w http.ResponseWriter, r *http.Request) {
	userIDsStr := r.URL.Query().Get("user_ids")
	userIDStr := r.URL.Query().Get("user_id")

	if userIDsStr == "" && userIDStr == "" {
		http.Error(w, `{"error":"user_id or user_ids is required"}`, http.StatusBadRequest)
		return
	}

	var userIDs []uuid.UUID
	if userIDsStr != "" {
		for _, part := range strings.Split(userIDsStr, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			if uid, err := uuid.Parse(trimmed); err == nil {
				userIDs = append(userIDs, uid)
			}
		}
	} else if userIDStr != "" {
		uid, err := uuid.Parse(userIDStr)
		if err != nil {
			http.Error(w, `{"error":"invalid user_id format"}`, http.StatusBadRequest)
			return
		}
		userIDs = append(userIDs, uid)
	}

	if viewerID, ok := middleware.GetUserID(r.Context()); ok && len(userIDs) > 0 {
		h.sseHub.LinkUsers(viewerID, userIDs)
	}

	statuses := h.sseHub.GetUsersOnlineStatuses(userIDs)
	stringStatuses := make(map[string]bool, len(statuses))
	var isOnline bool
	for uid, on := range statuses {
		stringStatuses[uid.String()] = on
		if userIDStr != "" && uid.String() == userIDStr {
			isOnline = on
		}
	}
	if userIDStr != "" && len(userIDs) == 1 {
		isOnline = statuses[userIDs[0]]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data": map[string]any{
			"online":   isOnline,
			"statuses": stringStatuses,
		},
	})
}
