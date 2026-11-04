package com.recruitment.admin.dto.moderation;

import jakarta.validation.constraints.*;

public record ResolveReportRequest(
    @NotNull @Pattern(regexp = "RESOLVED|DISMISSED") String status,
    @NotBlank @Size(min = 3, max = 500) String resolution,
    @Min(0) int expectedVersion
  ) {}
