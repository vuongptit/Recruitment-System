# Interview Service (Go)

CareerHub uses one interview round per application. The scheduling UI has two steps:

1. A recruiter selects one future time, duration (30/45/60 minutes), ONLINE/OFFLINE and a physical location when OFFLINE, then sends the invitation.
2. The owning candidate confirms. SCHEDULED becomes CONFIRMED and booking is complete.

This does not complete the hiring application or automatically send an offer.

## Scheduling and confirmation

- POST /interviews accepts roundNumber=1 (omitted/0 defaults to 1); other rounds are rejected.
- Company membership and Application stage INTERVIEW are verified before scheduling; candidate confirmation revalidates participant-authorized Application access.
- A per-application PostgreSQL transaction advisory lock prevents concurrent recruiters from creating separate appointments. A non-cancelled appointment, including COMPLETED/NO_SHOW, blocks a new initial schedule.
- Cancelled appointments may be replaced with another round-1 appointment. Existing historical multi-round data is retained.
- Idempotency uses scheduled_by/request_id and a normalized payload hash; retries return the same appointment.
- Database exclusion constraints still prevent candidate/interviewer time conflicts.
- Events are written through the transactional outbox.

## Corrections and historical compatibility

- Recruiters may correct the existing appointment using PATCH /interviews/{id}/reschedule. It creates a revision of the same interview, cancels the prior revision atomically, and resets confirmation.
- Candidate multi-slot negotiation is disabled: the reschedule endpoint returns 409 INTERVIEW_RESCHEDULE_DISABLED for CANDIDATE.
- Old RESCHEDULE_REQUESTED rows remain readable and can be resolved by a recruiter correction.
- The scheduling page no longer contains evaluation forms. Existing feedback API/read models remain for historical integration; new conclusions accept PASS/FAIL, not NEXT_ROUND.
- Cancellation endpoints, role-scoped queries, calendar and availability APIs remain compatible. They are not additional required booking steps.

## Optional online participation

ONLINE appointments retain authorized LiveKit room entry/leave and the join window from start minus 15 minutes to end plus 60 minutes. Recruiter preparation alone does not record candidate attendance. OFFLINE appointments are never automatically marked absent for lacking video activity.

## Verification

Run unit tests with go test ./internal/....

Database integration tests require an explicit isolated TEST_DATABASE_URL and use go test ./test -v. They never fall back to the user's DATABASE_URL.

See [the workflow and UI review](../../docs/interview-workflow-review.md) for the policy, UI decisions and limitations.
