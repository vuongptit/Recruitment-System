package db

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/lib/pq"
)

const TargetSchema = "chat"

// EnsureSearchPath guarantees the target schema and public fallback are present in search_path.
func EnsureSearchPath(databaseURL, schema string) string {
	target := schema + ",public"
	u, err := url.Parse(databaseURL)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		if strings.Contains(databaseURL, "search_path") {
			return databaseURL
		}
		return strings.TrimSpace(databaseURL) + " search_path=" + target
	}

	q := u.Query()
	if q.Get("search_path") == "" {
		q.Set("search_path", target)
		u.RawQuery = q.Encode()
	}
	return u.String()
}

func ConnectWithRetry(databaseURL string, maxRetries int, retryInterval time.Duration) (*sql.DB, error) {
	var db *sql.DB
	var err error

	normalizedURL := EnsureSearchPath(databaseURL, TargetSchema)

	for i := 1; i <= maxRetries; i++ {
		log.Printf("[DB] Connecting to chat database (attempt %d/%d)...", i, maxRetries)
		db, err = sql.Open("postgres", normalizedURL)
		if err == nil {
			err = db.Ping()
			if err == nil {
				log.Println("[DB] Chat database connected successfully!")
				db.SetMaxOpenConns(25)
				db.SetMaxIdleConns(10)
				db.SetConnMaxLifetime(5 * time.Minute)
				return db, nil
			}
			_ = db.Close()
		}

		log.Printf("[DB] Ping failed: %v. Retrying in %v...", err, retryInterval)
		time.Sleep(retryInterval)
	}

	return nil, fmt.Errorf("could not connect to chat database after %d attempts: %w", maxRetries, err)
}

func RunMigrations(db *sql.DB, migrationsFS embed.FS) error {
	log.Println("[Migration] Running auto-migrations for chat-service...")

	if _, err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", TargetSchema)); err != nil {
		return fmt.Errorf("failed to ensure schema %s exists: %w", TargetSchema, err)
	}

	d, err := iofs.New(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("failed to create iofs driver: %w", err)
	}

	driver, err := postgres.WithInstance(db, &postgres.Config{
		SchemaName:      TargetSchema,
		MigrationsTable: "chat_schema_migrations",
	})
	if err != nil {
		return fmt.Errorf("failed to create postgres driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", d, "postgres", driver)
	if err != nil {
		return fmt.Errorf("failed to initialize migrate: %w", err)
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migration up failed: %w", err)
	}

	log.Println("[Migration] Chat database migrations applied successfully!")
	return nil
}

