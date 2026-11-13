# Interview Service (Go)

Production-grade Go microservice managing the complete interview lifecycle for the Recruitment Platform:

1. **Flow 1 — HR Interview Scheduling (`POST /interviews`)**:
   - Supports `OFFLINE` (physical location required) and `ONLINE` (auto-generates video room path `/interviews/{id}/room`).
   - Verifies active recruiter membership via `company-service` and application schedulability (`INTERVIEW` only) via `application-service`. Recruiters explicitly move a reviewed application into the interview stage before scheduling.
   - Enforces PostgreSQL `btree_gist` exclusion constraints preventing candidate and interviewer double-booking (`[scheduled_start_at, scheduled_end_at)`).
   - Enforces idempotency via `(scheduled_by, request_id)` and SHA-256 payload hash.
   - Writes transactional outbox event (`SCHEDULED`) to `interview_event_outbox`.

2. **Flow 2 — Candidate Confirmation & Rescheduling (`PATCH /interviews/{id}/confirm`, `PATCH /interviews/{id}/reschedule`)**:
   - Candidate confirms attendance (`SCHEDULED -> CONFIRMED`); pending reschedule requests cannot be silently confirmed.
   - Confirmation, candidate reschedule requests and room entry re-check the current Application through its participant-authorized tracking API, forwarding the caller JWT. Ended/non-interview applications cannot continue on an old invitation.
   - Candidate requests reschedule (`SCHEDULED/CONFIRMED -> RESCHEDULE_REQUESTED`) with reason and 2–3 distinct future ISO-8601 timestamps.
   - Recruiter reschedules to a new time slot (marks previous interview `CANCELLED` and creates a new revision with `schedule_revision + 1` and `supersedes_interview_id`).
   - The new revision is `SCHEDULED` with no inherited confirmation. Recruiter rescheduling checks the current application stage again and supports idempotent retries with the same request ID/payload.
   - Background worker queues `REMINDER` events 24h prior to unconfirmed interviews.

3. **Flow 3 — Online Video Interview Room (`POST /interviews/{id}/join`, `POST /interviews/{id}/leave`)**:
   - Synchronized with LiveKit (`github.com/livekit/protocol/auth`).
   - Enforces join window `[scheduled_start_at - 15m, scheduled_end_at + 60m]`.
   - Transitions interview to `IN_PROGRESS` on the candidate's first join (`started_at`, and implicit confirmation if needed). Recruiter preparation alone does not record candidate attendance. Leave before a candidate has joined does not record an end timestamp.

4. **Flow 4 — Post-Interview Evaluation (`PATCH /interviews/{id}/feedback`, `GET /interviews/{id}/feedback`)**:
   - Stores structured competency scores (`technical`, `communication`, `attitude`, `cultureFit` 1..10), `overall_score`, `comment`, and `conclusion` (`PASS | FAIL | NEXT_ROUND`).
   - Transitions interview to `COMPLETED` and emits `COMPLETED` event.
   - Rejects feedback before scheduled start and while a reschedule request is pending. Feedback conclusions are recommendations; they do not automatically accept/reject the Application.

5. **Flow 5 — Cancellation & Automatic No-Show (`PATCH /interviews/{id}/cancel`)**:
   - Allows cancellation at least 2 hours before `scheduled_start_at` with mandatory reason.
   - Background scheduler only marks unstarted ONLINE interviews as `NO_SHOW` after `scheduled_end_at + 60 minutes`, consistent with the join grace window. OFFLINE attendance cannot be inferred from video usage and is handled by the recruiter.

6. **Flow 6 — Query, Calendar & Availability (`GET /interviews`, `/my`, `/calendar`, `/availability`, `/{id}`)**:
   - Role-scoped projections and HMAC-SHA256 signed keyset pagination cursors.

See [workflow review and UI decisions](../../docs/interview-workflow-review.md) for the current policy matrix, validation and remaining integration limits.
