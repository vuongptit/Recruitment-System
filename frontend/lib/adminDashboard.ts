export type DashboardPeriod =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "all"
  | "custom";
export type SnapshotMetric = {
  value: number | null;
  available: boolean;
  lowerBound: boolean;
};
export type DashboardSnapshot = {
  capturedAt: string;
  metrics: Record<string, SnapshotMetric>;
};
export type DashboardActivity = {
  range: {
    period: DashboardPeriod;
    from: string;
    to: string;
    previousFrom: string | null;
    previousTo: string | null;
    bucket: "HOUR" | "DAY" | "MONTH";
    timezone: string;
    fromInstant?: string | null;
    toExclusive?: string | null;
    previousFromInstant?: string | null;
    previousToExclusive?: string | null;
  };
  totals: Record<string, number>;
  previousTotals: Record<string, number> | null;
  daily: Record<string, unknown>[];
  funnel: { stage: string; count: number; rate: number }[];
  aggregatedThrough: string | null;
  firstRecordedDate: string | null;
  pendingDays: number;
  liveRecalculated?: boolean;
  observedAt?: string;
  partial?: boolean;
  hourly?: Record<string, unknown>[];
};

export const dashboardPeriods: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "month", label: "Tháng này" },
  { value: "all", label: "Tất cả" },
  { value: "custom", label: "Tùy chỉnh" },
];
export const completeUtcDay = () =>
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);
export const dashboardDate = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
    dateStyle: "short",
  }).format(new Date(value));
