export const snapshotFixture = {
  capturedAt: "2026-11-04T02:00:00Z",
  metrics: Object.fromEntries(
    Object.entries({
      TOTAL_ACCOUNTS: 1234,
      CANDIDATES: 1000,
      RECRUITERS: 230,
      VERIFIED_COMPANIES: 100,
      SEARCHABLE_JOBS: 42,
      PENDING_COMPANIES: 3,
      PENDING_JOBS: 50,
      OPEN_REPORTS: 4,
      PROCESSING_REPORTS: 2,
    }).map(([key, value]) => [
      key,
      { value, available: true, lowerBound: key === "PENDING_JOBS" },
    ]),
  ),
};

export function activityFixture(
  period = "30d",
  from = "2026-10-01",
  to = "2026-10-31",
) {
  return {
    range: {
      period,
      from: period === "all" ? "2020-01-01" : from,
      to,
      previousFrom: period === "all" ? null : "2026-09-01",
      previousTo: period === "all" ? null : "2026-09-30",
      bucket: period === "all" ? "MONTH" : "DAY",
      timezone: "UTC",
    },
    totals: {
      JOBS_PUBLISHED: 18,
      APPLIED: 12,
      INTERVIEW: 4,
      OFFER: 2,
      HIRED: 1,
    },
    previousTotals:
      period === "all"
        ? null
        : { JOBS_PUBLISHED: 12, APPLIED: 10, INTERVIEW: 2, OFFER: 0, HIRED: 0 },
    daily: [{ metric: "APPLIED", stat_date: "2026-10-01", value: 12 }],
    funnel: [
      { stage: "APPLIED", count: 12, rate: 100 },
      { stage: "INTERVIEW", count: 4, rate: 33.3 },
      { stage: "OFFER", count: 2, rate: 16.7 },
      { stage: "HIRED", count: 1, rate: 8.3 },
    ],
    aggregatedThrough: to,
    firstRecordedDate: "2020-01-01",
    pendingDays: 0,
  };
}

export function todayActivityFixture() {
  return {
    ...activityFixture("today", "2026-11-04", "2026-11-04"),
    range: {
      period: "today",
      from: "2026-11-04",
      to: "2026-11-04",
      previousFrom: "2026-11-03",
      previousTo: "2026-11-03",
      bucket: "HOUR",
      timezone: "Asia/Ho_Chi_Minh",
      fromInstant: "2026-11-03T17:00:00Z",
      toExclusive: "2026-11-03T18:30:00Z",
      previousFromInstant: "2026-11-02T17:00:00Z",
      previousToExclusive: "2026-11-02T18:30:00Z",
    },
    totals: { APPLIED: 3 },
    previousTotals: { APPLIED: 2 },
    daily: [],
    hourly: [
      { stat_date: "2026-11-03T17:00:00Z", metric: "APPLIED", value: 3 },
    ],
    funnel: [{ stage: "APPLIED", count: 3, rate: 100 }],
    aggregatedThrough: null,
    observedAt: "2026-11-03T18:30:00Z",
    partial: true,
    liveRecalculated: true,
  };
}
