package com.recruitment.admin.support;

import com.recruitment.admin.dto.statistics.DashboardActivityResponse;
import com.recruitment.admin.dto.statistics.DashboardSnapshotResponse;
import com.recruitment.admin.exception.AdminFailure;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.*;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;

/** Presentation-only formatter. All numbers originate from the authorized dashboard services. */
public class DashboardReportWriter {
  private static final List<String> METRICS = List.of("JOBS_PUBLISHED", "APPLIED", "INTERVIEW", "OFFER", "HIRED");
  private static final Map<String, String> LABELS = Map.of(
      "JOBS_PUBLISHED", "Tin đã đăng", "APPLIED", "Đơn ứng tuyển", "INTERVIEW", "Hồ sơ đạt mốc phỏng vấn",
      "OFFER", "Hồ sơ được đề nghị nhận việc", "HIRED", "Hồ sơ tuyển thành công");
  private static final String[][] SNAPSHOT = {
      {"TOTAL_ACCOUNTS", "Hiện trạng", "Tổng tài khoản", "Bao gồm mọi vai trò và trạng thái tài khoản."},
      {"CANDIDATES", "Hiện trạng", "Tài khoản ứng viên", "Tài khoản có vai trò ứng viên; không phải số đơn ứng tuyển."},
      {"RECRUITERS", "Hiện trạng", "Tài khoản tuyển dụng", "Tài khoản có vai trò nhà tuyển dụng."},
      {"VERIFIED_COMPANIES", "Hiện trạng", "Công ty đã xác minh", "Hồ sơ doanh nghiệp đã được duyệt."},
      {"SEARCHABLE_JOBS", "Hiện trạng", "Tin đang hiển thị", "Tin công khai đáp ứng điều kiện tìm kiếm tại thời điểm lấy dữ liệu."},
      {"PENDING_COMPANIES", "Cần xử lý", "Công ty chờ xác minh", "Yêu cầu đang chờ quản trị viên xác minh."},
      {"PENDING_JOBS", "Cần xử lý", "Tin chờ duyệt", "Nếu hiển thị 50+, đây là số tối thiểu do nguồn dữ liệu giới hạn danh sách."},
      {"OPEN_REPORTS", "Cần xử lý", "Báo cáo mới", "Báo cáo có trạng thái OPEN."},
      {"PROCESSING_REPORTS", "Cần xử lý", "Báo cáo đang xử lý", "Báo cáo có trạng thái PROCESSING, cần tiếp tục đối soát."},
  };
  private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
  private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/uuuu");
  private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm:ss").withZone(VIETNAM);
  private static final int MAX_BUCKETS = 9000; // Keeps the complete CSV under 50,000 data rows.
  private static final int SUMMARY_COLUMNS = 15;
  private static final int MAX_CHART_POINTS = 14;
  private static final String[] ACTIVITY_CARDS = {"JOBS_PUBLISHED", "APPLIED", "HIRED"};
  private static final Map<String, String> SHORT_LABELS = Map.of(
      "APPLIED", "Ứng tuyển", "INTERVIEW", "Phỏng vấn", "OFFER", "Đề nghị", "HIRED", "Đã tuyển");
  private final DashboardActivityResponse activity;
  private final DashboardSnapshotResponse snapshot;
  private final List<Detail> details;
  private final Instant generatedAt = Instant.now();

  private record Detail(LocalDateTime time, Map<String, Long> values) {}

  public DashboardReportWriter(DashboardActivityResponse activity, DashboardSnapshotResponse snapshot) {
    this.activity = activity;
    this.snapshot = snapshot;
    details = detailRows();
  }

  private boolean hourly() { return "HOUR".equals(activity.range().bucket()); }
  private boolean monthly() { return "MONTH".equals(activity.range().bucket()); }
  private String zone() { return hourly() ? "GMT+7" : "UTC"; }
  private String bucketName() { return hourly() ? "Giờ" : monthly() ? "Tháng" : "Ngày"; }
  private String period() {
    if (activity.range().from().isAfter(activity.range().to())) return "Tháng này chưa có ngày hoàn tất";
    return DAY.format(activity.range().from()) + (hourly() ? " (Hôm nay)" : " – " + DAY.format(activity.range().to()));
  }
  private String previousPeriod() {
    if (activity.previousTotals() == null) return "Không áp dụng";
    return hourly() ? "Cùng thời điểm hôm qua" : DAY.format(activity.range().previousFrom()) + " – " + DAY.format(activity.range().previousTo());
  }
  private String sourceNote() {
    String source = activity.liveRecalculated() ? "Tính từ sự kiện đã ghi nhận." : "Số liệu tổng hợp theo ngày đã hoàn tất.";
    return (activity.partial() ? "Tạm tính trong ngày, chưa chốt. " : "") + source + " Không bao gồm lịch sử chưa đồng bộ.";
  }
  private String bucketLabel(LocalDateTime time) {
    return time.format(DateTimeFormatter.ofPattern(hourly() ? "dd/MM/uuuu HH:mm" : monthly() ? "MM/uuuu" : "dd/MM/uuuu"));
  }

  private List<Detail> detailRows() {
    var values = new TreeMap<LocalDateTime, Map<String, Long>>();
    if (hourly()) activity.hourly().forEach(row -> values.computeIfAbsent(row.bucketStart().atZone(VIETNAM).toLocalDateTime(), key -> new LinkedHashMap<>()).merge(row.metric(), row.value(), Long::sum));
    else activity.daily().forEach(row -> values.computeIfAbsent(row.date().toLocalDate().atStartOfDay(), key -> new LinkedHashMap<>()).merge(row.metric(), row.value(), Long::sum));
    List<Detail> result = new ArrayList<>();
    if (activity.range().from().isAfter(activity.range().to())) return result;
    LocalDateTime cursor = hourly() ? activity.range().fromInstant().atZone(VIETNAM).toLocalDateTime() : activity.range().from().atStartOfDay();
    if (monthly()) cursor = cursor.withDayOfMonth(1);
    LocalDateTime end = hourly() ? activity.range().toExclusive().atZone(VIETNAM).toLocalDateTime() : activity.range().to().plusDays(1).atStartOfDay();
    while (cursor.isBefore(end)) {
      if (result.size() >= MAX_BUCKETS) throw new AdminFailure(400, "EXPORT_RANGE_TOO_LARGE");
      Map<String, Long> row = new LinkedHashMap<>();
      for (String metric : METRICS) row.put(metric, values.getOrDefault(cursor, Map.of()).getOrDefault(metric, 0L));
      result.add(new Detail(cursor, row));
      cursor = monthly() ? cursor.plusMonths(1) : hourly() ? cursor.plusHours(1) : cursor.plusDays(1);
    }
    return result;
  }

  public byte[] csv() {
    var csv = new StringBuilder("\uFEFF");
    csvRow(csv, "Nhóm số liệu", "Thời gian", "Múi giờ", "Chỉ số", "Số lượng", "Kỳ so sánh", "Chênh lệch", "Tỷ lệ (%)", "Ghi chú", "Cập nhật lúc (GMT+7)");
    for (String[] definition : SNAPSHOT) {
      var metric = snapshot.metrics().get(definition[0]);
      Object value = metric == null || !metric.available() || metric.value() == null ? "—" : metric.lowerBound() ? metric.value() + "+" : metric.value();
      String note = metric == null || !metric.available() || metric.value() == null ? "Chưa lấy được số liệu. " : metric.lowerBound() ? "Số tối thiểu, không phải tổng chính xác. " : "";
      csvRow(csv, definition[1], "Tại thời điểm lấy dữ liệu", "GMT+7", definition[2], value, null, null, null, note + definition[3], STAMP.format(snapshot.capturedAt()));
    }
    for (String key : METRICS) {
      long current = activity.totals().getOrDefault(key, 0L);
      Long previous = activity.previousTotals() == null ? null : activity.previousTotals().getOrDefault(key, 0L);
      BigDecimal change = previous == null || previous == 0 ? null : BigDecimal.valueOf(current - previous).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(previous), 2, RoundingMode.HALF_UP);
      csvRow(csv, "Tổng hoạt động", period(), zone(), LABELS.get(key), current, previous, previous == null ? null : current - previous, change,
          (previous == null ? "Không áp dụng so sánh kỳ trước. " : "Tỷ lệ thay đổi so với " + previousPeriod() + ". ") + (previous != null && previous == 0 ? "Kỳ so sánh bằng 0, không tính phần trăm. " : "") + sourceNote(), STAMP.format(activity.observedAt()));
    }
    long applied = activity.funnel().stream().filter(row -> "APPLIED".equals(row.stage())).mapToLong(row -> row.count()).findFirst().orElse(0L);
    for (var row : activity.funnel()) csvRow(csv, "Phễu tuyển dụng", period(), zone(), LABELS.getOrDefault(row.stage(), row.stage()), row.count(), null, null,
        applied == 0 ? null : BigDecimal.valueOf(row.rate()).setScale(2, RoundingMode.HALF_UP), "Tỷ lệ trên hồ sơ nộp lần đầu trong kỳ; không phải tỷ lệ thay đổi. Không đếm ứng viên duy nhất.", STAMP.format(activity.observedAt()));
    for (var row : details) for (String key : METRICS) csvRow(csv, "Chi tiết theo " + bucketName().toLowerCase(Locale.ROOT), bucketLabel(row.time()), zone(), LABELS.get(key), row.values().get(key), null, null, null,
        activity.partial() ? "Tạm tính đến thời điểm cập nhật." : "", STAMP.format(activity.observedAt()));
    return csv.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static void csvRow(StringBuilder target, Object... values) {
    for (int i = 0; i < values.length; i++) {
      if (i > 0) target.append(',');
      Object value = values[i];
      if (value == null) continue;
      String text = value.toString();
      // Escape textual formulas while retaining genuinely numeric negative differences.
      String leading = text.stripLeading();
      if (!(value instanceof Number) && !leading.isEmpty() && "=+-@".indexOf(leading.charAt(0)) >= 0) text = "'" + text;
      if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) target.append('"').append(text.replace("\"", "\"\"")).append('"');
      else target.append(text);
    }
    target.append("\r\n");
  }

  public byte[] xlsx() throws IOException {
    try (var book = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
      book.getProperties().getCoreProperties().setTitle("Báo cáo quản trị CareerHub");
      book.getProperties().getCoreProperties().setCreator("CareerHub");
      var styles = new Styles(book);
      summary(book, styles);
      currentState(book, styles);
      funnel(book, styles);
      detail(book, styles);
      guide(book, styles);
      book.getCreationHelper().createFormulaEvaluator().evaluateAll();
      book.setActiveSheet(0);
      book.write(output);
      return output.toByteArray();
    }
  }

  private void summary(XSSFWorkbook book, Styles styles) {
    int[] widths = new int[SUMMARY_COLUMNS];
    Arrays.fill(widths, 10);
    var sheet = sheet(book, "Tong quan", widths);
    sheet.setZoom(90);
    title(sheet, styles, "CareerHub | Tổng quan quản trị", SUMMARY_COLUMNS);
    band(sheet, 1, "Kỳ hoạt động: " + period() + " (" + zone() + ")   ·   Kỳ so sánh: " + previousPeriod(), styles.note, 21);
    band(sheet, 2, "Cập nhật hoạt động: " + STAMP.format(activity.observedAt()) + "   ·   Xuất file: " + STAMP.format(generatedAt) + " (GMT+7)", styles.note, 21);
    band(sheet, 3, sourceNote(), styles.note, 22);

    band(sheet, 5, "Hiện trạng toàn hệ thống   ·   " + STAMP.format(snapshot.capturedAt()) + " (GMT+7)", styles.section, 25);
    for (int i = 0; i < 5; i++) {
      var definition = SNAPSHOT[i];
      tile(sheet, styles, 6, i * 3, 3, definition[2], snapshotValue(definition[0]), null, false);
    }

    band(sheet, 9, "Hoạt động tuyển dụng trong kỳ", styles.section, 25);
    for (int i = 0; i < ACTIVITY_CARDS.length; i++) {
      String key = ACTIVITY_CARDS[i];
      long value = activity.totals().getOrDefault(key, 0L);
      tile(sheet, styles, 10, i * 5, 5, LABELS.get(key), value, activityComparison(key, value), false);
    }

    drawSummaryCharts(sheet, styles);

    band(sheet, 34, "Cần xử lý tại thời điểm lấy số", styles.section, 25);
    for (int i = 0; i < 4; i++) {
      var definition = SNAPSHOT[i + 5];
      tile(sheet, styles, 35, i * 4, i == 3 ? 3 : 4, definition[2], snapshotValue(definition[0]), null, true);
    }

    band(sheet, 38, "So sánh hoạt động theo kỳ", styles.section, 25);
    summaryRow(sheet, 39, new Object[]{"Chỉ số", "Trong kỳ", "Kỳ so sánh", "Chênh lệch", "Thay đổi", "Diễn giải"},
        new CellStyle[]{styles.header, styles.header, styles.header, styles.header, styles.header, styles.header});
    int index = 40;
    for (String key : METRICS) {
      long value = activity.totals().getOrDefault(key, 0L);
      Long previous = activity.previousTotals() == null ? null : activity.previousTotals().getOrDefault(key, 0L);
      boolean comparable = previous != null && previous != 0;
      summaryRow(sheet, index++, new Object[]{LABELS.get(key), value, previous == null ? "—" : previous,
          previous == null ? "—" : value - previous, comparable ? (double) (value - previous) / previous : "—",
          previous == null ? "Không có kỳ so sánh" : previous == 0 ? "Kỳ so sánh bằng 0" : comparisonBasis()},
          new CellStyle[]{styles.text, styles.number, styles.number, styles.number, comparable ? styles.percent : styles.text, styles.text});
    }
    band(sheet, 46, "Xem các sheet Hiện trạng, Phễu tuyển dụng, Chi tiết và Hướng dẫn để đối chiếu số liệu.", styles.note, 24);
    sheet.createFreezePane(0, 4);
    sheet.setRowBreak(37);
    book.setPrintArea(book.getSheetIndex(sheet), 0, SUMMARY_COLUMNS - 1, 0, 46);
  }

  private Object snapshotValue(String key) {
    var metric = snapshot.metrics().get(key);
    if (metric == null || !metric.available() || metric.value() == null) return "—";
    return metric.lowerBound() ? metric.value() + "+" : metric.value();
  }

  private String activityComparison(String key, long current) {
    if (activity.previousTotals() == null) return "Không có kỳ so sánh";
    long previous = activity.previousTotals().getOrDefault(key, 0L);
    if (previous == 0) return current == 0 ? "Không phát sinh ở cả hai kỳ" : "Kỳ so sánh bằng 0";
    return String.format(Locale.forLanguageTag("vi-VN"), "%+.1f%% so với %s", (current - previous) * 100.0 / previous,
        hourly() ? "cùng giờ hôm qua" : "month".equals(activity.range().period()) ? "cả tháng trước" : "kỳ trước");
  }

  private String comparisonBasis() {
    if (hourly()) return "Cùng giờ hôm qua";
    return "month".equals(activity.range().period()) ? "Cả tháng trước" : "Hai kỳ cùng độ dài";
  }

  private void drawSummaryCharts(XSSFSheet sheet, Styles styles) {
    var drawing = sheet.createDrawingPatriarch();
    if (details.isEmpty()) {
      merged(row(sheet, 18, 30), 0, 8, "Chưa có dữ liệu xu hướng trong kỳ đã chọn.", styles.note);
    } else {
      int groupSize = (details.size() + MAX_CHART_POINTS - 1) / MAX_CHART_POINTS;
      var labels = new ArrayList<String>();
      var published = new ArrayList<Long>();
      var applied = new ArrayList<Long>();
      DateTimeFormatter compact = DateTimeFormatter.ofPattern(hourly() ? "HH:mm" : monthly() ? "MM/uuuu" : "dd/MM");
      for (int from = 0; from < details.size(); from += groupSize) {
        var group = details.subList(from, Math.min(from + groupSize, details.size()));
        labels.add(compact.format(group.getFirst().time()));
        published.add(group.stream().mapToLong(row -> row.values().get("JOBS_PUBLISHED")).sum());
        applied.add(group.stream().mapToLong(row -> row.values().get("APPLIED")).sum());
      }
      var chart = createChart(drawing, 0, 9, "Xu hướng tuyển dụng");
      var category = chart.createCategoryAxis(AxisPosition.BOTTOM);
      var values = chart.createValueAxis(AxisPosition.LEFT);
      values.setMinimum(0);
      values.setNumberFormat("#,##0");
      var lines = (XDDFLineChartData) chart.createData(ChartTypes.LINE, category, values);
      var categories = XDDFDataSourcesFactory.fromArray(labels.toArray(String[]::new));
      addLine(lines, categories, published, "Tin đã đăng", new byte[]{49, 88, (byte) 181});
      addLine(lines, categories, applied, "Đơn ứng tuyển", new byte[]{18, 105, 70});
      chart.getOrAddLegend().setPosition(LegendPosition.BOTTOM);
      chart.plot(lines);
      String unit = bucketName().toLowerCase(Locale.ROOT);
      merged(row(sheet, 32, 24), 0, 8, groupSize > 1 ? "Mỗi điểm gộp tối đa " + groupSize + " " + unit + "; nhãn là mốc bắt đầu nhóm."
          : "Mỗi điểm là một " + unit + " trong kỳ (" + zone() + ").", styles.note);
    }

    var stages = activity.funnel().stream().filter(item -> SHORT_LABELS.containsKey(item.stage())).toList();
    if (stages.isEmpty()) {
      merged(row(sheet, 18, 30), 9, 14, "Chưa có dữ liệu phễu tuyển dụng trong kỳ.", styles.note);
    } else {
      var chart = createChart(drawing, 9, SUMMARY_COLUMNS, "Phễu tuyển dụng (hồ sơ)");
      var category = chart.createCategoryAxis(AxisPosition.BOTTOM);
      var values = chart.createValueAxis(AxisPosition.LEFT);
      values.setMinimum(0);
      values.setNumberFormat("#,##0");
      values.setCrossBetween(AxisCrossBetween.BETWEEN);
      long largestStage = stages.stream().mapToLong(item -> item.count()).max().orElse(0);
      values.setMajorUnit(Math.max(1, Math.ceil(largestStage / 4.0)));
      var bars = (XDDFBarChartData) chart.createData(ChartTypes.BAR, category, values);
      bars.setBarDirection(BarDirection.COL);
      var labels = stages.stream().map(item -> SHORT_LABELS.get(item.stage())).toArray(String[]::new);
      var amounts = stages.stream().map(item -> item.count()).toArray(Long[]::new);
      var series = bars.addSeries(XDDFDataSourcesFactory.fromArray(labels), XDDFDataSourcesFactory.fromArray(amounts));
      series.setTitle("Số hồ sơ", null);
      var properties = new XDDFShapeProperties();
      properties.setFillProperties(new XDDFSolidFillProperties(XDDFColor.from(new byte[]{49, 88, (byte) 181})));
      series.setShapeProperties(properties);
      chart.plot(bars);
      merged(row(sheet, 32, 24), 9, 14, "Tính theo nhóm hồ sơ nộp lần đầu trong kỳ.", styles.note);
    }
  }

  private static XSSFChart createChart(XSSFDrawing drawing, int firstColumn, int lastColumn, String title) {
    var anchor = drawing.createAnchor(0, 0, 0, 0, firstColumn, 14, lastColumn, 32);
    var chart = drawing.createChart(anchor);
    chart.setTitleText(title);
    chart.setTitleOverlay(false);
    return chart;
  }

  private static void addLine(XDDFLineChartData lines, XDDFDataSource<String> categories, List<Long> amounts, String label, byte[] rgb) {
    var series = (XDDFLineChartData.Series) lines.addSeries(categories, XDDFDataSourcesFactory.fromArray(amounts.toArray(Long[]::new)));
    series.setTitle(label, null);
    series.setMarkerStyle(MarkerStyle.CIRCLE);
    series.setSmooth(false);
    var properties = new XDDFShapeProperties();
    properties.setLineProperties(new XDDFLineProperties(new XDDFSolidFillProperties(XDDFColor.from(rgb))));
    series.setShapeProperties(properties);
  }

  private static void tile(XSSFSheet sheet, Styles styles, int top, int firstColumn, int width,
      String label, Object value, String hint, boolean queue) {
    int lastColumn = firstColumn + width - 1;
    merged(row(sheet, top, 22), firstColumn, lastColumn, label, queue ? styles.queueLabel : styles.tileLabel);
    merged(row(sheet, top + 1, 33), firstColumn, lastColumn, value, queue ? styles.queueNumber : styles.tileNumber);
    if (hint != null) merged(row(sheet, top + 2, 22), firstColumn, lastColumn, hint, styles.tileLabel);
  }

  private static void summaryRow(XSSFSheet sheet, int index, Object[] cells, CellStyle[] styles) {
    int[] starts = {0, 4, 6, 8, 10, 12, SUMMARY_COLUMNS};
    var row = row(sheet, index, 28);
    for (int i = 0; i < cells.length; i++) merged(row, starts[i], starts[i + 1] - 1, cells[i], styles[i]);
  }

  private static void band(XSSFSheet sheet, int index, String title, CellStyle style, int height) {
    merged(row(sheet, index, height), 0, SUMMARY_COLUMNS - 1, title, style);
  }

  private static XSSFRow row(XSSFSheet sheet, int index, int height) {
    var row = sheet.getRow(index);
    if (row == null) row = sheet.createRow(index);
    row.setHeightInPoints(height);
    return row;
  }

  private static void merged(XSSFRow row, int first, int last, Object value, CellStyle style) {
    cell(row, first, value, style);
    for (int i = first + 1; i <= last; i++) row.createCell(i).setCellStyle(style);
    row.getSheet().addMergedRegion(new CellRangeAddress(row.getRowNum(), row.getRowNum(), first, last));
  }

  private void currentState(XSSFWorkbook book, Styles styles) {
    var sheet = sheet(book, "Hien trang", new int[]{20, 32, 20, 28, 75});
    title(sheet, styles, "Hiện trạng toàn hệ thống và yêu cầu cần xử lý", 5);
    note(sheet, styles, 1, "Lấy dữ liệu lúc: " + STAMP.format(snapshot.capturedAt()) + " (GMT+7). Số hiện tại độc lập với kỳ hoạt động.", 5);
    header(sheet, styles, 3, "Nhóm", "Chỉ số", "Số lượng", "Trạng thái số liệu", "Giải thích");
    int index = 4;
    for (String[] definition : SNAPSHOT) {
      var row = sheet.createRow(index++);
      var metric = snapshot.metrics().get(definition[0]);
      boolean available = metric != null && metric.available() && metric.value() != null;
      cell(row, 0, definition[1], styles.text); cell(row, 1, definition[2], styles.text);
      cell(row, 2, !available ? "—" : metric.lowerBound() ? metric.value() + "+" : metric.value(), available && !metric.lowerBound() ? styles.number : styles.text);
      cell(row, 3, !available ? "Chưa lấy được số liệu" : metric.lowerBound() ? "Số tối thiểu" : "Đã lấy được số liệu", available && !metric.lowerBound() ? styles.text : styles.warning);
      cell(row, 4, definition[3], styles.text); row.setHeightInPoints(42);
    }
    sheet.createFreezePane(2, 4); sheet.setAutoFilter(new CellRangeAddress(3, index - 1, 0, 4));
  }

  private void funnel(XSSFWorkbook book, Styles styles) {
    var sheet = sheet(book, "Pheu tuyen dung", new int[]{42, 20, 25, 82});
    title(sheet, styles, "Phễu tuyển dụng", 4);
    note(sheet, styles, 1, "Kỳ: " + period() + " | " + zone() + ". Tính các hồ sơ nộp lần đầu trong kỳ và đạt mốc đến thời điểm kết thúc kỳ.", 4);
    header(sheet, styles, 3, "Mốc tuyển dụng", "Số hồ sơ", "Tỷ lệ trên số đã nộp", "Cách đọc");
    long applied = activity.funnel().stream().filter(row -> "APPLIED".equals(row.stage())).mapToLong(row -> row.count()).findFirst().orElse(0L);
    int index = 4;
    for (var item : activity.funnel()) {
      var row = sheet.createRow(index++);
      cell(row, 0, LABELS.getOrDefault(item.stage(), item.stage()), styles.text); cell(row, 1, item.count(), styles.number);
      cell(row, 2, applied == 0 ? "—" : item.rate() / 100, applied == 0 ? styles.text : styles.percent);
      cell(row, 3, applied == 0 ? "Chưa có hồ sơ nộp trong kỳ để tính tỷ lệ." : "Một hồ sơ được tính một lần tại mỗi mốc; các mốc không phải các nhóm rời nhau.", styles.text);
      row.setHeightInPoints(36);
    }
    sheet.createFreezePane(1, 4); sheet.setAutoFilter(new CellRangeAddress(3, Math.max(3, index - 1), 0, 3));
  }

  private void detail(XSSFWorkbook book, Styles styles) {
    var sheet = sheet(book, "Chi tiet", new int[]{28, 22, 22, 30, 32, 28});
    title(sheet, styles, "Chi tiết hoạt động theo " + bucketName().toLowerCase(Locale.ROOT), 6);
    note(sheet, styles, 1, "Kỳ: " + period() + " | " + zone() + ". " + sourceNote(), 6);
    note(sheet, styles, 2, monthly() ? "Các tháng đầu/cuối chỉ tính phần thuộc kỳ đã chọn. Hàng 0 thể hiện không có sự kiện được ghi nhận." : hourly() ? "Giờ cuối là giờ đang diễn ra, chỉ tính đến thời điểm cập nhật. Hàng 0 thể hiện không có sự kiện được ghi nhận." : "Mỗi dòng là một ngày; hàng 0 thể hiện không có sự kiện được ghi nhận.", 6);
    header(sheet, styles, 4, bucketName() + " (" + zone() + ")", "Tin đã đăng", "Đơn ứng tuyển", "Phỏng vấn", "Đề nghị nhận việc", "Tuyển thành công");
    int index = 5;
    for (var detail : details) {
      var row = sheet.createRow(index++);
      var at = row.createCell(0); at.setCellValue(detail.time()); at.setCellStyle(hourly() ? styles.hour : monthly() ? styles.month : styles.date);
      for (int i = 0; i < METRICS.size(); i++) cell(row, i + 1, detail.values().get(METRICS.get(i)), styles.number);
    }
    var total = sheet.createRow(index);
    cell(total, 0, "TỔNG TRONG KỲ", styles.header);
    for (int i = 1; i <= METRICS.size(); i++) {
      var value = total.createCell(i); value.setCellStyle(styles.total);
      if (details.isEmpty()) value.setCellValue(0);
      else { String column = org.apache.poi.ss.util.CellReference.convertNumToColString(i); value.setCellFormula("SUM(" + column + "6:" + column + index + ")"); }
    }
    sheet.createFreezePane(1, 5); sheet.setAutoFilter(new CellRangeAddress(4, Math.max(4, index - 1), 0, 5));
  }

  private void guide(XSSFWorkbook book, Styles styles) {
    var sheet = sheet(book, "Huong dan", new int[]{32, 115});
    title(sheet, styles, "Hướng dẫn đọc báo cáo", 2);
    header(sheet, styles, 2, "Nội dung", "Giải thích");
    String[][] notes = {
        {"Phạm vi", "Hoạt động chỉ bao gồm sự kiện đã ghi nhận, không bảo đảm toàn bộ lịch sử trước khi hệ thống đồng bộ dữ liệu."},
        {"Hiện trạng", "Được lấy qua API của từng service và truy vấn báo cáo thuộc Admin; không phải ảnh chụp nguyên tử cùng lúc ở mọi service. Có thời điểm lấy số riêng."},
        {"Múi giờ", "Hôm nay và thời điểm cập nhật dùng GMT+7. Các kỳ ngày/tháng lịch sử dùng UTC theo hợp đồng thống kê."},
        {"Hôm nay", "Từ 00:00 GMT+7 đến thời điểm lấy số; chưa chốt. So với cùng thời điểm hôm qua, không so với cả ngày hôm qua."},
        {"Tin đã đăng", "Số tin được ghi nhận công khai lần đầu trong kỳ, khác số tin đang hiển thị tại thời điểm hiện tại."},
        {"Đơn ứng tuyển", "Số hồ sơ được ghi nhận ứng tuyển lần đầu trong kỳ. Một người có thể nộp nhiều hồ sơ."},
        {"Phỏng vấn / đề nghị / tuyển", "Số hồ sơ đạt từng mốc lần đầu trong kỳ. Không cộng các mốc để tính tổng ứng viên."},
        {"Phễu tuyển dụng", "Theo nhóm hồ sơ nộp lần đầu trong kỳ. Số đạt mốc có thể khác tổng hoạt động mốc đó, vì hồ sơ được nộp từ kỳ khác không thuộc nhóm này."},
        {"So sánh", "Chênh lệch = trong kỳ − kỳ so sánh. Tỷ lệ = chênh lệch / kỳ so sánh. Tháng này đối chiếu với cả tháng trước; không tính phần trăm khi kỳ so sánh bằng 0."},
        {"Dấu —", "Không áp dụng, không có mẫu số để tính tỷ lệ, hoặc chưa lấy được nguồn dữ liệu; xem cột trạng thái và giải thích. Không được hiểu là 0."},
        {"Dấu + sau số", "Là số tối thiểu, không phải tổng chính xác. Ví dụ 50+ tin chờ duyệt khi API nguồn chỉ trả tối đa 50 tin."},
        {"Xuất file", "Hoạt động và hiện trạng được lấy lại khi xuất. File có thể mới hơn trang đang mở; mỗi phần ghi rõ thời điểm cập nhật."},
        {"CSV", "Dùng UTF-8 BOM, tên chỉ số tiếng Việt, cùng một bộ cột cho mọi nhóm. Cột tỷ lệ là thay đổi ở nhóm Tổng hoạt động và chuyển đổi ở nhóm Phễu; xem Ghi chú."},
    };
    int index = 3;
    for (var pair : notes) { var row = sheet.createRow(index++); cell(row, 0, pair[0], styles.text); cell(row, 1, pair[1], styles.text); row.setHeightInPoints(52); }
    sheet.createFreezePane(1, 3);
  }

  private static XSSFSheet sheet(XSSFWorkbook book, String name, int[] widths) {
    var sheet = book.createSheet(name);
    for (int i = 0; i < widths.length; i++) sheet.setColumnWidth(i, widths[i] * 256);
    sheet.setDisplayGridlines(false); sheet.setFitToPage(true);
    sheet.getPrintSetup().setLandscape(true); sheet.getPrintSetup().setPaperSize(PrintSetup.A4_PAPERSIZE);
    sheet.getPrintSetup().setFitWidth((short) 1); sheet.getPrintSetup().setFitHeight((short) 0);
    sheet.getFooter().setRight("CareerHub | Trang &P / &N");
    return sheet;
  }
  private static void title(XSSFSheet sheet, Styles styles, String text, int columns) {
    var row = sheet.createRow(0); row.setHeightInPoints(36); cell(row, 0, text, styles.title);
    sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, columns - 1));
  }
  private static void note(XSSFSheet sheet, Styles styles, int index, String text, int columns) {
    var row = sheet.createRow(index); row.setHeightInPoints(32); cell(row, 0, text, styles.note);
    sheet.addMergedRegion(new CellRangeAddress(index, index, 0, columns - 1));
  }
  private static void header(XSSFSheet sheet, Styles styles, int index, String... names) {
    var row = sheet.createRow(index); row.setHeightInPoints(34);
    for (int i = 0; i < names.length; i++) cell(row, i, names[i], styles.header);
    sheet.setRepeatingRows(new CellRangeAddress(index, index, -1, -1));
  }
  private static void cell(Row row, int index, Object value, CellStyle style) {
    var cell = row.createCell(index); cell.setCellStyle(style);
    if (value instanceof Number number) cell.setCellValue(number.doubleValue()); else cell.setCellValue(value == null ? "" : value.toString());
  }
  private static class Styles {
    final XSSFCellStyle title, header, text, note, number, percent, date, month, hour, total, warning;
    final XSSFCellStyle section, tileLabel, tileNumber, queueLabel, queueNumber;
    Styles(XSSFWorkbook book) {
      var normal = book.createFont(); normal.setFontName("Calibri"); normal.setFontHeightInPoints((short) 11);
      text = book.createCellStyle(); text.setFont(normal); text.setVerticalAlignment(VerticalAlignment.CENTER); text.setWrapText(true);
      text.setBorderBottom(BorderStyle.HAIR); text.setBottomBorderColor(IndexedColors.GREY_25_PERCENT.getIndex());
      title = copy(book, text); var heading = book.createFont(); heading.setFontName("Calibri"); heading.setFontHeightInPoints((short) 20); heading.setBold(true); heading.setColor(new XSSFColor(new byte[]{49,88,(byte)181}, null)); title.setFont(heading);
      header = copy(book, text); var white = book.createFont(); white.setFontName("Calibri"); white.setBold(true); white.setColor(IndexedColors.WHITE.getIndex()); header.setFont(white); header.setFillForegroundColor(new XSSFColor(new byte[]{49,88,(byte)181}, null)); header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      note = copy(book, text); note.setBorderBottom(BorderStyle.NONE);
      number = copy(book, text); number.setAlignment(HorizontalAlignment.RIGHT); number.setDataFormat(book.createDataFormat().getFormat("#,##0;[Red]-#,##0"));
      percent = copy(book, number); percent.setDataFormat(book.createDataFormat().getFormat("0.0%;[Red]-0.0%"));
      date = copy(book, text); date.setDataFormat(book.createDataFormat().getFormat("dd/mm/yyyy"));
      month = copy(book, text); month.setDataFormat(book.createDataFormat().getFormat("mm/yyyy"));
      hour = copy(book, text); hour.setDataFormat(book.createDataFormat().getFormat("dd/mm/yyyy hh:mm"));
      total = copy(book, header); total.setDataFormat(number.getDataFormat()); total.setAlignment(HorizontalAlignment.RIGHT);
      warning = copy(book, text); warning.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex()); warning.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      section = copy(book, header); section.setIndention((short) 1);
      tileLabel = tileStyle(book, note, 11, new byte[]{(byte) 236, (byte) 242, (byte) 255}, new byte[]{36, 61, 107});
      tileNumber = tileStyle(book, tileLabel, 21, new byte[]{(byte) 236, (byte) 242, (byte) 255}, new byte[]{25, 48, 95});
      tileNumber.setDataFormat(number.getDataFormat());
      queueLabel = tileStyle(book, note, 11, new byte[]{(byte) 255, (byte) 247, (byte) 227}, new byte[]{110, 75, 14});
      queueNumber = tileStyle(book, queueLabel, 19, new byte[]{(byte) 255, (byte) 247, (byte) 227}, new byte[]{110, 75, 14});
      queueNumber.setDataFormat(number.getDataFormat());
    }

    private static XSSFCellStyle tileStyle(XSSFWorkbook book, CellStyle base, int size, byte[] background, byte[] foreground) {
      var tile = copy(book, base);
      var font = book.createFont();
      font.setFontName("Calibri"); font.setFontHeightInPoints((short) size); font.setBold(true);
      font.setColor(new XSSFColor(foreground, null));
      tile.setFont(font);
      tile.setIndention((short) 1);
      tile.setFillForegroundColor(new XSSFColor(background, null));
      tile.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      tile.setBorderRight(BorderStyle.MEDIUM);
      tile.setRightBorderColor(IndexedColors.WHITE.getIndex());
      return tile;
    }
    private static XSSFCellStyle copy(XSSFWorkbook book, CellStyle source) { var result = book.createCellStyle(); result.cloneStyleFrom(source); return result; }
  }
}
