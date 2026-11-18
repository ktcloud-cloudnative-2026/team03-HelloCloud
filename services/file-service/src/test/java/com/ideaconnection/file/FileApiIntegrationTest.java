package com.ideaconnection.file;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.test.TestTokens;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:filetest;MODE=MySQL;DB_CLOSE_DELAY=-1",
      "spring.datasource.username=sa",
      "spring.datasource.password=",
      "spring.flyway.enabled=false",
      "spring.jpa.hibernate.ddl-auto=create-drop",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=http://issuer.invalid",
      "file.s3.endpoint=http://127.0.0.1:8333",
      "file.s3.public-endpoint=http://127.0.0.1:8333",
      "file.s3.access-key=test",
      "file.s3.secret-key=test"
    })
@AutoConfigureMockMvc
@Import(FileApiIntegrationTest.Security.class)
class FileApiIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired FileRepository files;
  @MockitoBean MembershipClient memberships;
  @MockitoBean ObjectStorage storage;
  String bearer = TestTokens.bearer("u1", Map.of());

  @BeforeEach
  void setup() {
    files.deleteAll();
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenReturn("MEMBER");
    when(storage.uploadUrl(any())).thenReturn("https://s3.test/upload");
    when(storage.readUrl(any(), anyBoolean())).thenReturn("https://s3.test/read");
  }

  @Test
  void listIncludesOnlyCompletedInRequestedOrganization() throws Exception {
    var completed = record(1L, true);
    record(1L, false);
    record(2L, true);
    mvc.perform(get("/api/files").param("orgId", "1").header("Authorization", bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].id").value(completed.id.toString()))
        .andExpect(jsonPath("$.items[0].storageKey").doesNotExist());
  }

  @Test
  void unauthorizedAndExpiredTokensAreRejected() throws Exception {
    mvc.perform(get("/api/files").param("orgId", "1")).andExpect(status().isUnauthorized());
    mvc.perform(
            get("/api/files")
                .param("orgId", "1")
                .header("Authorization", TestTokens.expiredBearer("u1")))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(memberships, storage);
  }

  @Test
  void paginationValidationIs400() throws Exception {
    mvc.perform(
            get("/api/files")
                .param("orgId", "1")
                .param("size", "101")
                .header("Authorization", bearer))
        .andExpect(status().isBadRequest());
  }

  @Test
  void uploadAndCompletePersistState() throws Exception {
    mvc.perform(
            post("/api/files")
                .header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"orgId\":\"1\",\"name\":\"test.pdf\",\"contentType\":\"application/pdf\",\"sizeBytes\":42}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.uploadUrl").value("https://s3.test/upload"));
    var pending = files.findAll().get(0);
    assertThat(pending.status).isEqualTo("UPLOADING");
    when(storage.size(pending.storageKey)).thenReturn(42L);
    mvc.perform(post("/api/files/" + pending.id + "/complete").header("Authorization", bearer))
        .andExpect(status().isOk());
    assertThat(files.findById(pending.id).orElseThrow().status).isEqualTo("COMPLETED");
  }

  @Test
  void wrongSizeRollsBack() throws Exception {
    var pending = record(1L, false);
    when(storage.size(pending.storageKey)).thenReturn(2L);
    mvc.perform(post("/api/files/" + pending.id + "/complete").header("Authorization", bearer))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("UPLOAD_SIZE_MISMATCH"));
    assertThat(files.findById(pending.id).orElseThrow().status).isEqualTo("UPLOADING");
  }

  @Test
  void crossOrganizationRequestsAreDenied() throws Exception {
    var other = record(2L, true);
    when(memberships.requireMember(eq(2L), anyString(), anyString(), any()))
        .thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "not member"));
    for (String suffix : java.util.List.of("/download-url", "/preview-url")) {
      mvc.perform(get("/api/files/" + other.id + suffix).header("Authorization", bearer))
          .andExpect(status().isForbidden());
    }
    mvc.perform(delete("/api/files/" + other.id).header("Authorization", bearer))
        .andExpect(status().isForbidden());
    verifyNoInteractions(storage);
    assertThat(files.existsById(other.id)).isTrue();
  }

  @Test
  void pdfUrlsAndDeleteWork() throws Exception {
    var file = record(1L, true);
    for (String suffix : java.util.List.of("/download-url", "/preview-url")) {
      mvc.perform(get("/api/files/" + file.id + suffix).header("Authorization", bearer))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.url").value("https://s3.test/read"));
    }
    mvc.perform(delete("/api/files/" + file.id).header("Authorization", bearer))
        .andExpect(status().isNoContent());
    assertThat(files.existsById(file.id)).isFalse();
    verify(storage).delete(file.storageKey);
  }

  @Test
  void missingFileIs404() throws Exception {
    mvc.perform(get("/api/files/999/download-url").header("Authorization", bearer))
        .andExpect(status().isNotFound());
  }

  @Test
  void userOutageIs503() throws Exception {
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenThrow(
            new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE, "MEMBERSHIP_UNAVAILABLE", "unavailable"));
    mvc.perform(get("/api/files").param("orgId", "1").header("Authorization", bearer))
        .andExpect(status().isServiceUnavailable());
  }

  FileRecord record(Long orgId, boolean completed) {
    var f =
        new FileRecord(
            orgId,
            "test.pdf",
            "application/pdf",
            42,
            "orgs/" + orgId + "/" + java.util.UUID.randomUUID(),
            "u1");
    if (completed) {
      f.status = "COMPLETED";
      f.completedAt = Instant.now();
    }
    return files.saveAndFlush(f);
  }

  @TestConfiguration
  static class Security {
    @Bean
    JwtDecoder jwtDecoder() {
      return TestTokens.jwtDecoder();
    }
  }
}
