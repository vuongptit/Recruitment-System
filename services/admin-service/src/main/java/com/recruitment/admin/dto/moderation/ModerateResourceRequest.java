package com.recruitment.admin.dto.moderation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ModerateResourceRequest(
    @NotNull Boolean suspended,
    @Min(0) @Max(Integer.MAX_VALUE) int expectedVersion,
    @NotNull UUID operationId,
    @NotBlank @Size(min = 3, max = 500) String reason) {}
