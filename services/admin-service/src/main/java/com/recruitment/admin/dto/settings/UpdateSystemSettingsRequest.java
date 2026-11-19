package com.recruitment.admin.dto.settings;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateSystemSettingsRequest(
    @NotBlank(message = "Tên trang web không được để trống")
    @Size(max = 100, message = "Tên trang web tối đa 100 ký tự")
    String siteName,

    @Size(max = 255, message = "Khẩu hiệu tối đa 255 ký tự")
    String siteSlogan,

    String siteLogo,
    String siteFavicon,

    @Size(max = 255, message = "Email liên hệ tối đa 255 ký tự")
    String contactEmail,

    @Size(max = 50, message = "Hotline tối đa 50 ký tự")
    String contactPhone,

    @Size(max = 255, message = "Chân trang tối đa 255 ký tự")
    String footerText,

    Boolean allowUserRegistration,
    Boolean maintenanceMode
) {}
