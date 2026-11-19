package com.recruitment.admin.dto.settings;

public record PublicSettingsResponse(
    String siteName,
    String siteSlogan,
    String siteLogo,
    String siteFavicon,
    String contactEmail,
    String contactPhone,
    String footerText
) {}
