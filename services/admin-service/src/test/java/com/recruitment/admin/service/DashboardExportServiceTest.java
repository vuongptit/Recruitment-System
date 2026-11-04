package com.recruitment.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.recruitment.admin.dto.statistics.*;
import com.recruitment.admin.exception.AdminFailure;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class DashboardExportServiceTest {
  final DashboardActivityService activity = mock(DashboardActivityService.class);
  final DashboardExportService service = new DashboardExportService(activity);
  final Jwt actor = Jwt.withTokenValue("test").header("alg", "RS256").subject(UUID.randomUUID().toString()).build();

  DashboardActivityResponse sample() {
    LocalDate date = LocalDate.parse("2026-11-04");
    Instant start = Instant.parse("2026-11-03T17:00:00Z"), now = Instant.parse("2026-11-03T18:30:00Z");
    return new DashboardActivityResponse(new DashboardActivityResponse.Range("today", date, date, date.minusDays(1), date.minusDays(1), "HOUR", "Asia/Ho_Chi_Minh", start, now, start.minusSeconds(86400), now.minusSeconds(86400)),
        Map.of("APPLIED", 1L), Map.of(), List.of(), List.of(), null, date, 0, true, now, true,
        List.of(new HourlyStatisticResponse(start, "APPLIED", 1L)));
  }

  @Test
  void csvContainsVietnamOffsetAndObservationTime() throws Exception {
    when(activity.activity(actor, "today", null, null)).thenReturn(sample());
    var file = service.today(actor, "csv");
    String csv = new String(file.content(), StandardCharsets.UTF_8);
    assertTrue(csv.startsWith("\uFEFFhour_start,metric,value,as_of\r\n"));
    assertTrue(csv.contains("2026-11-04T00:00:00+07:00,APPLIED,1,2026-11-04T01:30:00+07:00"));
    assertEquals("statistics-today-2026-11-04.csv", file.filename());
  }

  @Test
  void xlsxUsesNumericCountsAndCorrectTimezone() throws Exception {
    when(activity.activity(actor, "today", null, null)).thenReturn(sample());
    try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(service.today(actor, "xlsx").content()))) {
      var sheet = workbook.getSheetAt(0);
      assertEquals("Hour start (GMT+7)", sheet.getRow(0).getCell(0).getStringCellValue());
      assertEquals("2026-11-04T00:00:00+07:00", sheet.getRow(1).getCell(0).getStringCellValue());
      assertEquals(1.0, sheet.getRow(1).getCell(2).getNumericCellValue());
    }
  }

  @Test
  void unsupportedFormatDoesNotReadStatistics() {
    assertThrows(AdminFailure.class, () -> service.today(actor, "pdf"));
    verifyNoInteractions(activity);
  }
}
