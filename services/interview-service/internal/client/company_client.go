package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"interview-service/internal/apierror"
	"interview-service/internal/middleware"

	"github.com/google/uuid"
)

type RecruiterCompanyMembership struct {
	CompanyID      uuid.UUID `json:"companyId"`
	Name           string    `json:"name"`
	VerifiedStatus string    `json:"verifiedStatus"`
	MemberRole     string    `json:"memberRole"`
}

type RecruiterContext struct {
	UserID     uuid.UUID `json:"userId"`
	CompanyID  uuid.UUID `json:"companyId"`
	MemberRole string    `json:"memberRole"`
}

type CompanyMemberResolver interface {
	ResolveMembership(ctx context.Context, recruiterID uuid.UUID, bearerToken string) (*RecruiterCompanyMembership, error)
}

type CompanyClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCompanyClient(baseURL, allowedHosts string, timeout time.Duration) (*CompanyClient, error) {
	normalizedBase, err := validateBaseURL(baseURL, allowedHosts, "COMPANY_SERVICE_URL")
	if err != nil {
		return nil, err
	}
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &CompanyClient{
		baseURL: normalizedBase,
		httpClient: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return errors.New("redirects are not allowed")
			},
		},
	}, nil
}

func (c *CompanyClient) VerifyActiveRecruiterContext(ctx context.Context, bearerToken string) (*RecruiterContext, error) {
	principal := middleware.GetPrincipal(ctx)
	var recruiterID uuid.UUID
	if principal != nil {
		recruiterID = principal.Subject
	} else if uid, ok := middleware.GetUserID(ctx); ok {
		recruiterID = uid
	}
	if recruiterID == uuid.Nil {
		return nil, apierror.New("UNAUTHORIZED", "Authentication is required", http.StatusUnauthorized)
	}
	mem, err := c.ResolveMembership(ctx, recruiterID, bearerToken)
	if err != nil {
		return nil, err
	}
	return &RecruiterContext{
		UserID:     recruiterID,
		CompanyID:  mem.CompanyID,
		MemberRole: mem.MemberRole,
	}, nil
}

func (c *CompanyClient) ResolveMembership(ctx context.Context, recruiterID uuid.UUID, bearerToken string) (*RecruiterCompanyMembership, error) {
	if recruiterID == uuid.Nil {
		return nil, errors.New("recruiterID is required")
	}
	token := strings.TrimSpace(bearerToken)
	if !strings.HasPrefix(token, "Bearer ") {
		token = "Bearer " + token
	}
	if len(token) <= 7 || len(token) > 8192 || hasControl(token) {
		return nil, deniedCompanyErr()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/by-user/%s", c.baseURL, recruiterID.String()), nil)
	if err != nil {
		return nil, unavailableCompanyErr()
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, unavailableCompanyErr()
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxResponseBytes+1))
	if err != nil || len(body) > MaxResponseBytes {
		return nil, unavailableCompanyErr()
	}

	switch resp.StatusCode {
	case http.StatusForbidden, http.StatusNotFound:
		return nil, deniedCompanyErr()
	case http.StatusUnauthorized:
		return nil, apierror.New("UNAUTHORIZED", "Authentication is required", http.StatusUnauthorized)
	case http.StatusOK:
		// continue
	default:
		return nil, unavailableCompanyErr()
	}

	if !isJSONContentType(resp.Header.Get("Content-Type")) || len(body) == 0 {
		return nil, unavailableCompanyErr()
	}

	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(body, &rawMap); err != nil {
		return nil, unavailableCompanyErr()
	}
	for k := range rawMap {
		if k != "data" && k != "meta" {
			return nil, unavailableCompanyErr()
		}
	}
	dataBytes, ok := rawMap["data"]
	if !ok || len(dataBytes) == 0 || string(dataBytes) == "null" {
		return nil, unavailableCompanyErr()
	}

	var membership RecruiterCompanyMembership
	dec := json.NewDecoder(bytes.NewReader(dataBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&membership); err != nil || dec.More() {
		return nil, unavailableCompanyErr()
	}

	if membership.CompanyID == uuid.Nil ||
		membership.CompanyID.Version() != 4 ||
		strings.TrimSpace(membership.Name) == "" ||
		(membership.MemberRole != "OWNER" && membership.MemberRole != "MEMBER") {
		return nil, deniedCompanyErr()
	}

	return &membership, nil
}

func deniedCompanyErr() *apierror.BusinessError {
	return apierror.New("COMPANY_ACCESS_DENIED", "Current recruiter does not belong to an active company", http.StatusForbidden)
}

func unavailableCompanyErr() *apierror.BusinessError {
	return apierror.New("COMPANY_MEMBERSHIP_UNAVAILABLE", "Company membership service is unavailable", http.StatusServiceUnavailable)
}
