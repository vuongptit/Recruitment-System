package middleware

import (
	"context"
	"net/http"
	"strings"

	"interview-service/internal/apierror"
	"interview-service/internal/jwt"

	"github.com/google/uuid"
)

type userContextKey string

const (
	UserIDKey    userContextKey = "user_id"
	UserRoleKey  userContextKey = "user_role"
	UserEmailKey userContextKey = "user_email"
	UserNameKey  userContextKey = "user_name"
	RawTokenKey  userContextKey = "raw_token"
	PrincipalKey userContextKey = "principal"
)

type Principal struct {
	Subject   uuid.UUID
	Role      string
	CompanyID *uuid.UUID
	Email     string
	FullName  string
}

func Auth(verifier *jwt.Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenString string
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
					tokenString = strings.TrimSpace(parts[1])
				}
			}

			if tokenString == "" {
				apierror.WriteError(w, apierror.New("UNAUTHORIZED", "Authentication is required", http.StatusUnauthorized))
				return
			}

			claims, err := verifier.VerifyToken(tokenString)
			if err != nil {
				apierror.WriteError(w, apierror.New("UNAUTHORIZED", "Authentication is required", http.StatusUnauthorized))
				return
			}

			principal := &Principal{
				Subject:   claims.UserID,
				Role:      claims.Role,
				CompanyID: claims.CompanyID,
				Email:     claims.Email,
				FullName:  claims.FullName,
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
			ctx = context.WithValue(ctx, UserEmailKey, claims.Email)
			ctx = context.WithValue(ctx, UserNameKey, claims.FullName)
			ctx = context.WithValue(ctx, RawTokenKey, tokenString)
			ctx = context.WithValue(ctx, PrincipalKey, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func Authenticate(verifier *jwt.Verifier) func(http.Handler) http.Handler {
	return Auth(verifier)
}

func GetPrincipal(ctx context.Context) *Principal {
	if p, ok := ctx.Value(PrincipalKey).(*Principal); ok {
		return p
	}
	return nil
}

func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetUserRole(r.Context())
			if !allowed[role] {
				apierror.WriteError(w, apierror.New("ACCESS_DENIED", "You do not have permission to perform this action", http.StatusForbidden))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	val, ok := ctx.Value(UserIDKey).(uuid.UUID)
	return val, ok
}

func GetUserRole(ctx context.Context) string {
	if val, ok := ctx.Value(UserRoleKey).(string); ok {
		return val
	}
	return ""
}

func GetRawToken(ctx context.Context) string {
	if val, ok := ctx.Value(RawTokenKey).(string); ok {
		return val
	}
	return ""
}

func GetUserName(ctx context.Context) string {
	if val, ok := ctx.Value(UserNameKey).(string); ok && strings.TrimSpace(val) != "" {
		return strings.TrimSpace(val)
	}
	if email, ok := ctx.Value(UserEmailKey).(string); ok && strings.TrimSpace(email) != "" {
		return strings.Split(email, "@")[0]
	}
	return "User"
}
