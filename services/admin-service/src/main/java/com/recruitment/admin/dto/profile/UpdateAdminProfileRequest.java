package com.recruitment.admin.dto.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateAdminProfileRequest(
    @NotBlank(message = "Họ và tên không được để trống")
    @Size(min = 2, max = 150, message = "Họ và tên từ 2 đến 150 ký tự")
    String fullName,

    @Size(max = 50, message = "Số điện thoại tối đa 50 ký tự")
    String phone,

    String avatarUrl,

    @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
    String bio,

    @Size(max = 100, message = "Phòng ban tối đa 100 ký tự")
    String department
) {}
