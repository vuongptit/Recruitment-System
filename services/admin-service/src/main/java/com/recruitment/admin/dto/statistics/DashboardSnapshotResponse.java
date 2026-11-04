package com.recruitment.admin.dto.statistics;

import java.time.Instant;
import java.util.Map;

public record DashboardSnapshotResponse(Instant capturedAt, Map<String, Metric> metrics) {
  public record Metric(Long value, boolean available, boolean lowerBound) {
    public static Metric exact(long value) { return new Metric(value, true, false); }
    public static Metric unavailable() { return new Metric(null, false, false); }
  }
}
