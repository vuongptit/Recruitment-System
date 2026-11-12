package cursor

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"interview-service/internal/apierror"

	"github.com/google/uuid"
)

const (
	MaxCursorLength = 1024
	MaxPayloadBytes = 512
)

type PageCursor struct {
	AsOf     time.Time
	Position time.Time
	ID       uuid.UUID
}

type SlotCursor struct {
	AsOf     time.Time
	Position time.Time
}

type KeysetPosition struct {
	ScheduledStartAt time.Time
	InterviewID      uuid.UUID
}

type DecodedKeyset struct {
	Position   KeysetPosition
	AsOf       time.Time
	FilterHash string
}

type DecodedSlot struct {
	LastSlotStartAt time.Time
	AsOf            time.Time
	FilterHash      string
}

type Codec struct {
	key []byte
}

func NewCodec(configuredKey string) (*Codec, error) {
	if len(configuredKey) < 32 ||
		configuredKey != strings.TrimSpace(configuredKey) ||
		strings.Contains(strings.ToLower(configuredKey), "replace-with") ||
		hasControlChar(configuredKey) {
		return nil, errors.New("INTERVIEW_CURSOR_HMAC_KEY must be a non-placeholder key of at least 32 bytes")
	}
	return &Codec{key: []byte(configuredKey)}, nil
}

func Fingerprint(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(params[k])
	}
	return scopeHash(b.String())
}

func (c *Codec) EncodePage(scope string, asOf, position time.Time, id uuid.UUID) string {
	return c.encode("PAGE", scopeHash(scope), asOf, position, id.String())
}

func (c *Codec) DecodePage(rawCursor, scope string) (*PageCursor, error) {
	asOf, position, identity, _, err := c.decode(rawCursor, "PAGE", scopeHash(scope))
	if err != nil {
		return nil, err
	}
	id, err := uuid.Parse(identity)
	if err != nil || id.Version() != 4 || id.Variant() != uuid.RFC4122 || id.String() != identity {
		return nil, invalidCursorErr()
	}
	return &PageCursor{
		AsOf:     asOf,
		Position: position,
		ID:       id,
	}, nil
}

func (c *Codec) EncodeSlot(scope string, asOf, position time.Time) string {
	return c.encode("SLOT", scopeHash(scope), asOf, position, "-")
}

func (c *Codec) DecodeSlot(rawCursor, scope string) (*SlotCursor, error) {
	asOf, position, identity, _, err := c.decode(rawCursor, "SLOT", scopeHash(scope))
	if err != nil {
		return nil, err
	}
	if identity != "-" {
		return nil, invalidCursorErr()
	}
	return &SlotCursor{
		AsOf:     asOf,
		Position: position,
	}, nil
}

func (c *Codec) EncodeKeyset(pos KeysetPosition, asOf time.Time, filterHash string) string {
	return c.encode("PAGE", filterHash, asOf, pos.ScheduledStartAt, pos.InterviewID.String())
}

func (c *Codec) DecodeKeyset(rawCursor string) (*DecodedKeyset, error) {
	asOf, position, identity, fHash, err := c.decode(rawCursor, "PAGE", "")
	if err != nil {
		return nil, err
	}
	id, err := uuid.Parse(identity)
	if err != nil || id.Version() != 4 || id.Variant() != uuid.RFC4122 || id.String() != identity {
		return nil, invalidCursorErr()
	}
	return &DecodedKeyset{
		Position: KeysetPosition{
			ScheduledStartAt: position,
			InterviewID:      id,
		},
		AsOf:       asOf,
		FilterHash: fHash,
	}, nil
}

func (c *Codec) DecodeKeysetWithHash(rawCursor, expectedFilterHash string) (*DecodedKeyset, error) {
	dec, err := c.DecodeKeyset(rawCursor)
	if err != nil {
		return nil, err
	}
	if !hmac.Equal([]byte(dec.FilterHash), []byte(expectedFilterHash)) {
		return nil, invalidCursorErr()
	}
	return dec, nil
}

func (c *Codec) EncodeSlotPosition(slotStartAt, asOf time.Time, filterHash string) string {
	return c.encode("SLOT", filterHash, asOf, slotStartAt, "-")
}

func (c *Codec) DecodeSlotPosition(rawCursor, expectedFilterHash string) (*DecodedSlot, error) {
	asOf, position, identity, fHash, err := c.decode(rawCursor, "SLOT", expectedFilterHash)
	if err != nil {
		return nil, err
	}
	if identity != "-" {
		return nil, invalidCursorErr()
	}
	return &DecodedSlot{
		LastSlotStartAt: position,
		AsOf:            asOf,
		FilterHash:      fHash,
	}, nil
}

func (c *Codec) encode(kind, hashVal string, asOf, position time.Time, identity string) string {
	payload := fmt.Sprintf("1\n%s\n%s\n%d\n%d\n%s",
		kind,
		hashVal,
		asOf.UTC().UnixMilli(),
		position.UTC().UnixMilli(),
		identity,
	)
	payloadBytes := []byte(payload)
	sig := c.sign(payloadBytes)
	return base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func (c *Codec) decode(rawCursor, expectedKind, expectedHash string) (time.Time, time.Time, string, string, error) {
	if rawCursor == "" ||
		len(rawCursor) > MaxCursorLength ||
		rawCursor != strings.TrimSpace(rawCursor) ||
		hasControlChar(rawCursor) {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	parts := strings.Split(rawCursor, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	if len(payload) == 0 || len(payload) > MaxPayloadBytes || !hmac.Equal(c.sign(payload), signature) {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	if !utf8.Valid(payload) {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	fields := strings.Split(string(payload), "\n")
	if len(fields) != 6 ||
		fields[0] != "1" ||
		fields[1] != expectedKind {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	if expectedHash != "" && !hmac.Equal([]byte(expectedHash), []byte(fields[2])) {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	asOfMillis, err := strconv.ParseInt(fields[3], 10, 64)
	if err != nil || asOfMillis < 0 {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	posMillis, err := strconv.ParseInt(fields[4], 10, 64)
	if err != nil || posMillis < 0 {
		return time.Time{}, time.Time{}, "", "", invalidCursorErr()
	}
	return time.UnixMilli(asOfMillis).UTC(), time.UnixMilli(posMillis).UTC(), fields[5], fields[2], nil
}

func (c *Codec) sign(payload []byte) []byte {
	mac := hmac.New(sha256.New, c.key)
	mac.Write(payload)
	return mac.Sum(nil)
}

func scopeHash(scope string) string {
	sum := sha256.Sum256([]byte(scope))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func hasControlChar(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

func invalidCursorErr() *apierror.BusinessError {
	return apierror.New("INTERVIEW_CURSOR_INVALID", "Pagination cursor is invalid for this query", http.StatusBadRequest)
}
