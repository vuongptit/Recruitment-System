package jwt

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type CustomClaims struct {
	UserID       uuid.UUID  `json:"-"`
	CompanyID    *uuid.UUID `json:"-"`
	RawCompanyID string     `json:"company_id,omitempty"`
	Email        string     `json:"email"`
	FullName     string     `json:"full_name"`
	Role         string     `json:"role"`
	jwt.RegisteredClaims
}

type Verifier struct {
	publicKey *rsa.PublicKey
	jwks      *keyfunc.JWKS
	issuer    string
	audience  string
}

func NewVerifier(jwksURI, keyPath, issuer, audience string) (*Verifier, error) {
	if strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" {
		return nil, errors.New("JWT issuer and audience are required")
	}
	v := &Verifier{issuer: issuer, audience: audience}

	// Support inline PEM in either keyPath or jwksURI
	if strings.Contains(jwksURI, "BEGIN") && keyPath == "" {
		keyPath = jwksURI
		jwksURI = ""
	}

	if keyPath != "" {
		var keyBytes []byte
		var err error
		if strings.Contains(keyPath, "BEGIN") {
			keyBytes = []byte(strings.ReplaceAll(keyPath, `\n`, "\n"))
		} else {
			keyBytes, err = os.ReadFile(keyPath)
		}
		if err == nil && len(keyBytes) > 0 {
			block, _ := pem.Decode(keyBytes)
			if block == nil {
				return nil, errors.New("failed to parse public key PEM")
			}
			parsedKey, err := x509.ParsePKIXPublicKey(block.Bytes)
			if err != nil {
				return nil, err
			}
			rsaKey, ok := parsedKey.(*rsa.PublicKey)
			if !ok || rsaKey.N.BitLen() < 2048 {
				return nil, errors.New("JWT key must be RSA with at least 2048 bits")
			}
			v.publicKey = rsaKey
		} else if jwksURI == "" {
			return nil, err
		}
	}

	if jwksURI != "" {
		jwks, err := keyfunc.Get(jwksURI, keyfunc.Options{})
		if err != nil {
			if v.publicKey == nil {
				return nil, err
			}
		} else {
			v.jwks = jwks
		}
	}

	if v.publicKey == nil && v.jwks == nil {
		return nil, errors.New("either JWKS URI or RSA public key PEM is required")
	}
	return v, nil
}

func NewVerifierFromPublicKey(rsaKey *rsa.PublicKey, issuer, audience string) (*Verifier, error) {
	if strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" {
		return nil, errors.New("JWT issuer and audience are required")
	}
	if rsaKey == nil || rsaKey.N.BitLen() < 2048 {
		return nil, errors.New("JWT key must be RSA with at least 2048 bits")
	}
	return &Verifier{
		publicKey: rsaKey,
		issuer:    issuer,
		audience:  audience,
	}, nil
}

// KeyID computes the RFC 7638 SHA-256 thumbprint for an RSA public key.
func KeyID(key *rsa.PublicKey) string {
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
	n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
	digest := sha256.Sum256([]byte(fmt.Sprintf(`{"e":"%s","kty":"RSA","n":"%s"}`, e, n)))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

func ComputeThumbprint(key *rsa.PublicKey) (string, error) {
	if key == nil {
		return "", errors.New("nil rsa public key")
	}
	return KeyID(key), nil
}

func keyID(key *rsa.PublicKey) string {
	return KeyID(key)
}

func (v *Verifier) VerifyToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(t *jwt.Token) (any, error) {
		kid, ok := t.Header["kid"].(string)
		if t.Header["typ"] != "JWT" || !ok || kid == "" {
			return nil, errors.New("invalid JWT header")
		}
		var key any = v.publicKey
		if v.jwks != nil {
			jwksKey, err := v.jwks.Keyfunc(t)
			if err == nil {
				key = jwksKey
			} else if v.publicKey == nil {
				return nil, err
			}
		}
		rsaKey, ok := key.(*rsa.PublicKey)
		if !ok || rsaKey == nil || rsaKey.N.BitLen() < 2048 || kid != KeyID(rsaKey) {
			return nil, errors.New("invalid JWT signing key")
		}
		return rsaKey, nil
	}, jwt.WithExpirationRequired(), jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(v.issuer), jwt.WithAudience(v.audience))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != v.audience {
		return nil, errors.New("invalid JWT audience")
	}
	userID, err := uuid.Parse(claims.Subject)
	if err != nil || userID.Version() != 4 || userID.Variant() != uuid.RFC4122 || userID.String() != claims.Subject {
		return nil, errors.New("invalid JWT subject")
	}
	id, err := uuid.Parse(claims.ID)
	if err != nil || id.Version() != 4 || id.Variant() != uuid.RFC4122 || id.String() != claims.ID {
		return nil, errors.New("invalid JWT ID")
	}
	if claims.Role != "CANDIDATE" && claims.Role != "RECRUITER" && claims.Role != "ADMIN" {
		return nil, errors.New("invalid JWT role")
	}
	if claims.IssuedAt == nil || claims.ExpiresAt == nil || claims.IssuedAt.After(time.Now().Add(time.Minute)) || !claims.ExpiresAt.After(claims.IssuedAt.Time) {
		return nil, errors.New("invalid JWT temporal claims")
	}
	if strings.TrimSpace(claims.RawCompanyID) != "" {
		compID, compErr := uuid.Parse(strings.TrimSpace(claims.RawCompanyID))
		if compErr == nil && compID != uuid.Nil {
			claims.CompanyID = &compID
		}
	}
	claims.UserID = userID
	return claims, nil
}
