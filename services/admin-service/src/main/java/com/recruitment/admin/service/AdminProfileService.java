package com.recruitment.admin.service;

import com.recruitment.admin.dto.profile.AdminProfileResponse;
import com.recruitment.admin.dto.profile.UpdateAdminProfileRequest;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.AdminProfileRepository;
import com.recruitment.admin.repository.ModerationRepository;
import java.util.UUID;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class AdminProfileService {
  private final AdminProfileRepository repository;
  private final ModerationRepository moderationRepository;
  private final ServiceGateway gateway;

  public AdminProfileService(
      AdminProfileRepository repository,
      ModerationRepository moderationRepository,
      ServiceGateway gateway) {
    this.repository = repository;
    this.moderationRepository = moderationRepository;
    this.gateway = gateway;
  }

  public AdminProfileResponse getProfile(Jwt actor) {
    UUID adminId = UUID.fromString(actor.getSubject());
    AdminProfileResponse profile = repository.getProfile(adminId);
    String email = resolveEmail(adminId, actor);
    return new AdminProfileResponse(
        profile.adminId(),
        email,
        profile.fullName(),
        profile.phone(),
        profile.avatarUrl(),
        profile.bio(),
        profile.department(),
        profile.updatedAt()
    );
  }

  public AdminProfileResponse updateProfile(UpdateAdminProfileRequest request, Jwt actor) {
    UUID adminId = UUID.fromString(actor.getSubject());
    AdminProfileResponse updated = repository.updateProfile(adminId, request);
    moderationRepository.audit(
        UUID.randomUUID(),
        adminId,
        "UPDATE_ADMIN_PROFILE",
        "USER",
        adminId,
        "Cập nhật hồ sơ quản trị viên: " + updated.fullName(),
        "SUCCEEDED"
    );
    String email = resolveEmail(adminId, actor);
    return new AdminProfileResponse(
        updated.adminId(),
        email,
        updated.fullName(),
        updated.phone(),
        updated.avatarUrl(),
        updated.bio(),
        updated.department(),
        updated.updatedAt()
    );
  }

  private String resolveEmail(UUID adminId, Jwt actor) {
    String claimEmail = actor.getClaimAsString("email");
    if (claimEmail != null && !claimEmail.isBlank()) {
      return claimEmail;
    }
    try {
      var data = gateway.call("AUTH", HttpMethod.GET, "/auth/users/identities?ids=" + adminId, null, actor).path("data");
      if (data.isArray() && !data.isEmpty()) {
        String email = data.get(0).path("email").asText();
        if (email != null && !email.isBlank()) {
          return email;
        }
      }
    } catch (RuntimeException ignored) {
      // Fallback
    }
    return "admin@gmail.com";
  }
}
