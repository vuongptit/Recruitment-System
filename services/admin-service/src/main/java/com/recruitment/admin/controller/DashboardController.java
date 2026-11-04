package com.recruitment.admin.controller;

import com.recruitment.admin.dto.common.ApiResponse;
import com.recruitment.admin.dto.statistics.DashboardActivityResponse;
import com.recruitment.admin.dto.statistics.DashboardSnapshotResponse;
import com.recruitment.admin.service.DashboardActivityService;
import com.recruitment.admin.service.DashboardSnapshotService;
import com.recruitment.admin.service.DashboardExportService;
import com.recruitment.admin.service.DashboardReportService;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/stats")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {
  private final DashboardSnapshotService snapshot;
  private final DashboardActivityService activity;
  private final DashboardExportService exports;
  private final DashboardReportService reports;

  public DashboardController(DashboardSnapshotService snapshot, DashboardActivityService activity, DashboardExportService exports, DashboardReportService reports) {
    this.snapshot = snapshot;
    this.activity = activity;
    this.exports = exports;
    this.reports = reports;
  }

  @GetMapping("/snapshot")
  public ApiResponse<DashboardSnapshotResponse> snapshot(@AuthenticationPrincipal Jwt actor) {
    return new ApiResponse<>(snapshot.snapshot(actor), Map.of("scope", "CURRENT_STATE"));
  }

  @GetMapping("/activity")
  public ApiResponse<DashboardActivityResponse> activity(@AuthenticationPrincipal Jwt actor,
      @RequestParam(defaultValue = "30d") String period,
      @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) {
    return new ApiResponse<>(activity.activity(actor, period, from, to), Map.of("source", "RECORDED_EVENTS_AND_DAILY_STATS"));
  }

  @GetMapping("/today/export")
  public ResponseEntity<byte[]> exportToday(@AuthenticationPrincipal Jwt actor, @RequestParam(defaultValue = "xlsx") String type) throws IOException {
    var result = exports.today(actor, type);
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + result.filename())
        .contentType(MediaType.parseMediaType(result.contentType())).body(result.content());
  }

  @GetMapping("/report")
  public ResponseEntity<byte[]> report(@AuthenticationPrincipal Jwt actor,
      @RequestParam(defaultValue = "xlsx") String type, @RequestParam(defaultValue = "30d") String period,
      @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) throws IOException {
    var result = reports.export(actor, type, period, from, to);
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + result.filename())
        .contentType(MediaType.parseMediaType(result.contentType())).body(result.content());
  }
}
