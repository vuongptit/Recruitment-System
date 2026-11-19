package com.recruitment.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.*;

@Service
public class AdminQueryService {
  private final ServiceGateway gateway;
  private final JdbcTemplate db;

  @Autowired
  public AdminQueryService(ServiceGateway gateway, @Autowired(required = false) JdbcTemplate db) {
    this.gateway = gateway;
    this.db = db;
  }

  public JsonNode pendingCompanies(Jwt actor, String status, String query, String suspended, int page, int limit) {
    gateway.requireCurrentAdmin(actor);
    var uri = UriComponentsBuilder.fromPath("/").queryParam("verified_status", status)
        .queryParam("page", page).queryParam("limit", limit);
    if (query != null && !query.isBlank()) uri.queryParam("q", query);
    if (suspended != null) uri.queryParam("suspended", suspended);
    return gateway.call("COMPANY", HttpMethod.GET, uri.build().encode().toUriString(), null, actor);
  }

  public JsonNode pendingCompanies(Jwt actor, int page, int limit) {
    return pendingCompanies(actor, "PENDING", null, null, page, limit);
  }

  public JsonNode jobs(Jwt actor, String status, String query, String companyId, String suspended, int page, int limit) {
    gateway.requireCurrentAdmin(actor);
    var uri = UriComponentsBuilder.fromPath("/admin/list")
        .queryParam("page", page).queryParam("limit", limit);
    if (status != null && !status.isBlank() && !"ALL".equals(status)) uri.queryParam("status", status);
    if (query != null && !query.isBlank()) uri.queryParam("q", query);
    if (companyId != null) uri.queryParam("company_id", UUID.fromString(companyId));
    if (suspended != null) uri.queryParam("suspended", suspended);
    return gateway.call("JOB", HttpMethod.GET, uri.build().encode().toUriString(), null, actor);
  }

  public JsonNode companyDetail(Jwt actor, UUID id) {
    gateway.requireCurrentAdmin(actor);
    return gateway.call("COMPANY", HttpMethod.GET, "/admin/" + id, null, actor);
  }

  public JsonNode jobDetail(Jwt actor, UUID id) {
    gateway.requireCurrentAdmin(actor);
    return gateway.call("JOB", HttpMethod.GET, "/admin/" + id, null, actor);
  }

  public JsonNode pendingJobs(Jwt actor) {
    gateway.requireCurrentAdmin(actor);
    return gateway.call("JOB", HttpMethod.GET, "/pending", null, actor);
  }

  public JsonNode users(Jwt actor, String email, String role, Boolean locked, int page, int limit) {
    gateway.requireCurrentAdmin(actor);
    var uri = UriComponentsBuilder.fromPath("/auth/users").queryParam("email", email)
        .queryParam("page", page).queryParam("limit", limit);
    if (role != null) uri.queryParam("role", role);
    if (locked != null) uri.queryParam("locked", locked);
    JsonNode response = gateway.call("AUTH", HttpMethod.GET, uri.build().encode().toUriString(), null, actor);
    enrichUsersWithName(response);
    return response;
  }

  private void enrichUsersWithName(JsonNode response) {
    if (db == null || response == null) return;
    JsonNode dataNode = response.path("data");
    if (!dataNode.isArray() || dataNode.isEmpty()) return;

    List<UUID> ids = new ArrayList<>();
    for (JsonNode item : dataNode) {
      if (item.hasNonNull("id")) {
        try {
          ids.add(UUID.fromString(item.get("id").asText()));
        } catch (IllegalArgumentException ignored) {}
      }
    }
    if (ids.isEmpty()) return;

    Map<UUID, String> names = new HashMap<>();
    try {
      String inSql = String.join(",", Collections.nCopies(ids.size(), "?"));
      String sql = "SELECT u.id, COALESCE(NULLIF(BTRIM(u.recruiter_full_name), ''), NULLIF(BTRIM(p.full_name), ''), NULLIF(BTRIM(a.full_name), '')) AS full_name "
          + "FROM auth.users u "
          + "LEFT JOIN profile.profiles p ON p.user_id = u.id "
          + "LEFT JOIN admin.admin_profiles a ON a.admin_id = u.id "
          + "WHERE u.id IN (" + inSql + ")";
      db.query(sql, rs -> {
        UUID id = rs.getObject("id", UUID.class);
        String name = rs.getString("full_name");
        if (id != null && name != null && !name.isBlank()) {
          names.put(id, name.trim());
        }
      }, ids.toArray());
    } catch (Exception ignored) {
      // Graceful fallback if database schema or table is unavailable in isolated tests
    }

    for (JsonNode item : dataNode) {
      if (item instanceof ObjectNode obj && item.hasNonNull("id")) {
        try {
          UUID id = UUID.fromString(item.get("id").asText());
          String name = names.get(id);
          obj.put("full_name", name);
          obj.put("fullName", name);
        } catch (IllegalArgumentException ignored) {}
      }
    }
  }
}
