package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                      string
	DatabaseURL               string
	DBMaxConns                int32
	DBMinConns                int32
	DBSchema                  string
	JWTPublicKeyPEM           string
	JWTPublicKeyPath          string
	JWTJWKSURI                string
	JWTIssuer                 string
	JWTAudience               string
	CORSAllowedOrigins        []string
	ApplicationServiceURL     string
	ApplicationAllowedHosts   string
	ApplicationTimeout        time.Duration
	ApplicationInternalAPIKey string
	CompanyServiceURL         string
	CompanyAllowedHosts       string
	CompanyTimeout            time.Duration
	CursorSecret              string
	LiveKitURL                string
	LiveKitAPIKey             string
	LiveKitAPISecret          string
	LiveKitTokenTTL           time.Duration
	KafkaBrokers              []string
	KafkaInterviewTopic       string
	OutboxEnabled             bool
	OutboxPollDelay           time.Duration
	OutboxLeaseDuration       time.Duration
	OutboxBatchSize           int
	OutboxInitialBackoff      time.Duration
	OutboxMaxBackoff          time.Duration
	OutboxSendTimeout         time.Duration
	OutboxMaxAllowedLag       time.Duration
	NoShowCheckInterval       time.Duration
	ReminderCheckInterval     time.Duration
}

func Load() (*Config, error) {
	appTimeoutMs := getEnvInt("APPLICATION_REQUEST_TIMEOUT_MS", 3000)
	compTimeoutMs := getEnvInt("COMPANY_REQUEST_TIMEOUT_MS", 3000)
	pollMs := getEnvInt("INTERVIEW_EVENT_OUTBOX_POLL_DELAY_MS", 2000)
	leaseMs := getEnvInt("INTERVIEW_EVENT_OUTBOX_LEASE_MS", 30000)
	batchSize := getEnvInt("INTERVIEW_EVENT_OUTBOX_BATCH_SIZE", 50)
	retryBaseMs := getEnvInt("INTERVIEW_EVENT_OUTBOX_RETRY_BASE_MS", 1000)
	retryMaxMs := getEnvInt("INTERVIEW_EVENT_OUTBOX_RETRY_MAX_MS", 60000)
	kafkaTimeoutMs := getEnvInt("INTERVIEW_EVENT_KAFKA_TIMEOUT_MS", 5000)
	maxAgeMs := getEnvInt("INTERVIEW_EVENT_OUTBOX_MAX_AGE_MS", 900000)
	schedulerSec := getEnvInt("INTERVIEW_SCHEDULER_INTERVAL_SECONDS", 900)

	corsRaw := getEnv("CORS_ALLOWED_ORIGINS", getEnv("CORS_ORIGINS", getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")))
	var origins []string
	for _, o := range strings.Split(corsRaw, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	brokersRaw := getEnv("KAFKA_BROKERS", getEnv("SPRING_KAFKA_BOOTSTRAP_SERVERS", "kafka:9092"))
	var brokers []string
	for _, b := range strings.Split(brokersRaw, ",") {
		if trimmed := strings.TrimSpace(b); trimmed != "" {
			brokers = append(brokers, trimmed)
		}
	}

	keyPath := getEnv("JWT_PUBLIC_KEY_PATH", getEnv("JWT_PUBLIC_KEY", "/run/secrets/jwt-public.pem"))
	cursorSecret := getEnv("INTERVIEW_CURSOR_SECRET", getEnv("INTERVIEW_CURSOR_HMAC_KEY", "dev-only-interview-cursor-secret-32-bytes"))
	internalAPIKey := getEnv("APPLICATION_INTERNAL_API_KEY", "dev-only-application-internal-key-32-bytes")

	return &Config{
		Port:                      getEnv("PORT", getEnv("SERVER_PORT", "8080")),
		DatabaseURL:               ResolveDatabaseURL(),
		DBMaxConns:                int32(getEnvInt("DB_MAX_CONNS", 15)),
		DBMinConns:                int32(getEnvInt("DB_MIN_CONNS", 2)),
		DBSchema:                  getEnv("DB_SCHEMA", "interview"),
		JWTPublicKeyPEM:           os.Getenv("JWT_PUBLIC_KEY_PEM"),
		JWTPublicKeyPath:          keyPath,
		JWTJWKSURI:                getEnv("JWT_JWKS_URI", "http://auth-service:8080/.well-known/jwks.json"),
		JWTIssuer:                 getEnv("JWT_ISSUER", "https://auth.recruitment.local"),
		JWTAudience:               getEnv("JWT_AUDIENCE", "recruitment-api"),
		CORSAllowedOrigins:        origins,
		ApplicationServiceURL:     getEnv("APPLICATION_SERVICE_URL", "http://application-service:8080"),
		ApplicationAllowedHosts:   getEnv("APPLICATION_SERVICE_ALLOWED_HOSTS", "application-service,localhost,127.0.0.1"),
		ApplicationTimeout:        time.Duration(appTimeoutMs) * time.Millisecond,
		ApplicationInternalAPIKey: internalAPIKey,
		CompanyServiceURL:         getEnv("COMPANY_SERVICE_URL", "http://company-service:3000"),
		CompanyAllowedHosts:       getEnv("COMPANY_SERVICE_ALLOWED_HOSTS", "company-service,localhost,127.0.0.1"),
		CompanyTimeout:            time.Duration(compTimeoutMs) * time.Millisecond,
		CursorSecret:              cursorSecret,
		LiveKitURL:                getEnv("LIVEKIT_URL", "ws://localhost:7880"),
		LiveKitAPIKey:             getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitAPISecret:          getEnv("LIVEKIT_API_SECRET", "secret01234567890123456789012345"),
		LiveKitTokenTTL:           4 * time.Hour,
		KafkaBrokers:              brokers,
		KafkaInterviewTopic:       getEnv("KAFKA_INTERVIEW_TOPIC", "interview-events"),
		OutboxEnabled:             getEnvBool("INTERVIEW_EVENT_PUBLISHER_ENABLED", true),
		OutboxPollDelay:           time.Duration(pollMs) * time.Millisecond,
		OutboxLeaseDuration:       time.Duration(leaseMs) * time.Millisecond,
		OutboxBatchSize:           batchSize,
		OutboxInitialBackoff:      time.Duration(retryBaseMs) * time.Millisecond,
		OutboxMaxBackoff:          time.Duration(retryMaxMs) * time.Millisecond,
		OutboxSendTimeout:         time.Duration(kafkaTimeoutMs) * time.Millisecond,
		OutboxMaxAllowedLag:       time.Duration(maxAgeMs) * time.Millisecond,
		NoShowCheckInterval:       time.Duration(schedulerSec) * time.Second,
		ReminderCheckInterval:     time.Duration(schedulerSec) * time.Second,
	}, nil
}

func ResolveDatabaseURL() string {
	raw := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("SPRING_DATASOURCE_URL"))
	}
	pgUser := getEnv("POSTGRES_USER", getEnv("SPRING_DATASOURCE_USERNAME", "postgres"))
	pgPass := getEnv("POSTGRES_PASSWORD", getEnv("SPRING_DATASOURCE_PASSWORD", "postgres"))
	pgHost := getEnv("POSTGRES_HOST", "postgres")
	pgPort := getEnv("POSTGRES_PORT", "5432")
	pgDB := getEnv("POSTGRES_DB", "recruitment_db")

	if strings.HasPrefix(raw, "jdbc:postgresql://") {
		trimmed := strings.TrimPrefix(raw, "jdbc:")
		if u, err := url.Parse(trimmed); err == nil {
			u.Scheme = "postgres"
			if u.User == nil {
				u.User = url.UserPassword(pgUser, pgPass)
			}
			q := u.Query()
			q.Del("currentSchema")
			q.Set("sslmode", "disable")
			q.Set("search_path", "interview,public")
			u.RawQuery = q.Encode()
			return u.String()
		}
	}
	if raw != "" && (strings.HasPrefix(raw, "postgres://") || strings.HasPrefix(raw, "postgresql://")) {
		return raw
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&search_path=interview,public",
		url.PathEscape(pgUser), url.PathEscape(pgPass), pgHost, pgPort, pgDB)
}

func getEnv(key, defaultVal string) string {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultVal
	}
	parsed, err := strconv.Atoi(val)
	if err != nil || parsed <= 0 {
		return defaultVal
	}
	return parsed
}

func getEnvBool(key string, defaultVal bool) bool {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultVal
	}
	parsed, err := strconv.ParseBool(val)
	if err != nil {
		return defaultVal
	}
	return parsed
}
