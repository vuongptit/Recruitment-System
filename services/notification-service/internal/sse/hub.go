package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"notification-service/internal/middleware"
	"notification-service/internal/model"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Hub struct {
	sync.RWMutex
	clients map[uuid.UUID]map[chan *model.Notification]bool
	rdb     *redis.Client
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		clients: make(map[uuid.UUID]map[chan *model.Notification]bool),
		rdb:     rdb,
	}
}

func (h *Hub) Register(userID uuid.UUID, ch chan *model.Notification) {
	h.Lock()
	defer h.Unlock()

	if _, exists := h.clients[userID]; !exists {
		h.clients[userID] = make(map[chan *model.Notification]bool)
	}
	h.clients[userID][ch] = true
	log.Printf("[SSE Hub] User %s connected to SSE (total clients: %d)", userID, len(h.clients[userID]))

	if h.rdb != nil {
		go func(uid uuid.UUID) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = h.rdb.Set(ctx, fmt.Sprintf("presence:online:%s", uid), "1", 45*time.Second).Err()
		}(userID)
	}
}

func (h *Hub) TouchPresence(userID uuid.UUID) {
	if h.rdb != nil {
		go func(uid uuid.UUID) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = h.rdb.Expire(ctx, fmt.Sprintf("presence:online:%s", uid), 45*time.Second).Err()
		}(userID)
	}
}

func (h *Hub) IsUserConnected(userID uuid.UUID) bool {
	h.RLock()
	_, exists := h.clients[userID]
	h.RUnlock()
	if exists {
		return true
	}

	if h.rdb != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		res, err := h.rdb.Exists(ctx, fmt.Sprintf("presence:online:%s", userID)).Result()
		if err == nil && res > 0 {
			return true
		}
	}
	return false
}

func (h *Hub) GetUsersOnlineStatuses(userIDs []uuid.UUID) map[uuid.UUID]bool {
	statuses := make(map[uuid.UUID]bool, len(userIDs))
	if len(userIDs) == 0 {
		return statuses
	}

	h.RLock()
	var missing []uuid.UUID
	for _, uid := range userIDs {
		if _, exists := h.clients[uid]; exists {
			statuses[uid] = true
		} else {
			statuses[uid] = false
			missing = append(missing, uid)
		}
	}
	h.RUnlock()

	if len(missing) > 0 && h.rdb != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		keys := make([]string, len(missing))
		for i, uid := range missing {
			keys[i] = fmt.Sprintf("presence:online:%s", uid)
		}

		vals, err := h.rdb.MGet(ctx, keys...).Result()
		if err == nil {
			for i, val := range vals {
				if val != nil {
					statuses[missing[i]] = true
				}
			}
		}
	}

	return statuses
}

func (h *Hub) Unregister(userID uuid.UUID, ch chan *model.Notification) {
	h.Lock()
	defer h.Unlock()

	lastConnection := false
	if userClients, exists := h.clients[userID]; exists {
		delete(userClients, ch)
		close(ch)
		if len(userClients) == 0 {
			delete(h.clients, userID)
			lastConnection = true
		}
	}
	log.Printf("[SSE Hub] User %s disconnected from SSE", userID)

	if lastConnection && h.rdb != nil {
		go func(uid uuid.UUID) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = h.rdb.Del(ctx, fmt.Sprintf("presence:online:%s", uid)).Err()
		}(userID)
	}
}

func (h *Hub) Dispatch(userID uuid.UUID, notif *model.Notification) {
	h.RLock()
	defer h.RUnlock()

	if userClients, exists := h.clients[userID]; exists {
		for ch := range userClients {
			select {
			case ch <- notif:
			default:
				log.Printf("[SSE Hub] Buffer full for user %s, skipping frame", userID)
			}
		}
	}
}

func (h *Hub) ServeStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	messageChan := make(chan *model.Notification, 64)
	h.Register(userID, messageChan)
	defer h.Unregister(userID, messageChan)

	// Send initial connected event
	_, _ = fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\",\"user_id\":\"%s\"}\n\n", userID)
	flusher.Flush()

	heartbeatTicker := time.NewTicker(15 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return

		case <-heartbeatTicker.C:
			h.TouchPresence(userID)
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()

		case notif, ok := <-messageChan:
			if !ok {
				return
			}
			dataBytes, err := json.Marshal(notif)
			if err != nil {
				continue
			}

			_, _ = fmt.Fprintf(w, "id: %s\nevent: notification\ndata: %s\n\n", notif.ID, string(dataBytes))
			flusher.Flush()
		}
	}
}
