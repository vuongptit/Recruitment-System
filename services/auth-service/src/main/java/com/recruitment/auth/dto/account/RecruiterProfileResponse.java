package com.recruitment.auth.dto.account;

import java.util.UUID;

public record RecruiterProfileResponse(
    UUID id,
    String email,
    String fullName,
    String phone,
    String avatarUrl,
    String position,
    String bio
) {}
