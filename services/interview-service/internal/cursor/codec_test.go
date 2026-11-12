package cursor

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestCursorCodecPageAndSlot(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef-hmac-key"
	codec, err := NewCodec(key)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	asOf := time.Date(2026, 9, 10, 9, 0, 0, 123000000, time.UTC)
	pos := time.Date(2026, 9, 12, 14, 30, 0, 0, time.UTC)
	id := uuid.New()
	scope := "history\nCANDIDATE\n" + id.String()

	token := codec.EncodePage(scope, asOf, pos, id)
	decoded, err := codec.DecodePage(token, scope)
	if err != nil {
		t.Fatalf("DecodePage failed: %v", err)
	}
	if !decoded.AsOf.Equal(asOf) || !decoded.Position.Equal(pos) || decoded.ID != id {
		t.Fatalf("decoded cursor mismatch: %+v", decoded)
	}

	if _, err := codec.DecodePage(token, scope+"-other"); err == nil {
		t.Fatal("expected cross-scope cursor to fail")
	}

	tampered := token[:len(token)-2] + "ab"
	if _, err := codec.DecodePage(tampered, scope); err == nil {
		t.Fatal("expected tampered cursor to fail")
	}

	slotToken := codec.EncodeSlot(scope, asOf, pos)
	slotDecoded, err := codec.DecodeSlot(slotToken, scope)
	if err != nil {
		t.Fatalf("DecodeSlot failed: %v", err)
	}
	if !slotDecoded.AsOf.Equal(asOf) || !slotDecoded.Position.Equal(pos) {
		t.Fatalf("decoded slot cursor mismatch: %+v", slotDecoded)
	}

	if _, err := codec.DecodePage(slotToken, scope); err == nil {
		t.Fatal("expected SLOT cursor to be rejected by DecodePage")
	}
}

func TestCursorCodecInvalidKey(t *testing.T) {
	if _, err := NewCodec("short"); err == nil {
		t.Fatal("expected short key to be rejected")
	}
	if _, err := NewCodec("replace-with-a-distinct-interview-query-cursor-key-12345"); err == nil {
		t.Fatal("expected placeholder key to be rejected")
	}
	if _, err := NewCodec(" " + strings.Repeat("a", 35) + " "); err == nil {
		t.Fatal("expected untrimmed key to be rejected")
	}
}

