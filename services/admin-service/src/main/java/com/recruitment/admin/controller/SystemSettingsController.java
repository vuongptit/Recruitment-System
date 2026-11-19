package com.recruitment.admin.controller;

import com.recruitment.admin.dto.common.ApiResponse;
import com.recruitment.admin.dto.settings.PublicSettingsResponse;
import com.recruitment.admin.dto.settings.SystemSettingsResponse;
import com.recruitment.admin.dto.settings.UpdateSystemSettingsRequest;
import com.recruitment.admin.service.SystemSettingsService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/settings")
@Validated
public class SystemSettingsController {
  private final SystemSettingsService service;

  public SystemSettingsController(SystemSettingsService service) {
    this.service = service;
  }

  @GetMapping("/public")
  public ResponseEntity<ApiResponse<PublicSettingsResponse>> getPublicSettings() {
    return ResponseEntity.ok(ApiResponse.of(service.getPublicSettings()));
  }

  @GetMapping
  @SecurityRequirement(name = "bearerAuth")
  public ResponseEntity<ApiResponse<SystemSettingsResponse>> getSettings() {
    return ResponseEntity.ok(ApiResponse.of(service.getSettings()));
  }

  @PutMapping
  @SecurityRequirement(name = "bearerAuth")
  public ResponseEntity<ApiResponse<SystemSettingsResponse>> updateSettings(
      @AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody UpdateSystemSettingsRequest request) {
    return ResponseEntity.ok(ApiResponse.of(service.updateSettings(request, jwt)));
  }
}
