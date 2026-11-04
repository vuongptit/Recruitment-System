package com.recruitment.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.recruitment.admin.dto.statistics.*;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.support.DashboardReportWriter;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.time.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class DashboardReportServiceTest {
  final DashboardActivityService activity = mock(DashboardActivityService.class);
  final DashboardSnapshotService snapshot = mock(DashboardSnapshotService.class);
  final DashboardReportService service = new DashboardReportService(activity, snapshot);
  final Jwt actor = Jwt.withTokenValue("test").header("alg", "RS256").subject(UUID.randomUUID().toString()).build();
  final Instant observedAt = Instant.parse("2026-11-04T03:00:00Z");

  DashboardSnapshotResponse state() {
    return new DashboardSnapshotResponse(observedAt, Map.of(
        "TOTAL_ACCOUNTS", DashboardSnapshotResponse.Metric.exact(15),
        "CANDIDATES", DashboardSnapshotResponse.Metric.unavailable(),
        "PENDING_JOBS", new DashboardSnapshotResponse.Metric(50L, true, true)));
  }

  DashboardActivityResponse historical() {
    return new DashboardActivityResponse(new DashboardActivityResponse.Range("custom", LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-03"), LocalDate.parse("2026-10-29"), LocalDate.parse("2026-10-31"), "DAY", "UTC", null, null, null, null),
        Map.of("APPLIED", 3L, "HIRED", 1L), Map.of("APPLIED", 5L),
        List.of(new DailyStatisticResponse(Date.valueOf("2026-11-02"), "APPLIED", 3L), new DailyStatisticResponse(Date.valueOf("2026-11-03"), "HIRED", 1L)),
        List.of(new FunnelStageResponse("APPLIED", 3L, 100), new FunnelStageResponse("HIRED", 1L, 100.0 / 3)), LocalDate.parse("2026-11-03"), LocalDate.parse("2026-10-01"), 0, false, observedAt, false, List.of());
  }

  @Test
  void workbookHasReadableSectionsNumericCountsAndEvaluatedDetailTotals() throws Exception {
    var writer = new DashboardReportWriter(historical(), state());
    try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(writer.xlsx()))) {
      assertEquals(5, workbook.getNumberOfSheets());
      assertEquals("Tong quan", workbook.getSheetName(0));
      assertNotNull(workbook.getSheet("Hien trang"));
      assertNotNull(workbook.getSheet("Pheu tuyen dung"));
      assertNotNull(workbook.getSheet("Huong dan"));
      var summary = workbook.getSheet("Tong quan");
      assertEquals(3.0, summary.getRow(9).getCell(1).getNumericCellValue());
      assertEquals(-2.0, summary.getRow(9).getCell(3).getNumericCellValue());
      assertEquals(-0.4, summary.getRow(9).getCell(4).getNumericCellValue(), 0.00001);
      assertTrue(summary.getRow(9).getCell(4).getCellStyle().getDataFormatString().contains("%"));
      var current = workbook.getSheet("Hien trang");
      assertEquals("—", current.getRow(5).getCell(2).getStringCellValue());
      assertEquals("50+", current.getRow(10).getCell(2).getStringCellValue());
      var detail = workbook.getSheet("Chi tiet");
      assertEquals(CellType.NUMERIC, detail.getRow(5).getCell(0).getCellType());
      assertEquals(0.0, detail.getRow(5).getCell(2).getNumericCellValue());
      assertEquals(3.0, detail.getRow(6).getCell(2).getNumericCellValue());
      assertEquals("SUM(C6:C8)", detail.getRow(8).getCell(2).getCellFormula());
      assertEquals(3.0, detail.getRow(8).getCell(2).getNumericCellValue());
      assertEquals(1.0, detail.getRow(8).getCell(5).getNumericCellValue());
      assertNotNull(detail.getPaneInformation());
      assertTrue(detail.getCTWorksheet().isSetAutoFilter());
      assertFalse(detail.isDisplayGridlines());
    }
  }

  @Test
  void csvIsVietnameseUtf8AndKeepsNegativeDifferencesNumeric() {
    String csv = new String(new DashboardReportWriter(historical(), state()).csv(), StandardCharsets.UTF_8);
    assertTrue(csv.startsWith("\uFEFFNhóm số liệu,Thời gian,Múi giờ,Chỉ số,Số lượng"));
    assertTrue(csv.contains("Tổng hoạt động,01/11/2026 – 03/11/2026,UTC,Đơn ứng tuyển,3,5,-2,-40.00,"));
    assertFalse(csv.contains(",'−2"));
    assertTrue(csv.contains("Tài khoản ứng viên,—"));
    assertTrue(csv.contains("Tin chờ duyệt,50+"));
    assertTrue(csv.contains("Chi tiết theo ngày,01/11/2026,UTC,Đơn ứng tuyển,0"));
    assertFalse(csv.contains("JOBS_PUBLISHED"));
  }

  @Test
  void todayRowsUseLocalHoursRatherThanUtcCalendarDate() throws Exception {
    Instant start = Instant.parse("2026-11-03T17:00:00Z"), end = Instant.parse("2026-11-03T18:30:00Z");
    var date = LocalDate.parse("2026-11-04");
    var today = new DashboardActivityResponse(new DashboardActivityResponse.Range("today", date, date, date.minusDays(1), date.minusDays(1), "HOUR", "Asia/Ho_Chi_Minh", start, end, start.minusSeconds(86400), end.minusSeconds(86400)),
        Map.of("APPLIED", 1L), Map.of("APPLIED", 0L), List.of(), List.of(new FunnelStageResponse("APPLIED", 1L, 100)), null, date, 0, true, end, true,
        List.of(new HourlyStatisticResponse(start, "APPLIED", 1L)));
    var writer = new DashboardReportWriter(today, state());
    String csv = new String(writer.csv(), StandardCharsets.UTF_8);
    assertTrue(csv.contains("Chi tiết theo giờ,04/11/2026 00:00,GMT+7,Đơn ứng tuyển,1"));
    assertTrue(csv.contains("Cùng thời điểm hôm qua"));
    assertTrue(csv.contains("Tạm tính"));
    try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(writer.xlsx()))) {
      var sheet = workbook.getSheet("Chi tiet");
      assertEquals(LocalDateTime.parse("2026-11-04T00:00:00"), sheet.getRow(5).getCell(0).getLocalDateTimeCellValue());
      assertEquals(1.0, sheet.getRow(7).getCell(2).getNumericCellValue());
    }
  }

  @Test
  void allTimeHistoryUsesMonthlyRowsInsteadOfDailyExportLimit() throws Exception {
    var first = LocalDate.parse("2020-01-01"); var end = LocalDate.parse("2026-11-03");
    var all = new DashboardActivityResponse(new DashboardActivityResponse.Range("all", first, end, null, null, "MONTH", "UTC", null, null, null, null),
        Map.of("APPLIED", 2L), null, List.of(new DailyStatisticResponse(Date.valueOf("2020-01-01"), "APPLIED", 2L)), List.of(), end, first, 0, false, observedAt, false, List.of());
    try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(new DashboardReportWriter(all, state()).xlsx()))) {
      var detail = workbook.getSheet("Chi tiet");
      assertEquals(88, detail.getLastRowNum()); // Header + 83 months + total.
      assertEquals(2.0, detail.getRow(88).getCell(2).getNumericCellValue());
    }
  }

  @Test
  void invalidFormatAndDeniedActivityNeverFetchSnapshot() {
    assertThrows(AdminFailure.class, () -> service.export(actor, "pdf", "30d", null, null));
    verifyNoInteractions(activity, snapshot);
    when(activity.activity(actor, "30d", null, null)).thenThrow(new AdminFailure(403, "ACCESS_DENIED"));
    assertThrows(AdminFailure.class, () -> service.export(actor, "xlsx", "30d", null, null));
    verifyNoInteractions(snapshot);
  }

  @Test
  void textFormulaPayloadIsEscapedWhileCsvQuotesAndNewlinesSurvive() {
    var source = historical();
    var malicious = new DashboardActivityResponse(source.range(), source.totals(), source.previousTotals(), source.daily(),
        List.of(new FunnelStageResponse("=SUM(1,2)\ntext", 1, 0)), source.aggregatedThrough(), source.firstRecordedDate(), 0, false, source.observedAt(), false, List.of());
    String csv = new String(new DashboardReportWriter(malicious, state()).csv(), StandardCharsets.UTF_8);
    assertTrue(csv.contains("\"'=SUM(1,2)\ntext\""));
  }
}
