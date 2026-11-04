package com.recruitment.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;
import java.util.UUID;

@Service
public class AdminQueryService {
  private final ServiceGateway gateway;

  public AdminQueryService(ServiceGateway gateway) {
    this.gateway = gateway;
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
    return gateway.call("AUTH", HttpMethod.GET, uri.build().encode().toUriString(), null, actor);
  }
}
