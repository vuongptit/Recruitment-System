package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"video-service/internal/kafka"
	"video-service/internal/livekit"
	"video-service/internal/model"
	"video-service/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type VideoService struct {
	repo        *repository.VideoRepository
	tokenIssuer *livekit.TokenIssuer
	producer    *kafka.Producer
	rdb         *redis.Client
}

func NewVideoService(
	repo *repository.VideoRepository,
	tokenIssuer *livekit.TokenIssuer,
	producer *kafka.Producer,
	rdb *redis.Client,
) *VideoService {
	return &VideoService{
		repo:        repo,
		tokenIssuer: tokenIssuer,
		producer:    producer,
		rdb:         rdb,
	}
}

func (s *VideoService) CreateCall(ctx context.Context, hostID uuid.UUID, title string, participantIDs []uuid.UUID, conversationID string) (*model.VideoCall, error) {
	if strings.TrimSpace(title) == "" {
		title = "Cuộc phỏng vấn mới"
	}

	// Check if non-host participants are online via Redis presence
	if s.rdb != nil {
		for _, pid := range participantIDs {
			if pid == hostID {
				continue
			}
			val, err := s.rdb.Get(ctx, fmt.Sprintf("presence:online:%s", pid)).Result()
			if err != nil || val != "1" {
				return nil, fmt.Errorf("Người nhận hiện không trực tuyến")
			}
		}
	}

	roomName := fmt.Sprintf("interview_%s", uuid.New().String()[:8])
	call := &model.VideoCall{
		ID:             uuid.New(),
		RoomName:       roomName,
		HostID:         hostID,
		Title:          title,
		Status:         "waiting",
		ConversationID: conversationID,
	}

	if err := s.repo.CreateCall(ctx, call, participantIDs); err != nil {
		return nil, err
	}

	// Produce Kafka event
	if s.producer != nil {
		_ = s.producer.PublishCallStarted(ctx, call, participantIDs, conversationID)
	}

	return call, nil
}

type JoinCallResult struct {
	Token      string           `json:"token"`
	RoomName   string           `json:"room_name"`
	LiveKitURL string           `json:"livekit_url"`
	Call       *model.VideoCall `json:"call"`
}

func (s *VideoService) JoinCall(ctx context.Context, callID, userID uuid.UUID, userName string, avatarURL ...string) (*JoinCallResult, error) {
	call, err := s.repo.FindByID(ctx, callID)
	if err != nil {
		return nil, err
	}

	if call.Status != "waiting" && call.Status != "active" {
		return nil, fmt.Errorf("this video call has ended")
	}

	if err := s.repo.AddParticipant(ctx, callID, userID); err != nil {
		return nil, err
	}

	var metadata string
	if len(avatarURL) > 0 && avatarURL[0] != "" {
		metaBytes, _ := json.Marshal(map[string]string{"avatar_url": avatarURL[0]})
		metadata = string(metaBytes)
	}

	token, err := s.tokenIssuer.GenerateJoinToken(call.RoomName, userID.String(), userName, metadata)
	if err != nil {
		return nil, err
	}

	return &JoinCallResult{
		Token:      token,
		RoomName:   call.RoomName,
		LiveKitURL: s.tokenIssuer.LiveKitURL(),
		Call:       call,
	}, nil
}

func (s *VideoService) EndCall(ctx context.Context, callID, userID uuid.UUID) error {
	call, err := s.repo.FindByID(ctx, callID)
	if err != nil {
		return err
	}

	isParticipant, err := s.repo.IsParticipant(ctx, callID, userID)
	if err != nil {
		return err
	}
	if call.HostID != userID && !isParticipant {
		return fmt.Errorf("user is not authorized to end this call")
	}

	if err := s.repo.EndCall(ctx, callID); err != nil {
		return err
	}

	if s.producer != nil {
		pIDs, _ := s.repo.GetParticipantIDs(ctx, callID)
		_ = s.producer.PublishCallEnded(ctx, call, pIDs...)
	}

	return nil
}

func (s *VideoService) RejectCall(ctx context.Context, callID, userID uuid.UUID) error {
	call, err := s.repo.FindByID(ctx, callID)
	if err != nil {
		return err
	}

	if err := s.repo.RejectCall(ctx, callID, userID); err != nil {
		return err
	}

	if s.producer != nil {
		pIDs, _ := s.repo.GetParticipantIDs(ctx, callID)
		_ = s.producer.PublishCallEnded(ctx, call, pIDs...)
	}

	return nil
}

func (s *VideoService) ListCalls(ctx context.Context, userID uuid.UUID) ([]*model.VideoCall, error) {
	return s.repo.ListActiveCalls(ctx, userID)
}
