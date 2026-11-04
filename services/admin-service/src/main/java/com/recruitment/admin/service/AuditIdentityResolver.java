package com.recruitment.admin.service;

import com.recruitment.admin.model.AuditEntry;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

/** Current display identities only; audit records and original IDs are never changed. */
@Service
public class AuditIdentityResolver {
  public record Key(String type, UUID id) {}
  public record Label(String name, String role) {}
  private final ServiceGateway gateway;

  public AuditIdentityResolver(ServiceGateway gateway) { this.gateway = gateway; }

  public Map<Key, Label> resolve(List<AuditEntry> entries, Jwt actor) {
    Map<Key, Label> result = new HashMap<>();
    var users = new LinkedHashSet<UUID>();
    entries.forEach(row -> {
      users.add(row.adminId());
      if ("USER".equals(kind(row.targetType()))) users.add(row.targetId());
    });
    var ids = new ArrayList<>(users);
    // One request for an ordinary page, bounded chunks for the maximum page size.
    for (int offset = 0; offset < ids.size(); offset += 100) {
      var requested = new HashSet<>(ids.subList(offset, Math.min(offset + 100, ids.size())));
      String query = requested.stream().map(UUID::toString).sorted().collect(Collectors.joining(","));
      try {
        var data = gateway.call("AUTH", HttpMethod.GET, "/auth/users/identities?ids=" + query, null, actor).path("data");
        if (!data.isArray()) continue;
        for (var row : data) {
          UUID id;
          try { id = UUID.fromString(row.path("id").asText()); } catch (IllegalArgumentException invalid) { continue; }
          String email = row.path("email").asText("").trim();
          if (requested.contains(id) && !email.isEmpty()) result.put(new Key("USER", id), new Label(email, row.path("role").asText(null)));
        }
      } catch (RuntimeException unavailable) {
        // Missing identity does not hide the underlying, already-authorized audit entry.
      }
    }
    var targets = entries.stream().map(row -> new Key(kind(row.targetType()), row.targetId()))
        .filter(key -> Set.of("COMPANY", "JOB").contains(key.type())).distinct().toList();
    if (targets.isEmpty()) return result;
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      Map<Key, CompletableFuture<Label>> pending = new LinkedHashMap<>();
      for (var key : targets) pending.put(key, CompletableFuture.supplyAsync(() -> {
        try {
          var data = gateway.call(key.type(), HttpMethod.GET, "/" + key.id(), null, actor).path("data");
          if (!key.id().toString().equals(data.path("id").asText())) return null;
          String name = data.path("COMPANY".equals(key.type()) ? "name" : "title").asText("").trim();
          return name.isEmpty() ? null : new Label(name, null);
        } catch (RuntimeException unavailable) { return null; }
      }, executor));
      pending.forEach((key, future) -> { Label label = future.join(); if (label != null) result.put(key, label); });
    }
    return result;
  }

  public static String kind(String type) { return "AUTH".equals(type) ? "USER" : type; }
}
