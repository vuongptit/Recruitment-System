package com.recruitment.auth.service.account;

import com.recruitment.auth.dto.account.CurrentAccountResponse;
import com.recruitment.auth.dto.account.RecruiterContactRequest;
import com.recruitment.auth.dto.account.RecruiterContactResponse;
import com.recruitment.auth.exception.AuthBusinessException;
import com.recruitment.auth.model.AuthUser;
import com.recruitment.auth.model.UserRole;
import com.recruitment.auth.repository.jpa.AuthUserRepository;
import com.recruitment.auth.security.password.RegistrationPasswordPolicy;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CurrentAccountService {
  private final AuthUserRepository users;
  private final PasswordEncoder passwordEncoder;
  private final RegistrationPasswordPolicy passwordPolicy;

  @Autowired
  public CurrentAccountService(
      AuthUserRepository users,
      PasswordEncoder passwordEncoder,
      RegistrationPasswordPolicy passwordPolicy) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
    this.passwordPolicy = passwordPolicy;
  }

  public CurrentAccountService(AuthUserRepository users) {
    this(users, null, null);
  }

  @Transactional(readOnly = true)
  public CurrentAccountResponse get(UUID userId) {
    AuthUser user = requireActiveUser(userId);
    return new CurrentAccountResponse(user.getId(), user.getEmail(), user.getRole(), true);
  }

  @Transactional(readOnly = true)
  public RecruiterContactResponse getRecruiterContact(UUID userId) {
    AuthUser user = requireRecruiter(userId);
    return new RecruiterContactResponse(user.getRecruiterFullName(), user.getRecruiterPhone());
  }

  @Transactional
  public RecruiterContactResponse updateRecruiterContact(UUID userId, RecruiterContactRequest request) {
    AuthUser user = requireRecruiter(userId);
    try {
      user.updateRecruiterContact(request.fullName(), request.phone());
    } catch (IllegalArgumentException exception) {
      throw new AuthBusinessException("VALIDATION_ERROR", "Recruiter contact is invalid", HttpStatus.BAD_REQUEST);
    }
    users.saveAndFlush(user);
    return new RecruiterContactResponse(user.getRecruiterFullName(), user.getRecruiterPhone());
  }

  @Transactional
  public void updatePassword(UUID userId, String currentPassword, String newPassword) {
    if (passwordEncoder == null || passwordPolicy == null) {
      throw new IllegalStateException("Password encoder or policy not configured");
    }
    AuthUser user = requireActiveUser(userId);
    if (user.getPasswordHash() != null && !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
      throw new AuthBusinessException("INVALID_CREDENTIALS", "Mật khẩu hiện tại không chính xác", HttpStatus.BAD_REQUEST);
    }
    passwordPolicy.validate(newPassword);
    user.changePasswordHash(passwordEncoder.encode(newPassword));
    users.saveAndFlush(user);
  }

  private AuthUser requireRecruiter(UUID userId) {
    AuthUser user = requireActiveUser(userId);
    if (user.getRole() != UserRole.RECRUITER) {
      throw new AuthBusinessException("ACCESS_DENIED", "Recruiter access is required", HttpStatus.FORBIDDEN);
    }
    return user;
  }

  private AuthUser requireActiveUser(UUID userId) {
    AuthUser user = users.findById(userId).orElseThrow(this::invalidAccessToken);
    if (!user.isVerified()) {
      throw new AuthBusinessException(
          "ACCOUNT_NOT_VERIFIED",
          "Account verification is required",
          HttpStatus.FORBIDDEN);
    }
    if (user.isLocked()) {
      throw new AuthBusinessException(
          "ACCOUNT_LOCKED",
          "Account is locked",
          HttpStatus.FORBIDDEN);
    }
    return user;
  }

  private AuthBusinessException invalidAccessToken() {
    return new AuthBusinessException(
        "ACCESS_TOKEN_INVALID",
        "Access token is no longer valid",
        HttpStatus.UNAUTHORIZED);
  }
}
