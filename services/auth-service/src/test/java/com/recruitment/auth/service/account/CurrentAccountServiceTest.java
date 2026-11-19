package com.recruitment.auth.service.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.recruitment.auth.dto.account.RecruiterContactRequest;
import com.recruitment.auth.exception.AuthBusinessException;
import com.recruitment.auth.model.AuthUser;
import com.recruitment.auth.model.UserRole;
import com.recruitment.auth.repository.jpa.AuthUserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CurrentAccountServiceTest {
  private final AuthUserRepository users = mock(AuthUserRepository.class);
  private final CurrentAccountService service = new CurrentAccountService(users);

  @Test
  void recruiterContactIsNormalizedAndSavedWithoutExposingOtherIdentityData() {
    AuthUser user = active(UserRole.RECRUITER);
    var response = service.updateRecruiterContact(user.getId(), new RecruiterContactRequest("  Nguyễn An  ", "0901234567"));
    assertThat(response.fullName()).isEqualTo("Nguyễn An");
    assertThat(service.getRecruiterContact(user.getId()).phone()).isEqualTo("0901234567");
    assertThat(response.toString()).doesNotContain("Nguyễn An", "0901234567");
    verify(users).saveAndFlush(user);
  }

  @Test
  void rejectsCandidateAndLockedRecruiterBeforeWriting() {
    AuthUser candidate = active(UserRole.CANDIDATE);
    assertThatThrownBy(() -> service.updateRecruiterContact(candidate.getId(), new RecruiterContactRequest("Candidate", "0901234567")))
        .isInstanceOf(AuthBusinessException.class).hasMessageContaining("Recruiter access");
    AuthUser recruiter = active(UserRole.RECRUITER);
    recruiter.lock("Test lock", Instant.now());
    assertThatThrownBy(() -> service.getRecruiterContact(recruiter.getId()))
        .isInstanceOf(AuthBusinessException.class).hasMessageContaining("locked");
    verify(users, never()).saveAndFlush(any());
  }

  @Test
  void serviceAlsoRejectsMalformedContactWithoutRelyingOnControllerValidation() {
    AuthUser user = active(UserRole.RECRUITER);
    assertThatThrownBy(() -> service.updateRecruiterContact(user.getId(), new RecruiterContactRequest("Recruiter", "++++++")))
        .isInstanceOf(AuthBusinessException.class);
    verify(users, never()).saveAndFlush(any());
  }

  @Test
  void updatesPasswordWhenCurrentPasswordMatchesAndNewPasswordIsValid() {
    org.springframework.security.crypto.password.PasswordEncoder encoder =
        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(10);
    com.recruitment.auth.security.password.RegistrationPasswordPolicy policy =
        new com.recruitment.auth.security.password.RegistrationPasswordPolicy();
    CurrentAccountService svc = new CurrentAccountService(users, encoder, policy);

    AuthUser admin = AuthUser.registerOAuth("admin@example.com", UserRole.CANDIDATE, Instant.now());
    admin.changePasswordHash(encoder.encode("CurrentPass123"));
    when(users.findById(admin.getId())).thenReturn(Optional.of(admin));

    svc.updatePassword(admin.getId(), "CurrentPass123", "NewSecretPass456");
    verify(users).saveAndFlush(admin);
    assertThat(encoder.matches("NewSecretPass456", admin.getPasswordHash())).isTrue();
  }

  @Test
  void rejectsPasswordChangeWhenCurrentPasswordIsWrong() {
    org.springframework.security.crypto.password.PasswordEncoder encoder =
        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(10);
    com.recruitment.auth.security.password.RegistrationPasswordPolicy policy =
        new com.recruitment.auth.security.password.RegistrationPasswordPolicy();
    CurrentAccountService svc = new CurrentAccountService(users, encoder, policy);

    AuthUser admin = AuthUser.registerOAuth("admin@example.com", UserRole.CANDIDATE, Instant.now());
    admin.changePasswordHash(encoder.encode("CurrentPass123"));
    when(users.findById(admin.getId())).thenReturn(Optional.of(admin));

    assertThatThrownBy(() -> svc.updatePassword(admin.getId(), "WrongPass123", "NewSecretPass456"))
        .isInstanceOf(AuthBusinessException.class)
        .hasMessageContaining("không chính xác");
    verify(users, never()).saveAndFlush(any());
  }

  @Test
  void recruiterProfileCanBeRetrievedAndUpdated() {
    AuthUser recruiter = active(UserRole.RECRUITER);
    var updated = service.updateRecruiterProfile(
        recruiter.getId(),
        new com.recruitment.auth.dto.account.UpdateRecruiterProfileRequest(
            "Lê Tuyển Dụng", "0987654321", "https://example.com/avatar.png", "HR Manager", "Phụ trách Tech"
        )
    );
    assertThat(updated.fullName()).isEqualTo("Lê Tuyển Dụng");
    assertThat(updated.phone()).isEqualTo("0987654321");
    assertThat(updated.avatarUrl()).isEqualTo("https://example.com/avatar.png");
    assertThat(updated.position()).isEqualTo("HR Manager");
    assertThat(updated.bio()).isEqualTo("Phụ trách Tech");
    verify(users).saveAndFlush(recruiter);
  }

  private AuthUser active(UserRole role) {
    AuthUser user = AuthUser.registerOAuth("contact@example.com", role, Instant.now());
    when(users.findById(user.getId())).thenReturn(Optional.of(user));
    return user;
  }
}
