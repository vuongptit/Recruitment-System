package livekit

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/livekit/protocol/auth"
)

type TokenIssuer struct {
	livekitURL string
	apiKey     string
	apiSecret  string
	ttl        time.Duration
}

func NewTokenIssuer(url, apiKey, apiSecret string) *TokenIssuer {
	if strings.TrimSpace(url) == "" {
		url = "ws://localhost:7880"
	}
	if strings.TrimSpace(apiKey) == "" || strings.Contains(apiKey, "placeholder") {
		apiKey = "devkey"
	}
	if strings.TrimSpace(apiSecret) == "" || strings.Contains(apiSecret, "placeholder") {
		apiSecret = "secret01234567890123456789012345"
	}
	return &TokenIssuer{
		livekitURL: strings.TrimSpace(url),
		apiKey:     strings.TrimSpace(apiKey),
		apiSecret:  strings.TrimSpace(apiSecret),
		ttl:        4 * time.Hour,
	}
}

func (ti *TokenIssuer) LiveKitURL() string {
	return ti.livekitURL
}

func (ti *TokenIssuer) GenerateJoinToken(roomName, identity, name, metadata string, validFor time.Duration) (string, error) {
	if strings.TrimSpace(roomName) == "" || strings.TrimSpace(identity) == "" {
		return "", fmt.Errorf("roomName and identity are required")
	}
	if validFor <= 0 {
		validFor = 2 * time.Hour
	}

	at := auth.NewAccessToken(ti.apiKey, ti.apiSecret)
	canPublish := true
	canSubscribe := true
	canPublishData := true
	grant := &auth.VideoGrant{
		RoomJoin:       true,
		Room:           roomName,
		CanPublish:     &canPublish,
		CanSubscribe:   &canSubscribe,
		CanPublishData: &canPublishData,
	}

	at.AddGrant(grant).
		SetIdentity(identity).
		SetName(name).
		SetMetadata(metadata).
		SetValidFor(validFor)

	jwtToken, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("generating livekit token: %w", err)
	}
	return jwtToken, nil
}

func (ti *TokenIssuer) IssueToken(roomName, identity, displayName, avatarURL, role string) (string, error) {
	metaBytes, _ := json.Marshal(map[string]string{
		"avatar_url": avatarURL,
		"role":       role,
	})
	return ti.GenerateJoinToken(roomName, identity, displayName, string(metaBytes), ti.ttl)
}
