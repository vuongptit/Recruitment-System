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

type SSEEvent struct {
	ID    string
	Event string
	Data  []byte
}

type PresencePayload struct {
	UserID    string `json:"user_id"`
	Online    bool   `json:"online"`
	Timestamp string `json:"timestamp"`
}

type Hub struct {
	sync.RWMutex
	clients map[uuid.UUID]map[chan SSEEvent]bool
	peers   map[uuid.UUID]map[uuid.UUID]struct{}
	rdb     *redis.Client
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		clients: make(map[uuid.UUID]map[chan SSEEvent]bool),
		peers:   make(map[uuid.UUID]map[uuid.UUID]struct{}),
		rdb:     rdb,
	}
}

func (h *Hub) Register(userID uuid.UUID, ch chan SSEEvent) {
	h.Lock()
	wasOnline := len(h.clients[userID]) > 0
	if _, exists := h.clients[userID]; !exists {
		h.clients[userID] = make(map[chan SSEEvent]bool)
	}
	h.clients[userID][ch] = true
	totalClients := len(h.clients[userID])
	h.Unlock()

	log.Printf("[SSE Hub] User %s connected to SSE (total clients: %d)", userID, totalClients)

	if !wasOnline {
		if h.rdb != nil {
			go func(uid uuid.UUID) {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				_ = h.rdb.Set(ctx, fmt.Sprintf("presence:online:%s", uid), "1", 45*time.Second).Err()
			}(userID)
		}
		go h.BroadcastPresence(userID, true)
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

func (h *Hub) LinkUsers(userID uuid.UUID, peerIDs []uuid.UUID) {
	if len(peerIDs) == 0 {
		return
	}

	h.Lock()
	if _, exists := h.peers[userID]; !exists {
		h.peers[userID] = make(map[uuid.UUID]struct{})
	}
	for _, pid := range peerIDs {
		if pid == uuid.Nil || pid == userID {
			continue
		}
		h.peers[userID][pid] = struct{}{}
		if _, exists := h.peers[pid]; !exists {
			h.peers[pid] = make(map[uuid.UUID]struct{})
		}
		h.peers[pid][userID] = struct{}{}
	}
	h.Unlock()

	if h.rdb != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			pipe := h.rdb.Pipeline()
			for _, pid := range peerIDs {
				if pid == uuid.Nil || pid == userID {
					continue
				}
				key1 := fmt.Sprintf("presence:peers:%s", userID)
				key2 := fmt.Sprintf("presence:peers:%s", pid)
				pipe.SAdd(ctx, key1, pid.String())
				pipe.Expire(ctx, key1, 7*24*time.Hour)
				pipe.SAdd(ctx, key2, userID.String())
				pipe.Expire(ctx, key2, 7*24*time.Hour)
			}
			_, _ = pipe.Exec(ctx)
		}()
	}
}

func (h *Hub) LinkGroup(memberIDs []uuid.UUID) {
	for i := 0; i < len(memberIDs); i++ {
		h.LinkUsers(memberIDs[i], memberIDs)
	}
}

func (h *Hub) BroadcastPresence(userID uuid.UUID, online bool) {
	// 1. Gather linked peers from in-memory dictionary
	h.RLock()
	peerSet := make(map[uuid.UUID]struct{})
	if peersMap, exists := h.peers[userID]; exists {
		for peerID := range peersMap {
			peerSet[peerID] = struct{}{}
		}
	}
	h.RUnlock()

	// 2. If memory is empty, fallback to Redis Set
	if len(peerSet) == 0 && h.rdb != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		members, err := h.rdb.SMembers(ctx, fmt.Sprintf("presence:peers:%s", userID)).Result()
		if err == nil {
			for _, m := range members {
				if pUUID, err := uuid.Parse(m); err == nil {
					peerSet[pUUID] = struct{}{}
				}
			}
		}
	}

	if len(peerSet) == 0 {
		return
	}

	payload := PresencePayload{
		UserID:    userID.String(),
		Online:    online,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	msg := SSEEvent{
		Event: "presence",
		Data:  dataBytes,
	}

	h.RLock()
	defer h.RUnlock()
	for peerID := range peerSet {
		if clients, exists := h.clients[peerID]; exists {
			for ch := range clients {
				select {
				case ch <- msg:
				default:
					log.Printf("[SSE Hub] Presence buffer full for user %s, skipping frame", peerID)
				}
			}
		}
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

func (h *Hub) Unregister(userID uuid.UUID, ch chan SSEEvent) {
	h.Lock()
	isLast := false
	if userClients, exists := h.clients[userID]; exists {
		delete(userClients, ch)
		close(ch)
		if len(userClients) == 0 {
			delete(h.clients, userID)
			isLast = true
		}
	}
	h.Unlock()

	log.Printf("[SSE Hub] User %s disconnected from SSE", userID)

	if isLast {
		go func(uid uuid.UUID) {
			// Grace period 3 seconds to avoid disconnect flicker on page navigation/refresh
			time.Sleep(3 * time.Second)
			h.RLock()
			stillConnected := len(h.clients[uid]) > 0
			h.RUnlock()

			if !stillConnected {
				if h.rdb != nil {
					ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					defer cancel()
					_ = h.rdb.Del(ctx, fmt.Sprintf("presence:online:%s", uid)).Err()
				}
				h.BroadcastPresence(uid, false)
			}
		}(userID)
	}
}

func (h *Hub) Dispatch(userID uuid.UUID, notif *model.Notification) {
	dataBytes, err := json.Marshal(notif)
	if err != nil {
		return
	}

	msg := SSEEvent{
		ID:    notif.ID.String(),
		Event: "notification",
		Data:  dataBytes,
	}

	h.RLock()
	defer h.RUnlock()

	if userClients, exists := h.clients[userID]; exists {
		for ch := range userClients {
			select {
			case ch <- msg:
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

	messageChan := make(chan SSEEvent, 64)
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

		case msg, ok := <-messageChan:
			if !ok {
				return
			}
			if msg.ID != "" {
				_, _ = fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", msg.ID, msg.Event, string(msg.Data))
			} else {
				_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.Event, string(msg.Data))
			}
			flusher.Flush()
		}
	}
}
