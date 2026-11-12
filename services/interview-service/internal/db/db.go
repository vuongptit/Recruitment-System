package db

import (
	"context"
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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/lib/pq"

	"interview-service/internal/config"
	"interview-service/migrations"
)

const TargetSchema = "interview"

func EnsureSearchPath(databaseURL, schema string) string {
	u, err := url.Parse(databaseURL)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return strings.TrimSpace(databaseURL) + " search_path=" + schema
	}
	q := u.Query()
	q.Set("search_path", schema+",public")
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func ConnectAndMigrate(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	sqlDB, err := ConnectWithRetry(cfg.DatabaseURL, 10, 2*time.Second)
	if err != nil {
		return nil, err
	}
	defer func() { _ = sqlDB.Close() }()

	if err := RunMigrations(sqlDB, migrations.FS); err != nil {
		return nil, err
	}

	normalizedURL := EnsureSearchPath(cfg.DatabaseURL, TargetSchema)
	poolCfg, err := pgxpool.ParseConfig(normalizedURL)
	if err != nil {
		return nil, fmt.Errorf("parse pgxpool config: %w", err)
	}
	if cfg.DBMaxConns > 0 {
		poolCfg.MaxConns = cfg.DBMaxConns
	}
	if cfg.DBMinConns > 0 {
		poolCfg.MinConns = cfg.DBMinConns
	}
	poolCfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, execErr := conn.Exec(ctx, fmt.Sprintf("SET search_path TO %s, public", TargetSchema))
		return execErr
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pgxpool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping pgxpool: %w", err)
	}
	return pool, nil
}

func ConnectWithRetry(databaseURL string, maxRetries int, retryInterval time.Duration) (*sql.DB, error) {
	var db *sql.DB
	var err error

	normalizedURL := EnsureSearchPath(databaseURL, TargetSchema)

	for i := 1; i <= maxRetries; i++ {
		log.Printf("[DB] Connecting to interview database (attempt %d/%d)...", i, maxRetries)
		db, err = sql.Open("postgres", normalizedURL)
		if err == nil {
			err = db.Ping()
			if err == nil {
				log.Println("[DB] Interview database connected successfully!")
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

	return nil, fmt.Errorf("could not connect to interview database after %d attempts: %w", maxRetries, err)
}

func RunMigrations(db *sql.DB, migrationsFS embed.FS) error {
	log.Println("[Migration] Running auto-migrations for interview-service...")

	if _, err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", TargetSchema)); err != nil {
		return fmt.Errorf("failed to ensure schema %s exists: %w", TargetSchema, err)
	}
	if _, err := db.Exec(fmt.Sprintf("SET search_path TO %s, public", TargetSchema)); err != nil {
		return fmt.Errorf("failed to set search_path: %w", err)
	}

	d, err := iofs.New(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("failed to create iofs driver: %w", err)
	}

	driver, err := postgres.WithInstance(db, &postgres.Config{
		SchemaName:      TargetSchema,
		MigrationsTable: "interview_schema_migrations",
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

	log.Println("[Migration] Interview database migrations applied successfully!")
	return nil
}
