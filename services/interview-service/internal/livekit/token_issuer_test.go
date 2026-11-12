package livekit

import (
	"testing"
	"time"
)

func TestTokenIssuerGenerateJoinToken(t *testing.T) {
	issuer := NewTokenIssuer("wss://livekit.recruitment.local", "devkey", "secret01234567890123456789012345")
	if issuer.LiveKitURL() != "wss://livekit.recruitment.local" {
		t.Fatalf("unexpected LiveKit URL: %s", issuer.LiveKitURL())
	}

	token, err := issuer.GenerateJoinToken("interview-room-123", "user-uuid-1", "Nguyen Van A", `{"role":"CANDIDATE"}`, 90*time.Minute)
	if err != nil {
		t.Fatalf("expected valid token, got error: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	if _, err := issuer.GenerateJoinToken("", "user-uuid-1", "Name", "", time.Hour); err == nil {
		t.Fatal("expected error when roomName is empty")
	}
}
