package com.recruitment.admin.dto.settings;

import java.time.Instant;
import java.util.UUID;

public record SystemSettingsResponse(
    String siteName,
    String siteSlogan,
    String siteLogo,
    String siteFavicon,
    String contactEmail,
    String contactPhone,
    String footerText,
    boolean allowUserRegistration,
    boolean maintenanceMode,
    Instant updatedAt,
    UUID updatedBy
) {}
