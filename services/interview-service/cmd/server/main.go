package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"interview-service/internal/client"
	"interview-service/internal/config"
	"interview-service/internal/cursor"
	"interview-service/internal/db"
	"interview-service/internal/handler"
	"interview-service/internal/jwt"
	"interview-service/internal/livekit"
	"interview-service/internal/repository"
	"interview-service/internal/service"
	"interview-service/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.ConnectAndMigrate(ctx, cfg)
	if err != nil {
		slog.Error("failed to connect and migrate database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	keySource := cfg.JWTPublicKeyPEM
	if keySource == "" {
		keySource = cfg.JWTPublicKeyPath
	}
	verifier, err := jwt.NewVerifier(cfg.JWTJWKSURI, keySource, cfg.JWTIssuer, cfg.JWTAudience)
	if err != nil {
		slog.Error("failed to initialize JWT verifier", "error", err)
		os.Exit(1)
	}

	cursorCodec, err := cursor.NewCodec(cfg.CursorSecret)
	if err != nil {
		slog.Error("failed to initialize cursor codec", "error", err)
		os.Exit(1)
	}

	tokenIssuer := livekit.NewTokenIssuer(cfg.LiveKitURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)

	companyClient, err := client.NewCompanyClient(cfg.CompanyServiceURL, cfg.CompanyAllowedHosts, cfg.CompanyTimeout)
	if err != nil {
		slog.Error("failed to initialize company client", "error", err)
		os.Exit(1)
	}

	applicationClient, err := client.NewApplicationClient(cfg.ApplicationServiceURL, cfg.ApplicationAllowedHosts, cfg.ApplicationTimeout, cfg.ApplicationInternalAPIKey)
	if err != nil {
		slog.Error("failed to initialize application client", "error", err)
		os.Exit(1)
	}

	interviewRepo := repository.NewInterviewRepository(pool)
	queryRepo := repository.NewQueryRepository(pool)
	outboxRepo := repository.NewOutboxRepository(pool)

	schedulingSvc := service.NewSchedulingService(interviewRepo, companyClient, applicationClient, cfg.KafkaInterviewTopic)
	lifecycleSvc := service.NewLifecycleService(interviewRepo, companyClient, applicationClient, tokenIssuer, cfg.LiveKitURL, cfg.KafkaInterviewTopic)
	querySvc := service.NewQueryService(queryRepo, companyClient, applicationClient, cursorCodec)

	outboxPublisher := worker.NewOutboxPublisher(outboxRepo, cfg)
	defer func() { _ = outboxPublisher.Close() }()

	lifecycleScheduler := worker.NewLifecycleScheduler(interviewRepo, cfg)

	go outboxPublisher.Start(ctx)
	go lifecycleScheduler.Start(ctx)

	schedulingHandler := handler.NewSchedulingHandler(schedulingSvc)
	lifecycleHandler := handler.NewLifecycleHandler(lifecycleSvc)
	queryHandler := handler.NewQueryHandler(querySvc)
	healthHandler := handler.NewHealthHandler(pool, outboxPublisher)

	router := handler.NewRouter(verifier, cfg.CORSAllowedOrigins, schedulingHandler, lifecycleHandler, queryHandler, healthHandler)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		slog.Info("interview-service listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down interview-service...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
	}
	slog.Info("interview-service stopped cleanly")
}
