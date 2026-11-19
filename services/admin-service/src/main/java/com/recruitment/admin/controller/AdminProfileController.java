package com.recruitment.admin.controller;

import com.recruitment.admin.dto.common.ApiResponse;
import com.recruitment.admin.dto.profile.AdminProfileResponse;
import com.recruitment.admin.dto.profile.UpdateAdminProfileRequest;
import com.recruitment.admin.service.AdminProfileService;
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
@RequestMapping("/profile")
@Validated
@SecurityRequirement(name = "bearerAuth")
public class AdminProfileController {
  private final AdminProfileService service;

  public AdminProfileController(AdminProfileService service) {
    this.service = service;
  }

  @GetMapping
  public ResponseEntity<ApiResponse<AdminProfileResponse>> getProfile(@AuthenticationPrincipal Jwt jwt) {
    return ResponseEntity.ok(ApiResponse.of(service.getProfile(jwt)));
  }

  @PutMapping
  public ResponseEntity<ApiResponse<AdminProfileResponse>> updateProfile(
      @AuthenticationPrincipal Jwt jwt,
      @Valid @RequestBody UpdateAdminProfileRequest request) {
    return ResponseEntity.ok(ApiResponse.of(service.updateProfile(request, jwt)));
  }
}
