package com.recruitment.auth.dto.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateRecruiterProfileRequest(
    @NotBlank(message = "Họ và tên không được để trống")
    @Size(min = 2, max = 160, message = "Họ và tên từ 2 đến 160 ký tự")
    String fullName,

    @NotBlank(message = "Số điện thoại không được để trống")
    @Pattern(regexp = "^[0-9+(). -]{6,32}$", message = "Số điện thoại không hợp lệ")
    @Pattern(regexp = "^(?:\\D*\\d){6,15}\\D*$", message = "Số điện thoại phải chứa 6-15 chữ số")
    String phone,

    String avatarUrl,

    @Size(max = 160, message = "Chức vụ tối đa 160 ký tự")
    String position,

    @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
    String bio
) {}
