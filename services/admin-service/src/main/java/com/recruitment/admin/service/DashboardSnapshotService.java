package com.recruitment.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.recruitment.admin.dto.statistics.DashboardSnapshotResponse;
import com.recruitment.admin.dto.statistics.DashboardSnapshotResponse.Metric;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.ModerationRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class DashboardSnapshotService {
  private final ServiceGateway gateway;
  private final ModerationRepository reports;

  public DashboardSnapshotService(ServiceGateway gateway, ModerationRepository reports) {
    this.gateway = gateway;
    this.reports = reports;
  }

  public DashboardSnapshotResponse snapshot(Jwt actor) {
    // Fail closed before any fan-out, even when every downstream metric could be unavailable.
    gateway.requireCurrentAdmin(actor);
    var capturedAt = Instant.now();
    Map<String, Supplier<Metric>> queries = new LinkedHashMap<>();
    queries.put("TOTAL_ACCOUNTS", () -> total("AUTH", "/auth/users?page=1&limit=1", actor));
    queries.put("CANDIDATES", () -> total("AUTH", "/auth/users?role=CANDIDATE&page=1&limit=1", actor));
    queries.put("RECRUITERS", () -> total("AUTH", "/auth/users?role=RECRUITER&page=1&limit=1", actor));
    queries.put("VERIFIED_COMPANIES", () -> total("COMPANY", "/?verified_status=VERIFIED&page=1&limit=1", actor));
    queries.put("PENDING_COMPANIES", () -> total("COMPANY", "/?verified_status=PENDING&page=1&limit=1", actor));
    queries.put("SEARCHABLE_JOBS", () -> {
      JsonNode value = gateway.call("JOB", HttpMethod.GET, "/search?limit=1", null, actor).path("data").path("total");
      return Metric.exact(number(value));
    });
    queries.put("PENDING_JOBS", () -> {
      JsonNode data = gateway.call("JOB", HttpMethod.GET, "/pending", null, actor).path("data");
      if (!data.isArray()) throw new IllegalArgumentException("Invalid pending list");
      // The owning API caps this list at 50; never present that cap as an exact total.
      return new Metric((long) data.size(), true, data.size() >= 50);
    });
    queries.put("OPEN_REPORTS", () -> Metric.exact(reports.countReports("OPEN")));
    queries.put("PROCESSING_REPORTS", () -> Metric.exact(reports.countReports("PROCESSING")));
    Map<String, Metric> metrics = new LinkedHashMap<>();
    // Bounded, read-only requests run concurrently; the gateway enforces upstream timeouts.
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      Map<String, CompletableFuture<Metric>> pending = new LinkedHashMap<>();
      queries.forEach((key, query) -> pending.put(key, CompletableFuture.supplyAsync(() -> {
        try { return query.get(); }
        catch (RuntimeException unavailable) { return Metric.unavailable(); }
      }, executor)));
      pending.forEach((key, task) -> metrics.put(key, task.join()));
    }
    return new DashboardSnapshotResponse(capturedAt, metrics);
  }

  private Metric total(String service, String path, Jwt actor) {
    return Metric.exact(number(gateway.call(service, HttpMethod.GET, path, null, actor).path("meta").path("total")));
  }

  private long number(JsonNode value) {
    if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) {
      throw new IllegalArgumentException("Invalid metric count");
    }
    return value.longValue();
  }
}
