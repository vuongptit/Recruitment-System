package com.recruitment.admin.service;

import com.recruitment.admin.dto.statistics.StatisticsExport;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.support.DashboardReportWriter;
import java.io.IOException;
import java.time.LocalDate;
import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class DashboardReportService {
  private final DashboardActivityService activity;
  private final DashboardSnapshotService snapshot;

  public DashboardReportService(DashboardActivityService activity, DashboardSnapshotService snapshot) {
    this.activity = activity;
    this.snapshot = snapshot;
  }

  public StatisticsExport export(Jwt actor, String type, String period, LocalDate from, LocalDate to) throws IOException {
    if (!Set.of("csv", "xlsx").contains(type)) throw new AdminFailure(400, "EXPORT_TYPE_INVALID");
    // Both services enforce current durable Admin state. No cross-service transaction is claimed.
    var reportActivity = activity.activity(actor, period, from, to);
    var reportSnapshot = snapshot.snapshot(actor);
    var writer = new DashboardReportWriter(reportActivity, reportSnapshot);
    byte[] bytes = "csv".equals(type) ? writer.csv() : writer.xlsx();
    return new StatisticsExport(bytes, "careerhub-report-" + period + "-" + reportActivity.range().from() + "-" + reportActivity.range().to() + "." + type,
        "csv".equals(type) ? "text/csv;charset=UTF-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
}
