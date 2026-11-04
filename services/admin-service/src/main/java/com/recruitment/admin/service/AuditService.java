package com.recruitment.admin.service;

import com.recruitment.admin.dto.common.ApiResponse;
import com.recruitment.admin.dto.moderation.AuditResponse;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.ModerationRepository;
import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
  private final ServiceGateway gateway;
  private final ModerationRepository store;
  private final AuditIdentityResolver identities;

  public AuditService(ServiceGateway gateway, ModerationRepository store, AuditIdentityResolver identities) {
    this.gateway = gateway;
    this.store = store;
    this.identities = identities;
  }

  public ApiResponse<List<AuditResponse>> list(Jwt actor, int page, int limit) {
    gateway.requireCurrentAdmin(actor);
    var entries = store.auditEntries(page, limit);
    var labels = identities.resolve(entries, actor);
    return new ApiResponse<>(entries.stream().map(entry -> {
      var target = labels.get(new AuditIdentityResolver.Key(AuditIdentityResolver.kind(entry.targetType()), entry.targetId()));
      var admin = labels.get(new AuditIdentityResolver.Key("USER", entry.adminId()));
      return AuditResponse.from(entry).withLabels(target == null ? null : target.name(), target == null ? null : target.role(), admin == null ? null : admin.name());
    }).toList(),
        Map.of("page", page, "limit", limit));
  }
}
