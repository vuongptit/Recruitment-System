package com.recruitment.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.model.AuditEntry;
import com.recruitment.admin.repository.ModerationRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;

class AuditIdentityResolverTest {
  final ServiceGateway gateway = mock(ServiceGateway.class);
  final ObjectMapper mapper = new ObjectMapper();
  final AuditIdentityResolver resolver = new AuditIdentityResolver(gateway);
  final UUID admin = UUID.randomUUID(), target = UUID.randomUUID();
  final Jwt actor = Jwt.withTokenValue("test").header("alg", "RS256").subject(admin.toString()).build();
  AuditEntry entry(String kind) { return new AuditEntry(UUID.randomUUID(), UUID.randomUUID(), admin, "LOCK_USER", kind, target, "Reason", "SUCCEEDED", Instant.now()); }

  @Test
  void resolvesAccountAndActorInOneExactIdBatchAndIgnoresUnrequestedIds() {
    UUID extra = UUID.randomUUID();
    var data = mapper.createArrayNode();
    data.addObject().put("id", target.toString()).put("email", "candidate@example.test").put("role", "CANDIDATE");
    data.addObject().put("id", admin.toString()).put("email", "admin@example.test").put("role", "ADMIN");
    data.addObject().put("id", extra.toString()).put("email", "other@example.test");
    when(gateway.call(eq("AUTH"), eq(HttpMethod.GET), startsWith("/auth/users/identities?ids="), isNull(), eq(actor))).thenReturn(mapper.createObjectNode().set("data", data));
    var result = resolver.resolve(List.of(entry("AUTH"), entry("USER")), actor);
    assertEquals("candidate@example.test", result.get(new AuditIdentityResolver.Key("USER", target)).name());
    assertEquals("CANDIDATE", result.get(new AuditIdentityResolver.Key("USER", target)).role());
    assertEquals("admin@example.test", result.get(new AuditIdentityResolver.Key("USER", admin)).name());
    assertFalse(result.containsKey(new AuditIdentityResolver.Key("USER", extra)));
    verify(gateway, times(1)).call(eq("AUTH"), eq(HttpMethod.GET), argThat(path -> path.contains(admin.toString()) && path.contains(target.toString())), isNull(), eq(actor));
  }

  @Test
  void missingOwnerServiceDoesNotEraseAuditRows() {
    var store = mock(ModerationRepository.class);
    when(store.auditEntries(1, 20)).thenReturn(List.of(entry("AUTH")));
    when(gateway.call(eq("AUTH"), eq(HttpMethod.GET), anyString(), isNull(), eq(actor))).thenThrow(new AdminFailure(503, "UPSTREAM_UNAVAILABLE"));
    var result = new AuditService(gateway, store, resolver).list(actor, 1, 20);
    assertEquals(1, result.data().size());
    assertEquals(target, result.data().getFirst().targetId());
    assertEquals("LOCK_USER", result.data().getFirst().action());
    assertNull(result.data().getFirst().targetLabel());
  }

  @Test
  void authorizationPrecedesAuditAndIdentityReads() {
    var store = mock(ModerationRepository.class);
    var identities = mock(AuditIdentityResolver.class);
    doThrow(new AdminFailure(403, "ACCESS_DENIED")).when(gateway).requireCurrentAdmin(actor);
    assertThrows(AdminFailure.class, () -> new AuditService(gateway, store, identities).list(actor, 1, 20));
    verifyNoInteractions(store, identities);
  }

  @Test
  void publicEntityNamesAreDeduplicatedAndMustMatchTheRequestedId() throws Exception {
    when(gateway.call("JOB", HttpMethod.GET, "/" + target, null, actor)).thenReturn(mapper.readTree("{\"data\":{\"id\":\"" + target + "\",\"title\":\"Backend Developer\"}}"));
    var result = resolver.resolve(List.of(entry("JOB"), entry("JOB")), actor);
    assertEquals("Backend Developer", result.get(new AuditIdentityResolver.Key("JOB", target)).name());
    verify(gateway, times(1)).call("JOB", HttpMethod.GET, "/" + target, null, actor);
    when(gateway.call("COMPANY", HttpMethod.GET, "/" + target, null, actor)).thenReturn(mapper.readTree("{\"data\":{\"id\":\"" + UUID.randomUUID() + "\",\"name\":\"Wrong entity\"}}"));
    assertFalse(resolver.resolve(List.of(entry("COMPANY")), actor).containsKey(new AuditIdentityResolver.Key("COMPANY", target)));
  }
}
