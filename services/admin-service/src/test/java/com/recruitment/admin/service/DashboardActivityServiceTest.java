package com.recruitment.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.StatisticsRepository;
import java.time.*;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class DashboardActivityServiceTest {
  final ServiceGateway gateway = mock(ServiceGateway.class);
  final StatisticsRepository repository = mock(StatisticsRepository.class);
  final Clock clock = Clock.fixed(Instant.parse("2026-11-04T01:00:00Z"), ZoneOffset.UTC);
  final DashboardActivityService service = new DashboardActivityService(gateway, repository, clock);
  final Jwt actor = Jwt.withTokenValue("test").header("alg", "RS256").subject(UUID.randomUUID().toString()).build();

  @Test
  void defaultPeriodUsesThirtyCompleteDaysAndEqualPreviousPeriod() {
    var result = service.activity(actor, "30d", null, null);
    assertEquals(LocalDate.parse("2026-10-05"), result.range().from());
    assertEquals(LocalDate.parse("2026-11-03"), result.range().to());
    assertEquals(LocalDate.parse("2026-09-05"), result.range().previousFrom());
    assertEquals(LocalDate.parse("2026-10-04"), result.range().previousTo());
    assertEquals(5, result.totals().size());
    assertEquals(0, result.funnel().getFirst().count());
  }

  @Test
  void allTimeIsMonthlyRecordedHistoryAndHasNoMisleadingPreviousComparison() {
    var first = LocalDate.parse("2020-02-14");
    when(repository.firstRecordedDate()).thenReturn(first);
    when(repository.funnel(first, LocalDate.parse("2026-11-03"))).thenReturn(Map.of("APPLIED", 10L, "HIRED", 2L));
    var result = service.activity(actor, "all", null, null);
    assertEquals(first, result.range().from());
    assertEquals("MONTH", result.range().bucket());
    assertNull(result.previousTotals());
    assertEquals(20.0, result.funnel().getLast().rate());
    verify(repository).trend(first, LocalDate.parse("2026-11-03"), true);
  }

  @Test
  void incompleteFutureAndOverlongCustomRangesAreRejected() {
    assertThrows(AdminFailure.class, () -> service.activity(actor, "custom", LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-04")));
    assertThrows(AdminFailure.class, () -> service.activity(actor, "custom", LocalDate.parse("2020-01-01"), LocalDate.parse("2026-11-03")));
    assertThrows(AdminFailure.class, () -> service.activity(actor, "custom", null, null));
    assertThrows(AdminFailure.class, () -> service.activity(actor, "invalid", null, null));
    verify(repository, never()).totals(any(), any());
  }

  @Test
  void firstDayOfMonthDoesNotBorrowActivityFromPreviousMonth() {
    var firstDay = new DashboardActivityService(gateway, repository, Clock.fixed(Instant.parse("2026-11-01T01:00:00Z"), ZoneOffset.UTC));
    var result = firstDay.activity(actor, "month", null, null);
    assertTrue(result.range().from().isAfter(result.range().to()));
    assertNull(result.previousTotals());
  }

  @Test
  void durableAdminCheckHappensBeforeAnyStatisticsRead() {
    doThrow(new AdminFailure(403, "ACCESS_DENIED")).when(gateway).requireCurrentAdmin(actor);
    assertThrows(AdminFailure.class, () -> service.activity(actor, "all", null, null));
    verifyNoInteractions(repository);
  }

  @Test
  void dirtyMaterializationUsesRecordedEventsForBothCurrentAndPreviousTotals() {
    var from = LocalDate.parse("2026-10-05");
    var to = LocalDate.parse("2026-11-03");
    var previousFrom = LocalDate.parse("2026-09-05");
    var previousTo = LocalDate.parse("2026-10-04");
    when(repository.pendingDays(from, to)).thenReturn(1L);
    when(repository.pendingDays(previousFrom, previousTo)).thenReturn(1L);
    when(repository.recordedActivity(from, to, false)).thenReturn(java.util.List.of(new com.recruitment.admin.model.DailyStatistic(from, "APPLIED", 3)));
    when(repository.recordedActivity(previousFrom, previousTo, false)).thenReturn(java.util.List.of(new com.recruitment.admin.model.DailyStatistic(previousFrom, "APPLIED", 2)));
    var response = service.activity(actor, "30d", null, null);
    assertEquals(3L, response.totals().get("APPLIED"));
    assertEquals(2L, response.previousTotals().get("APPLIED"));
    assertTrue(response.liveRecalculated());
    assertEquals(1L, response.pendingDays());
    verify(repository, never()).totals(any(), any());
    verify(repository, never()).trend(any(), any(), anyBoolean());
  }

  @Test
  void todayUsesVietnamMidnightAndSameElapsedTimeYesterday() {
    Instant now = Instant.parse("2026-11-03T18:30:00Z"); // 01:30 on Nov 4 in Vietnam, still Nov 3 UTC.
    Instant start = Instant.parse("2026-11-03T17:00:00Z");
    Instant previousStart = Instant.parse("2026-11-02T17:00:00Z");
    Instant previousEnd = Instant.parse("2026-11-02T18:30:00Z");
    var current = new DashboardActivityService(gateway, repository, Clock.fixed(now, ZoneOffset.UTC));
    when(repository.recordedHourly(start, now)).thenReturn(java.util.List.of(new com.recruitment.admin.dto.statistics.HourlyStatisticResponse(start, "APPLIED", 3)));
    when(repository.recordedTotals(previousStart, previousEnd)).thenReturn(Map.of("APPLIED", 2L));
    when(repository.funnel(start, now)).thenReturn(Map.of("APPLIED", 3L));
    var result = current.activity(actor, "today", null, null);
    assertEquals(LocalDate.parse("2026-11-04"), result.range().from());
    assertEquals("Asia/Ho_Chi_Minh", result.range().timezone());
    assertEquals("HOUR", result.range().bucket());
    assertEquals(start, result.range().fromInstant());
    assertEquals(now, result.range().toExclusive());
    assertEquals(previousEnd, result.range().previousToExclusive());
    assertEquals(3L, result.totals().get("APPLIED"));
    assertEquals(2L, result.previousTotals().get("APPLIED"));
    assertTrue(result.partial());
    assertNull(result.aggregatedThrough());
    verify(repository, never()).daily(any(), any());
    verify(repository, never()).totals(any(), any());
  }

  @Test
  void exactlyAtLocalMidnightTodayIsAnEmptyHalfOpenWindow() {
    Instant now = Instant.parse("2026-11-03T17:00:00Z");
    var current = new DashboardActivityService(gateway, repository, Clock.fixed(now, ZoneOffset.UTC));
    var result = current.activity(actor, "today", null, null);
    assertEquals(result.range().fromInstant(), result.range().toExclusive());
    assertEquals(0L, result.totals().get("APPLIED"));
    assertTrue(result.hourly().isEmpty());
    assertTrue(result.partial());
  }
}
