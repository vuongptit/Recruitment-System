package com.recruitment.admin.dto.statistics;

import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public record DashboardActivityResponse(
    Range range, Map<String, Long> totals, Map<String, Long> previousTotals,
    List<DailyStatisticResponse> daily, List<FunnelStageResponse> funnel,
    LocalDate aggregatedThrough, LocalDate firstRecordedDate, long pendingDays, boolean liveRecalculated,
    Instant observedAt, boolean partial, List<HourlyStatisticResponse> hourly) {
  public record Range(String period, LocalDate from, LocalDate to, LocalDate previousFrom,
      LocalDate previousTo, String bucket, String timezone, Instant fromInstant, Instant toExclusive,
      Instant previousFromInstant, Instant previousToExclusive) {}
}
