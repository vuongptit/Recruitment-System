package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"

	"interview-service/internal/apierror"
	"interview-service/internal/jwt"
	"interview-service/internal/middleware"
)

func NewRouter(
	verifier *jwt.Verifier,
	corsOrigins []string,
	schedulingHandler *SchedulingHandler,
	lifecycleHandler *LifecycleHandler,
	queryHandler *QueryHandler,
	healthHandler *HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.CORS(corsOrigins))

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		apierror.WriteError(w, apierror.NewStatus(http.StatusNotFound, "NOT_FOUND", "Endpoint was not found", nil))
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		apierror.WriteError(w, apierror.NewStatus(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "HTTP method is not allowed", nil))
	})

	if healthHandler != nil {
		r.Get("/health/live", healthHandler.Live)
		r.Get("/health/ready", healthHandler.Ready)
		r.Get("/actuator/health", healthHandler.Ready)
		r.Get("/actuator/health/liveness", healthHandler.Live)
		r.Get("/actuator/health/readiness", healthHandler.Ready)
		r.Get("/docs", healthHandler.Docs)
	}

	mountInterviewRoutes := func(sub chi.Router) {
		sub.Use(middleware.Authenticate(verifier))

		sub.Post("/", schedulingHandler.CreateInterview)
		sub.Get("/", queryHandler.ListApplicationInterviews)
		sub.Get("/my", queryHandler.ListMyInterviews)
		sub.Get("/calendar", queryHandler.ListCompanyCalendar)
		sub.Get("/availability", queryHandler.GetAvailability)
		sub.Get("/{id}", queryHandler.GetInterviewDetail)

		sub.Patch("/{id}/confirm", lifecycleHandler.ConfirmInterview)
		sub.Patch("/{id}/reschedule", lifecycleHandler.RescheduleInterview)
		sub.Patch("/{id}/cancel", lifecycleHandler.CancelInterview)
		sub.Post("/{id}/join", lifecycleHandler.JoinRoom)
		sub.Post("/{id}/leave", lifecycleHandler.LeaveRoom)
		sub.Patch("/{id}/feedback", lifecycleHandler.SubmitFeedback)
		sub.Get("/{id}/feedback", lifecycleHandler.GetFeedback)
	}

	r.Route("/interviews", mountInterviewRoutes)
	r.Route("/api/interviews", mountInterviewRoutes)

	return r
}
