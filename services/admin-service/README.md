# Admin & Statistics Service

Spring Boot 3 / Java 21. Admin stores only moderation/audit/statistics data in its own `admin` schema. It never reads another service's database.

## REST MVC structure

Admin follows the same layer layout as Auth, using `@RestController` for JSON APIs and constructor injection. JDBC/Flyway remain the persistence stack; this refactor does not introduce JPA or change the database schema.

```text
com.recruitment.admin
├── AdminServiceApplication.java    Application entry point and component-scan root
├── controller/                    Moderation, reports, audit, statistics and health endpoints
├── dto/                           Validated request records and explicit JSON responses
├── service/                       Authorization checks and business orchestration
├── repository/                    Moderation/audit and statistics SQL
├── model/                         Report, audit, event, daily statistic and page values
├── config/                        Spring Security, OpenAPI and Kafka retry configuration
├── security/filter/               Request IDs and private response headers
├── infrastructure/
│   ├── client/                    Auth, Company and Job HTTP gateway
│   ├── kafka/                     Event parser and Kafka listener adapter
│   └── scheduler/                 Daily statistics aggregation trigger
├── exception/                     Business failures and @RestControllerAdvice
└── support/                       Shared moderation-reason validation
```

Controllers bind/validate HTTP input and map responses; they do not execute SQL, call persistence repositories or HTTP gateways directly, implement moderation decisions, or build CSV/XLSX files. Services recheck durable Admin state through Auth before privileged work. `POST /reports` remains available to any authenticated Candidate, Recruiter or Admin.

`ModerationRepository` owns report row locks, version checks, hourly quotas and append-only audit writes. Its audit method retains `REQUIRES_NEW`, and remote mutations remain outside a shared database transaction. Typed `Report` and `AuditEntry` values are mapped to response DTOs with the original snake_case JSON fields.

`StatisticsRepository` owns event idempotency, poison-record quarantine, dirty dates and cohort queries. The Kafka listener and scheduler call transactional methods on the injected `StatisticsService` bean so commit/acknowledgment order and `SKIP LOCKED` semantics remain intact. `StatisticsExportService` owns bounded CSV/XLSX generation.

Existing paths, status codes, `{data, meta}` / `{code, message, details}` envelopes, upstream origins, Kafka contracts, UTC aggregation schedule and Flyway migrations are preserved. Upstream moderation/directory JSON is forwarded as `JsonNode`; owned data uses explicit DTOs. Tests mirror the new packages, with cross-layer PostgreSQL checks under `integration`.

## Implemented routes

Gateway strips `/admin`; direct service routes below have no prefix.

| Method | Route | Access |
|---|---|---|
| GET | /companies/pending?page=1&limit=20 | ADMIN |
| GET | /companies?status=PENDING&q=&suspended=&page=1&limit=20 | ADMIN; complete directory |
| GET | /companies/{id} | ADMIN; detail |
| PATCH | /companies/{id}/moderation | ADMIN; suspend/restore with reason, expectedVersion and operationId |
| PATCH | /companies/{id}/verify | ADMIN; APPROVE or REJECT, rejection needs reason |
| GET | /jobs/pending | ADMIN; upstream currently returns at most 50 |
| GET | /jobs?status=&q=&company_id=&suspended=&page=1&limit=20 | ADMIN; complete directory |
| GET | /jobs/{id} | ADMIN; detail |
| PATCH | /jobs/{id}/moderation | ADMIN; remove/restore with reason, expectedVersion and operationId |
| PATCH | /jobs/{id}/approve | ADMIN |
| PATCH | /jobs/{id}/reject | ADMIN; reason required |
| GET | /users?email=&role=&locked=&page=1&limit=20 | ADMIN |
| PATCH | /users/{id}/lock | ADMIN; lock requires reason |
| POST | /reports | Authenticated Candidate, Recruiter or Admin |
| GET | /reports?status=&type=&page=1&limit=20 | ADMIN |
| PATCH | /reports/{id} | ADMIN; expectedVersion, status, resolution |
| GET | /audit-logs?page=1&limit=20 | ADMIN |
| GET | /stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD | ADMIN |
| GET | /stats/funnel?from=&to= | ADMIN |
| GET | /stats/snapshot | ADMIN; current account/company/job/queue counts |
| GET | /stats/activity?period=30d | ADMIN; today, 7d, 30d, month, all, custom |
| GET | /stats/today/export?type=xlsx\|csv | ADMIN; current Vietnam day, hourly rows |
| GET | /stats/report?type=xlsx\|csv&period=30d | ADMIN; complete formatted dashboard report; custom accepts from/to |
| GET | /stats/export?type=xlsx\|csv&from=&to= | ADMIN |

Swagger: direct `/swagger-ui/index.html`, OpenAPI `/v3/api-docs`, only with `SWAGGER_ENABLED=true`. Public deployment should keep docs disabled. Auth uses RS256 JWKS with issuer/audience/time/subject/role validation. Every administrative operation also checks durable Admin status via Auth's `/auth/me`; Auth outage fails closed. Bearer tokens are forwarded only to configured service origins, never to user-selected URLs.

## Moderation consistency

Remote moderation cannot share a database transaction with Admin. Admin first commits an append-only STARTED audit record, calls the owning service, then appends SUCCEEDED, FAILED (definite 4xx rejection) or UNKNOWN (timeout/outage). A missing terminal outcome or UNKNOWN must be reconciled with the owning service before a human retries. Do not blindly retry mutations. Audit contains acting Admin, target, reason, operation ID and UTC time; a database trigger prohibits UPDATE/DELETE.

Reports use a row lock and expectedVersion compare-and-set. Reports enter PROCESSING before remote action. Only a successful remote action can produce RESOLVED. USER reports lock their exact target through Auth. DISMISSED performs no remote action. A definite remote rejection reopens the report; an ambiguous failure leaves PROCESSING for operator investigation. An unexpected process crash may likewise leave PROCESSING. This version does not automate that investigation or provide a force-resolve endpoint.

Admin directory and takedown contracts are now available:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/companies?status=PENDING&q=&suspended=&page=1&limit=20` | Search all company verification states, optionally filtering suspended records |
| `GET` | `/companies/{id}` | Read the full company record for Admin review |
| `PATCH` | `/companies/{id}/moderation` | Suspend/restore with `expectedVersion`, idempotent `operationId`, and required `reason` |
| `GET` | `/jobs?status=PENDING_APPROVAL&q=&suspended=&page=1&limit=20` | Search jobs across lifecycle states |
| `GET` | `/jobs/{id}` | Read a job in any state |
| `PATCH` | `/jobs/{id}/moderation` | Remove/restore with the same version, operation and reason contract |

The owning Company/Job service stores moderation state and operation identity, increments its aggregate version, and retains the underlying record and application history. Public company/job reads and new applications exclude suspended targets. Reports targeting COMPANY/JOB now use the same owning-service operation before a report can become RESOLVED. These operations remain cross-service actions: UNKNOWN outcomes require reconciliation against the owner before another operation is started.

## Statistics semantics

Consumes current `job-events` and `application-events` v1. Unique event_id provides idempotency. DRAFT creation is not counted as a posted job; the first PUBLISHED observation is. Applied/Interview/Offer/Hired metrics count the first occurrence per entity/stage, so both OFFER_SENT and STATUS_CHANGED cannot inflate the offer count.

00:15 UTC scheduler rebuilds dirty historical days. Late/out-of-order events mark all affected dates dirty, including a previously counted later date. Multiple replicas lock dirty dates with SKIP LOCKED. Each pass processes at most 365 dates; a large historical replay may need multiple daily runs. Aggregation uses the event log as source of truth and retains it; retention/backlog alerting remains deployment work.

Malformed events are quarantined by topic/partition/offset without storing the malformed payload. Database outages retry indefinitely and do not acknowledge a lost record. Review `admin.rejected_events` and replay corrected upstream records through an authorized operational process.

The funnel is a cohort: applications first APPLIED within the requested dates, counted through the end of the requested range. Overview reads daily materializations; funnel reads raw events. New-user/new-company metrics are explicitly unavailable because there is no approved source event. Historical counts require an upstream baseline if the service starts after historical events have expired from Kafka.

Exports accept at most 367 calendar days of the five daily metrics (at most 1,835 rows), so synchronous XLSX/CSV stays below the document's 50,000-row async threshold. Raw arbitrary-size exports are not offered.

### Dashboard contracts

`GET /stats/snapshot` is independent of activity dates. It checks durable Admin state once before bounded parallel GET requests to the configured Auth, Company and Job services. Account totals come from directory pagination metadata, verified/pending companies from Company metadata, searchable jobs from Job Search's eligibility-filtered total, and pending jobs from the capped moderation list. The two report queues are counted in Admin's own schema. It does not query another service's tables. Each metric exposes `value`, `available`, `lowerBound`; an unavailable source yields null, never a fabricated zero. `PENDING_JOBS` becomes a lower bound at 50 because the owning API caps its list. `capturedAt` identifies observation time; the sources are not an atomic cross-service snapshot.

`GET /stats/activity?period=7d|30d|month|all|custom` uses completed UTC days through yesterday. Default `30d` covers the last 30 complete days. `custom` requires inclusive `from`/`to`, the existing 366-day difference bound and an end before today UTC. A preset month on its first day has no complete days and returns an empty period; it does not substitute the previous month. Bounded periods include a previous interval with the same number of days and its totals. Percent changes are calculated in the UI; a zero previous total is described without division by zero.

`all` starts at the earliest recorded metric event, groups the daily materialization by month, and omits previous-period comparisons. It describes recorded history, not guaranteed lifetime business totals. The response includes first recorded date, nominal completed-day cutoff, and the number of dirty dates in the selected range. When a range contains dirty dates, dashboard totals/series and bounded daily exports read first occurrences directly from recorded events instead of showing a stale materialization. `liveRecalculated` indicates that source and the UI explains it. Previous-period totals independently use the same fallback if needed. These reads do not alter history or clear the scheduler's dirty queue. Dashboard activity and export reads use a repeatable-read transaction to avoid observing mixed aggregation commits. Funnel counts retain the existing first-application cohort and end-of-range semantics, with one application counted once per stage.

The existing daily export contract stays bounded. Original overview/funnel/export and current-day export APIs remain available to existing clients. The dashboard buttons use the complete report endpoint described below; all-time reports retain monthly detail instead of applying the legacy daily-export limit.

`period=today` is a separate in-progress window in `Asia/Ho_Chi_Minh` (GMT+7): local midnight inclusive through the request's `observedAt` exclusive. It always reads recorded events, retains first-occurrence deduplication, and groups counts by hour. No future event or later hour is included. The prior comparison uses yesterday's midnight through the same elapsed duration, rather than yesterday's entire day. The response sets `partial=true`, `bucket=HOUR`, includes `hourly` and exact current/prior instant boundaries, and leaves `aggregatedThrough` null. The completed-day UTC presets retain their existing semantics. The UI refresh button requests a new observation; it does not claim automatic streaming updates.

Current-day CSV/XLSX uses `/stats/today/export`, not the UTC daily export. It reuses the same live-window service, emits hour starts and observation times with explicit `+07:00` offsets, and preserves numeric metric counts. It represents the observation time of the export request, which may be later than an already-open dashboard.

### Complete dashboard reports

The dashboard UI exports through `/stats/report?type=xlsx|csv&period=today|7d|30d|month|all|custom`, with `from`/`to` only for custom. `DashboardReportService` fetches authorized activity and current-state snapshots; `DashboardReportWriter` only formats their values. Each part retains its observation time; the export is not claimed to be an atomic cross-service snapshot. Data is refreshed on export, so the file can be newer than the open page.

XLSX contains five sheets: `Tong quan` (period, source, current/prior totals, differences and percentage changes), `Hien trang` (all current counts and queues with availability/lower-bound status), `Pheu tuyen dung` (cohort conversion), `Chi tiet` (one row per day/hour/month with five metric columns, zero buckets and an evaluated SUM total), and `Huong dan` (definitions/timezones/limitations). It uses numeric/date cells, percentage formats, styled headers, filters, frozen panes, repeated print headers and A4 landscape setup.

CSV is UTF-8 with BOM and one rectangular ten-column schema for all groups: group, period/time, timezone, Vietnamese metric label, count, prior count, difference, percentage, explanatory note and observation timestamp. Missing values and lower bounds remain explicit; numeric negative differences stay numeric. Text cells are escaped for commas/quotes/newlines and protected against formula prefixes. Complete reports cap detail at 9,000 buckets, keeping CSV below 50,000 data rows; oversized exports fail with `EXPORT_RANGE_TOO_LARGE` rather than silently truncating. Legacy daily endpoints retain their original raw-column formats.

### Audit display identities

`GET /audit-logs` retains the original action, reason, actor/target IDs, operation ID and outcome. It additionally returns optional `target_label`, `target_role` and `admin_label` for display. After checking the current Admin account, `AuditIdentityResolver` batches account and actor IDs through Auth's Admin-only `/auth/users/identities` endpoint (maximum 100 per call). Company names and job titles use their owning services' public detail APIs with deduplicated requests. Unavailable/deleted/nonpublic identities remain absent; audit rows are still returned. Labels reflect current information, not historical snapshots. No audit rows or schemas are modified.

## Run and test

Copy `.env.example` and resolve values as described in the root README. Existing Compose uses one PostgreSQL cluster with separate schemas. Production database/credential isolation is a separate migration; Admin source still accesses only its own schema.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
mvn test
mvn -Pintegration '-Dapi.version=1.44' verify
```

Integration tests use a disposable PostgreSQL 16 Testcontainer, apply Flyway migrations, and cover duplicates, late events, poison events, CAS report handling, audit immutability, application startup and OpenAPI/security. Docker must be running. The api.version property is for newer Docker engines whose minimum API exceeds the Java client's default.

REST MVC refactor verified on 14/10/2026: **22/22 unit tests and 5/5 PostgreSQL integration tests passed (27/27 total)**. Checks cover role restrictions, authenticated report submission, audit ordering, ambiguous report outcomes, CSV/XLSX contents, statistics replay/late events, report version checks, audit immutability, DTO JSON compatibility and secured application startup/OpenAPI.

Runtime starts migrations automatically. Configure migration/runtime roles separately in a production deployment, and use a migration job if runtime DDL is prohibited. Container readiness uses Actuator database health. Internal service URLs, Kafka broker and CORS origins are explicit in `.env.example`.
