package com.recruitment.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.recruitment.admin.exception.AdminFailure;
import com.recruitment.admin.infrastructure.client.ServiceGateway;
import com.recruitment.admin.repository.ModerationRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;

class DashboardSnapshotServiceTest {
  final ServiceGateway gateway = mock(ServiceGateway.class);
  final ModerationRepository reports = mock(ModerationRepository.class);
  final DashboardSnapshotService service = new DashboardSnapshotService(gateway, reports);
  final ObjectMapper mapper = new ObjectMapper();
  final Jwt actor = Jwt.withTokenValue("test").header("alg", "RS256").subject(UUID.randomUUID().toString()).build();

  @Test
  void unauthorizedRequestNeverReadsSources() {
    doThrow(new AdminFailure(403, "ACCESS_DENIED")).when(gateway).requireCurrentAdmin(actor);
    assertThrows(AdminFailure.class, () -> service.snapshot(actor));
    verifyNoInteractions(reports);
    verify(gateway, never()).call(anyString(), any(), anyString(), any(), any());
  }

  @Test
  void readsTotalsNotPageLengthsAndMarksMissingSourcesUnavailable() throws Exception {
    when(gateway.call("AUTH", HttpMethod.GET, "/auth/users?page=1&limit=1", null, actor))
        .thenReturn(mapper.readTree("{\"data\":[{}],\"meta\":{\"total\":1234}}"));
    when(gateway.call("AUTH", HttpMethod.GET, "/auth/users?role=CANDIDATE&page=1&limit=1", null, actor))
        .thenReturn(mapper.readTree("{\"data\":[],\"meta\":{\"total\":0}}"));
    when(gateway.call("COMPANY", HttpMethod.GET, "/?verified_status=VERIFIED&page=1&limit=1", null, actor))
        .thenThrow(new AdminFailure(503, "UPSTREAM_UNAVAILABLE"));
    when(reports.countReports("OPEN")).thenReturn(7L);
    var metrics = service.snapshot(actor).metrics();
    assertEquals(1234L, metrics.get("TOTAL_ACCOUNTS").value());
    assertTrue(metrics.get("CANDIDATES").available());
    assertEquals(0L, metrics.get("CANDIDATES").value());
    assertNull(metrics.get("VERIFIED_COMPANIES").value());
    assertFalse(metrics.get("VERIFIED_COMPANIES").available());
    assertEquals(7L, metrics.get("OPEN_REPORTS").value());
  }

  @Test
  void capAndInvalidCountAreNotPresentedAsExactTotals() throws Exception {
    var pending = mapper.createArrayNode();
    for (int index = 0; index < 50; index++) pending.addObject();
    when(gateway.call("JOB", HttpMethod.GET, "/pending", null, actor)).thenReturn(mapper.createObjectNode().set("data", pending));
    when(gateway.call("JOB", HttpMethod.GET, "/search?limit=1", null, actor))
        .thenReturn(mapper.readTree("{\"data\":{\"total\":-1}}"));
    var metrics = service.snapshot(actor).metrics();
    assertEquals(50L, metrics.get("PENDING_JOBS").value());
    assertTrue(metrics.get("PENDING_JOBS").lowerBound());
    assertFalse(metrics.get("SEARCHABLE_JOBS").available());
  }
}
