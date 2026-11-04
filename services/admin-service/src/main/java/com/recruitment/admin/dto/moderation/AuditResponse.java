package com.recruitment.admin.dto.moderation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.recruitment.admin.model.AuditEntry;
import java.sql.Timestamp;
import java.util.UUID;

public record AuditResponse(UUID id, @JsonProperty("operation_id") UUID operationId,
    @JsonProperty("admin_id") UUID adminId, String action,
    @JsonProperty("target_type") String targetType, @JsonProperty("target_id") UUID targetId,
    String reason, String outcome, @JsonProperty("created_at") Timestamp createdAt,
    @JsonProperty("target_label") @JsonInclude(JsonInclude.Include.NON_NULL) String targetLabel,
    @JsonProperty("target_role") @JsonInclude(JsonInclude.Include.NON_NULL) String targetRole,
    @JsonProperty("admin_label") @JsonInclude(JsonInclude.Include.NON_NULL) String adminLabel) {
  public static AuditResponse from(AuditEntry entry) {
    return new AuditResponse(entry.id(), entry.operationId(), entry.adminId(), entry.action(),
        entry.targetType(), entry.targetId(), entry.reason(), entry.outcome(), Timestamp.from(entry.createdAt()), null, null, null);
  }

  public AuditResponse withLabels(String targetLabel, String targetRole, String adminLabel) {
    return new AuditResponse(id, operationId, adminId, action, targetType, targetId, reason, outcome, createdAt, targetLabel, targetRole, adminLabel);
  }
}
