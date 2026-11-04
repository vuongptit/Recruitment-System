package com.recruitment.admin.service;

import com.recruitment.admin.dto.statistics.DashboardActivityResponse;
import com.recruitment.admin.dto.statistics.DashboardActivityResponse.Range;
import com.recruitment.admin.dto.statistics.DailyStatisticResponse;
import com.recruitment.admin.dto.statistics.FunnelStageResponse;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.StatisticsRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardActivityService {
  private final ServiceGateway gateway;
  private final StatisticsRepository repository;
  private final Clock clock;

  @Autowired
  public DashboardActivityService(ServiceGateway gateway, StatisticsRepository repository) {
    this(gateway, repository, Clock.systemUTC());
  }

  DashboardActivityService(ServiceGateway gateway, StatisticsRepository repository, Clock clock) {
    this.gateway = gateway;
    this.repository = repository;
    this.clock = clock;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public DashboardActivityResponse activity(Jwt actor, String period, LocalDate from, LocalDate to) {
    gateway.requireCurrentAdmin(actor);
    if ("today".equals(period)) return currentDay();
    LocalDate today = LocalDate.now(clock);
    LocalDate through = today.minusDays(1);
    LocalDate first = repository.firstRecordedDate();
    boolean all = "all".equals(period);
    switch (period) {
      case "7d" -> { to = through; from = to.minusDays(6); }
      case "30d" -> { to = through; from = to.minusDays(29); }
      case "month" -> {
        to = through;
        // On the first day of a month no day of that month has been aggregated yet.
        from = today.withDayOfMonth(1);
      }
      case "all" -> { to = through; from = first != null && !first.isAfter(to) ? first : to; }
      case "custom" -> {
        StatisticsService.range(from, to);
        if (to.isAfter(through)) throw new AdminFailure(400, "STATISTICS_DAY_NOT_COMPLETE");
      }
      default -> throw new AdminFailure(400, "INVALID_STATISTICS_PERIOD");
    }
    long days = Math.max(0, ChronoUnit.DAYS.between(from, to) + 1);
    LocalDate previousTo = !all && days > 0 ? from.minusDays(1) : null;
    LocalDate previousFrom = previousTo == null ? null : previousTo.minusDays(days - 1);
    long pendingDays = repository.pendingDays(from, to);
    var rows = pendingDays > 0 ? repository.recordedActivity(from, to, all) : repository.trend(from, to, all);
    Map<String, Long> totals = pendingDays > 0 ? sum(rows) : zeroMetrics(repository.totals(from, to));
    Map<String, Long> previous = previousFrom == null ? null
        : repository.pendingDays(previousFrom, previousTo) > 0 ? sum(repository.recordedActivity(previousFrom, previousTo, false))
        : zeroMetrics(repository.totals(previousFrom, previousTo));
    var counts = repository.funnel(from, to);
    long applied = counts.getOrDefault("APPLIED", 0L);
    var funnel = List.of("APPLIED", "INTERVIEW", "OFFER", "HIRED").stream().map(stage -> {
      long value = counts.getOrDefault(stage, 0L);
      return new FunnelStageResponse(stage, value, applied == 0 ? 0.0 : 100.0 * value / applied);
    }).toList();
    return new DashboardActivityResponse(
        new Range(period, from, to, previousFrom, previousTo, all ? "MONTH" : "DAY", "UTC", null, null, null, null), totals, previous,
        rows.stream().map(DailyStatisticResponse::from).toList(), funnel,
        through, first, pendingDays, pendingDays > 0, clock.instant(), false, List.of());
  }

  private DashboardActivityResponse currentDay() {
    ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
    Instant observedAt = clock.instant();
    LocalDate date = observedAt.atZone(zone).toLocalDate();
    Instant start = date.atStartOfDay(zone).toInstant();
    Instant previousStart = date.minusDays(1).atStartOfDay(zone).toInstant();
    Instant previousEnd = previousStart.plus(Duration.between(start, observedAt));
    var hourly = repository.recordedHourly(start, observedAt);
    Map<String, Long> values = new LinkedHashMap<>();
    hourly.forEach(row -> values.merge(row.metric(), row.value(), Long::sum));
    var counts = repository.funnel(start, observedAt);
    long applied = counts.getOrDefault("APPLIED", 0L);
    var funnel = List.of("APPLIED", "INTERVIEW", "OFFER", "HIRED").stream().map(stage -> {
      long value = counts.getOrDefault(stage, 0L);
      return new FunnelStageResponse(stage, value, applied == 0 ? 0.0 : 100.0 * value / applied);
    }).toList();
    return new DashboardActivityResponse(
        new Range("today", date, date, date.minusDays(1), date.minusDays(1), "HOUR", zone.getId(),
            start, observedAt, previousStart, previousEnd),
        zeroMetrics(values), zeroMetrics(repository.recordedTotals(previousStart, previousEnd)), List.of(), funnel,
        null, repository.firstRecordedDate(), 0, true, observedAt, true, hourly);
  }

  private Map<String, Long> sum(List<com.recruitment.admin.model.DailyStatistic> rows) {
    Map<String, Long> values = new LinkedHashMap<>();
    rows.forEach(row -> values.merge(row.metric(), row.value(), Long::sum));
    return zeroMetrics(values);
  }

  private Map<String, Long> zeroMetrics(Map<String, Long> values) {
    Map<String, Long> result = new LinkedHashMap<>();
    for (String key : List.of("JOBS_PUBLISHED", "APPLIED", "INTERVIEW", "OFFER", "HIRED")) result.put(key, values.getOrDefault(key, 0L));
    return result;
  }
}
