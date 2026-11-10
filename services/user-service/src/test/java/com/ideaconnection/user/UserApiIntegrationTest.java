package com.ideaconnection.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.user.UserProfileRepository;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMetrics
class UserApiIntegrationTest extends AbstractIntegrationTest {

  private static final String ME = "/api/users/me";

  @Autowired private MockMvc mvc;
  @Autowired private UserProfileRepository repository;

  private final String bearer =
      TestTokens.bearer("3f2c8e1a", Map.of("email", "a@example.com", "name", "김민준"));

  @BeforeEach
  void clean() {
    repository.deleteAll();
  }

  @Test
  void firstLoginCreatesAndReturnsProfile() throws Exception {
    mvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("3f2c8e1a"))
        .andExpect(jsonPath("$.email").value("a@example.com"))
        .andExpect(jsonPath("$.displayName").value("김민준"))
        .andExpect(jsonPath("$.createdAt").doesNotExist());

    assertThat(repository.count()).isEqualTo(1);
  }

  @Test
  void repeatedLoginReturnsSameProfile() throws Exception {
    mvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isOk());
    mvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("3f2c8e1a"));

    assertThat(repository.count()).isEqualTo(1);
  }

  @Test
  void missingTokenIs401Problem() throws Exception {
    mvc.perform(get(ME))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

    assertThat(repository.count()).isZero();
  }

  @Test
  void healthProbesAreOpen() throws Exception {
    mvc.perform(get("/health/liveness")).andExpect(status().isOk());
    mvc.perform(get("/health/readiness")).andExpect(status().isOk());
  }

  @Test
  void metricsAreOpen() throws Exception {
    mvc.perform(get("/metrics"))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("jvm_memory_used_bytes")));
  }

  @Test
  void otherActuatorEndpointsAreClosed() throws Exception {
    mvc.perform(get("/env")).andExpect(status().isUnauthorized());
  }

  @Test
  void echoesRequestId() throws Exception {
    mvc.perform(get(ME).header(HttpHeaders.AUTHORIZATION, bearer).header("X-Request-Id", "r-1"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "r-1"));
  }
}
