# Interview Service (Go)

Production-grade Go microservice managing the complete interview lifecycle for the Recruitment Platform:

1. **Flow 1 — HR Interview Scheduling (`POST /interviews`)**:
   - Supports `OFFLINE` (physical location required) and `ONLINE` (auto-generates video room path `/interviews/{id}/room`).
   - Verifies active recruiter membership via `company-service` and application schedulability (`REVIEWING` / `INTERVIEW`) via `application-service`.
   - Enforces PostgreSQL `btree_gist` exclusion constraints preventing candidate and interviewer double-booking (`[scheduled_start_at, scheduled_end_at)`).
   - Enforces idempotency via `(scheduled_by, request_id)` and SHA-256 payload hash.
   - Writes transactional outbox event (`SCHEDULED`) to `interview_event_outbox`.

2. **Flow 2 — Candidate Confirmation & Rescheduling (`PATCH /interviews/{id}/confirm`, `PATCH /interviews/{id}/reschedule`)**:
   - Candidate confirms attendance (`SCHEDULED -> CONFIRMED`).
   - Candidate requests reschedule (`SCHEDULED/CONFIRMED -> RESCHEDULE_REQUESTED`) with reason and 2–3 preferred slots.
   - Recruiter reschedules to a new time slot (marks previous interview `CANCELLED` and creates a new revision with `schedule_revision + 1` and `supersedes_interview_id`).
   - Background worker queues `REMINDER` events 24h prior to unconfirmed interviews.

3. **Flow 3 — Online Video Interview Room (`POST /interviews/{id}/join`, `POST /interviews/{id}/leave`)**:
   - Synchronized with LiveKit (`github.com/livekit/protocol/auth`).
   - Enforces join window `[scheduled_start_at - 15m, scheduled_end_at + 60m]`.
   - Transitions interview to `IN_PROGRESS` on first join (`started_at`) and records `ended_at` on leave.

4. **Flow 4 — Post-Interview Evaluation (`PATCH /interviews/{id}/feedback`, `GET /interviews/{id}/feedback`)**:
   - Stores structured competency scores (`technical`, `communication`, `attitude`, `cultureFit` 1..10), `overall_score`, `comment`, and `conclusion` (`PASS | FAIL | NEXT_ROUND`).
   - Transitions interview to `COMPLETED` and emits `COMPLETED` event.

5. **Flow 5 — Cancellation & Automatic No-Show (`PATCH /interviews/{id}/cancel`)**:
   - Allows cancellation at least 2 hours before `scheduled_start_at` with mandatory reason.
   - Background scheduler runs every 15 minutes to mark overdue unstarted interviews as `NO_SHOW`.

6. **Flow 6 — Query, Calendar & Availability (`GET /interviews`, `/my`, `/calendar`, `/availability`, `/{id}`)**:
   - Role-scoped projections and HMAC-SHA256 signed keyset pagination cursors.
