package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"interview-service/internal/apierror"

	"github.com/google/uuid"
)

const MaxResponseBytes = 16 * 1024

type ApplicationAuthContext struct {
	ApplicationID      uuid.UUID `json:"applicationId"`
	JobID              uuid.UUID `json:"jobId"`
	CompanyID          uuid.UUID `json:"companyId"`
	CandidateID        uuid.UUID `json:"candidateId"`
	Status             string    `json:"status"`
	ApplicationVersion int64     `json:"applicationVersion"`
}

type ApplicationSchedulingContext struct {
	ApplicationID uuid.UUID
	JobID         uuid.UUID
	CompanyID     uuid.UUID
	CandidateID   uuid.UUID
	Status        string
	Version       int64
}

type ApplicationAuthorizer interface {
	AuthorizeScheduling(ctx context.Context, applicationID uuid.UUID, bearerToken string) (*ApplicationAuthContext, error)
}

type ApplicationClient struct {
	baseURL        string
	httpClient     *http.Client
	internalAPIKey string
}

func NewApplicationClient(baseURL, allowedHosts string, timeout time.Duration, internalAPIKey string) (*ApplicationClient, error) {
	if len(internalAPIKey) < 32 ||
		internalAPIKey != strings.TrimSpace(internalAPIKey) ||
		strings.Contains(strings.ToLower(internalAPIKey), "replace-with") ||
		hasControl(internalAPIKey) {
		return nil, errors.New("APPLICATION_INTERNAL_API_KEY must be a non-placeholder key of at least 32 bytes")
	}
	normalizedBase, err := validateBaseURL(baseURL, allowedHosts, "APPLICATION_SERVICE_URL")
	if err != nil {
		return nil, err
	}
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &ApplicationClient{
		baseURL:        normalizedBase,
		internalAPIKey: internalAPIKey,
		httpClient: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return errors.New("redirects are not allowed")
			},
		},
	}, nil
}

func (c *ApplicationClient) GetSchedulingContext(ctx context.Context, applicationID uuid.UUID, bearerToken string) (*ApplicationSchedulingContext, error) {
	authCtx, err := c.AuthorizeScheduling(ctx, applicationID, bearerToken)
	if err != nil {
		return nil, err
	}
	return &ApplicationSchedulingContext{
		ApplicationID: authCtx.ApplicationID,
		JobID:         authCtx.JobID,
		CompanyID:     authCtx.CompanyID,
		CandidateID:   authCtx.CandidateID,
		Status:        authCtx.Status,
		Version:       authCtx.ApplicationVersion,
	}, nil
}

func (c *ApplicationClient) AuthorizeScheduling(ctx context.Context, applicationID uuid.UUID, bearerToken string) (*ApplicationAuthContext, error) {
	if !strings.HasPrefix(bearerToken, "Bearer ") {
		bearerToken = "Bearer " + strings.TrimSpace(bearerToken)
	}
	reqBody, err := json.Marshal(map[string]string{
		"applicationId": applicationID.String(),
	})
	if err != nil {
		return nil, unavailableAppErr()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/interview-scheduling/authorize", bytes.NewReader(reqBody))
	if err != nil {
		return nil, unavailableAppErr()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Internal-Service", "interview-service")
	req.Header.Set("X-Internal-Api-Key", c.internalAPIKey)
	req.Header.Set("Authorization", bearerToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, unavailableAppErr()
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxResponseBytes+1))
	if err != nil || len(body) > MaxResponseBytes {
		return nil, unavailableAppErr()
	}

	switch resp.StatusCode {
	case http.StatusUnauthorized:
		return nil, apierror.New("UNAUTHORIZED", "Authentication is required", http.StatusUnauthorized)
	case http.StatusForbidden:
		return nil, apierror.New("APPLICATION_ACCESS_DENIED", "You do not have permission to schedule this application", http.StatusForbidden)
	case http.StatusNotFound:
		return nil, apierror.New("APPLICATION_NOT_FOUND", "Application was not found", http.StatusNotFound)
	case http.StatusConflict:
		var errPayload struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(body, &errPayload)
		code := "APPLICATION_NOT_SCHEDULABLE"
		if errPayload.Code == "APPLICATION_NOT_ELIGIBLE_FOR_INTERVIEW" || errPayload.Code == "APPLICATION_NOT_SCHEDULABLE" {
			code = errPayload.Code
		}
		return nil, apierror.New(code, "Application is not in a schedulable status", http.StatusConflict)
	case http.StatusOK:
		// continue
	default:
		return nil, unavailableAppErr()
	}

	if !isJSONContentType(resp.Header.Get("Content-Type")) || len(body) == 0 {
		return nil, unavailableAppErr()
	}

	var envelope struct {
		Data *ApplicationAuthContext `json:"data"`
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&envelope); err != nil || dec.More() || envelope.Data == nil {
		return nil, unavailableAppErr()
	}

	authCtx := envelope.Data
	if authCtx.ApplicationID != applicationID ||
		authCtx.JobID == uuid.Nil ||
		authCtx.CompanyID == uuid.Nil ||
		authCtx.CandidateID == uuid.Nil ||
		authCtx.CandidateID == uuid.MustParse("00000000-0000-0000-0000-000000000000") ||
		authCtx.ApplicationVersion < 0 ||
		authCtx.Status != "INTERVIEW" {
		return nil, unavailableAppErr()
	}

	return authCtx, nil
}

func unavailableAppErr() *apierror.BusinessError {
	return apierror.New("APPLICATION_AUTHORIZATION_UNAVAILABLE", "Application authorization service is unavailable", http.StatusServiceUnavailable)
}

func validateBaseURL(rawURL, allowedHosts, envName string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New(envName + " must be a clean http(s) origin without path, query, fragment or credentials")
	}
	host := strings.ToLower(u.Hostname())
	allowed := false
	for _, h := range strings.Split(allowedHosts, ",") {
		if strings.ToLower(strings.TrimSpace(h)) == host && host != "" {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", errors.New(envName + " host is not in allowed hosts list")
	}
	u.Path = ""
	return strings.TrimRight(u.String(), "/"), nil
}

func isJSONContentType(ct string) bool {
	mediaType, _, err := mime.ParseMediaType(ct)
	if err != nil {
		return false
	}
	return strings.EqualFold(mediaType, "application/json")
}

func hasControl(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}
