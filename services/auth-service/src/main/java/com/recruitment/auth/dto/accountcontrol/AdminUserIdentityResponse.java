package com.recruitment.auth.dto.accountcontrol;

import com.recruitment.auth.model.UserRole;
import java.util.UUID;

/** Minimal administrator-only identity projection; never exposes credentials or sessions. */
public record AdminUserIdentityResponse(UUID id, String email, UserRole role) {}
