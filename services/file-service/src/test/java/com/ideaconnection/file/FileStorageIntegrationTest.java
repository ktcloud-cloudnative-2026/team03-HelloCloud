package com.ideaconnection.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.test.TestTokens;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
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
import tools.jackson.databind.ObjectMapper;

/** Explicit opt-in: migrates the configured test DB and creates/deletes only its own objects. */
@SpringBootTest
@AutoConfigureMockMvc(print = org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
@Import(FileStorageIntegrationTest.Security.class)
@EnabledIfEnvironmentVariable(named = "FILE_LIVE_TESTS", matches = "true")
class FileStorageIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired FileRepository files;
  @Autowired ObjectStorage storage;
  @Autowired ObjectMapper mapper;
  @MockitoBean MembershipClient memberships;
  final List<Long> ownedIds = new ArrayList<>();
  final String bearer = TestTokens.bearer("file-live-test", Map.of());
  final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  @BeforeEach
  void setup() {
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenReturn("MEMBER");
  }

  @AfterEach
  void cleanOnlyOwnedObjects() {
    for (Long id : ownedIds) {
      files
          .findById(id)
          .ifPresent(
              file -> {
                storage.delete(file.storageKey);
                files.delete(file);
              });
    }
  }

  @Test
  void realMysqlAndSeaweedfsLifecycle() throws Exception {
    byte[] bytes =
        "%PDF-1.4\nHelloCloud SeaweedFS integration verification\n"
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    var body =
        Map.of(
            "orgId",
            "900000001",
            "name",
            "integration-test.pdf",
            "contentType",
            "application/pdf",
            "sizeBytes",
            bytes.length);
    var pendingResult =
        mvc.perform(
                post("/api/files")
                    .header("Authorization", bearer)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andReturn();
    var pending = mapper.readTree(pendingResult.getResponse().getContentAsString());
    Long id = Long.valueOf(pending.path("id").asText());
    ownedIds.add(id);
    FileRecord row = files.findById(id).orElseThrow();
    assertThat(row.status).isEqualTo("UPLOADING");
    mvc.perform(get("/api/files").param("orgId", "900000001").header("Authorization", bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(get("/api/files/" + id + "/download-url").header("Authorization", bearer))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("FILE_NOT_READY"));
    var put =
        http.send(
            HttpRequest.newBuilder(URI.create(pending.path("uploadUrl").asText()))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/pdf")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(bytes))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertThat(put.statusCode()).as("presigned PUT status").isBetween(200, 299);
    mvc.perform(post("/api/files/" + id + "/complete").header("Authorization", bearer))
        .andExpect(status().isOk());
    assertThat(files.findById(id).orElseThrow().status).isEqualTo("COMPLETED");
    mvc.perform(get("/api/files").param("orgId", "900000001").header("Authorization", bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.items[0].id").value(id.toString()));
    for (String suffix : List.of("download-url", "preview-url")) {
      var result =
          mvc.perform(get("/api/files/" + id + "/" + suffix).header("Authorization", bearer))
              .andExpect(status().isOk())
              .andReturn();
      URI url =
          URI.create(
              mapper.readTree(result.getResponse().getContentAsString()).path("url").asText());
      var response =
          http.send(
              HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(15)).GET().build(),
              HttpResponse.BodyHandlers.ofByteArray());
      assertThat(response.statusCode()).as("presigned " + suffix).isEqualTo(200);
      assertThat(response.body()).isEqualTo(bytes);
      URI anonymous = new URI(url.getScheme(), url.getAuthority(), url.getPath(), null, null);
      var rejected =
          http.send(
              HttpRequest.newBuilder(anonymous).GET().build(),
              HttpResponse.BodyHandlers.discarding());
      assertThat(rejected.statusCode()).isIn(401, 403);
    }
    when(memberships.requireMember(anyLong(), anyString(), anyString(), any()))
        .thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "not member"));
    mvc.perform(get("/api/files/" + id + "/download-url").header("Authorization", bearer))
        .andExpect(status().isForbidden());
    org.mockito.Mockito.doReturn("MEMBER")
        .when(memberships)
        .requireMember(anyLong(), anyString(), anyString(), any());
    mvc.perform(delete("/api/files/" + id).header("Authorization", bearer))
        .andExpect(status().isNoContent());
    assertThat(files.existsById(id)).isFalse();
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> storage.size(row.storageKey))
        .isInstanceOfSatisfying(
            ApiException.class, e -> assertThat(e.getCode()).isEqualTo("UPLOAD_NOT_FOUND"));
  }

  @TestConfiguration
  static class Security {
    @Bean
    JwtDecoder jwtDecoder() {
      return TestTokens.jwtDecoder();
    }
  }
}
