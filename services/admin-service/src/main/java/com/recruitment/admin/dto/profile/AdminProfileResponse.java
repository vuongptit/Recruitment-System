package com.recruitment.admin.dto.profile;

import java.time.Instant;
import java.util.UUID;

public record AdminProfileResponse(
    UUID adminId,
    String email,
    String fullName,
    String phone,
    String avatarUrl,
    String bio,
    String department,
    Instant updatedAt
) {}
