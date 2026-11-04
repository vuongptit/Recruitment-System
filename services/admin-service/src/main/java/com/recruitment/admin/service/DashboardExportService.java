package com.recruitment.admin.service;

import com.recruitment.admin.dto.statistics.StatisticsExport;
import com.recruitment.admin.exception.AdminFailure;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class DashboardExportService {
  private final DashboardActivityService activity;

  public DashboardExportService(DashboardActivityService activity) { this.activity = activity; }

  public StatisticsExport today(Jwt actor, String type) throws IOException {
    if (!Set.of("csv", "xlsx").contains(type)) throw new AdminFailure(400, "EXPORT_TYPE_INVALID");
    var result = activity.activity(actor, "today", null, null);
    var format = DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneId.of("Asia/Ho_Chi_Minh"));
    String asOf = format.format(result.observedAt());
    byte[] bytes;
    if ("csv".equals(type)) {
      var csv = new StringBuilder("\uFEFFhour_start,metric,value,as_of\r\n");
      for (var row : result.hourly()) csv.append(format.format(row.bucketStart())).append(',').append(row.metric())
          .append(',').append(row.value()).append(',').append(asOf).append("\r\n");
      bytes = csv.toString().getBytes(StandardCharsets.UTF_8);
    } else {
      try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
        var sheet = workbook.createSheet("Today GMT+7");
        var header = sheet.createRow(0);
        var columns = new String[] {"Hour start (GMT+7)", "Metric", "Value", "As of (GMT+7)"};
        for (int i = 0; i < columns.length; i++) header.createCell(i).setCellValue(columns[i]);
        int index = 1;
        for (var value : result.hourly()) {
          var row = sheet.createRow(index++);
          row.createCell(0).setCellValue(format.format(value.bucketStart()));
          row.createCell(1).setCellValue(value.metric());
          row.createCell(2).setCellValue(value.value());
          row.createCell(3).setCellValue(asOf);
        }
        sheet.createFreezePane(0, 1);
        for (int i = 0; i < columns.length; i++) sheet.setColumnWidth(i, i == 2 ? 3000 : 8500);
        workbook.write(output); bytes = output.toByteArray();
      }
    }
    return new StatisticsExport(bytes, "statistics-today-" + result.range().from() + "." + type,
        "csv".equals(type) ? "text/csv;charset=UTF-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
}
