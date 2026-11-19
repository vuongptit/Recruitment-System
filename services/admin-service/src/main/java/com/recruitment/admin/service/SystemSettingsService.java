package com.recruitment.admin.service;

import com.recruitment.admin.dto.settings.PublicSettingsResponse;
import com.recruitment.admin.dto.settings.SystemSettingsResponse;
import com.recruitment.admin.dto.settings.UpdateSystemSettingsRequest;
import com.recruitment.admin.repository.ModerationRepository;
import com.recruitment.admin.repository.SystemSettingsRepository;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class SystemSettingsService {
  private final SystemSettingsRepository repository;
  private final ModerationRepository moderationRepository;

  public SystemSettingsService(SystemSettingsRepository repository, ModerationRepository moderationRepository) {
    this.repository = repository;
    this.moderationRepository = moderationRepository;
  }

  public SystemSettingsResponse getSettings() {
    return repository.getSettings();
  }

  public PublicSettingsResponse getPublicSettings() {
    return repository.getPublicSettings();
  }

  public SystemSettingsResponse updateSettings(UpdateSystemSettingsRequest request, Jwt actor) {
    UUID actorId = UUID.fromString(actor.getSubject());
    SystemSettingsResponse updated = repository.updateSettings(request, actorId);
    moderationRepository.audit(
        UUID.randomUUID(),
        actorId,
        "UPDATE_SYSTEM_SETTINGS",
        "SYSTEM",
        actorId,
        "Cập nhật cấu hình hệ thống: " + updated.siteName(),
        "SUCCEEDED"
    );
    return updated;
  }
}
