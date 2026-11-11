package com.ideaconnection.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = CommonTestApplication.class)
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class CommonWebIntegrationTest {

  private static final MediaType PROBLEM = MediaType.APPLICATION_PROBLEM_JSON;

  @Autowired private MockMvc mvc;

  private String token() {
    return TestTokens.bearer("u1", Map.of());
  }

  @Test
  void missingTokenIs401Problem() throws Exception {
    mvc.perform(get("/api/test/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(header().exists(HttpHeaders.WWW_AUTHENTICATE))
        .andExpect(jsonPath("$.type").value("about:blank"))
        .andExpect(jsonPath("$.title").value("Unauthorized"))
        .andExpect(jsonPath("$.status").value(401))
        .andExpect(jsonPath("$.detail").value("로그인이 필요합니다."))
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void wrongSignatureIs401Problem() throws Exception {
    mvc.perform(
            get("/api/test/me").header(HttpHeaders.AUTHORIZATION, TestTokens.wrongKeyBearer("u1")))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void expiredTokenIs401Problem() throws Exception {
    mvc.perform(
            get("/api/test/me").header(HttpHeaders.AUTHORIZATION, TestTokens.expiredBearer("u1")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void htmlAcceptStillGetsProblemJson() throws Exception {
    mvc.perform(get("/api/test/me").accept(MediaType.TEXT_HTML))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void unknownPathWithoutTokenIs401() throws Exception {
    mvc.perform(get("/api/nope")).andExpect(status().isUnauthorized());
  }

  @Test
  void unknownPathWithTokenIs404Problem() throws Exception {
    mvc.perform(get("/api/nope").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isNotFound())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void accessDeniedIs403Problem() throws Exception {
    mvc.perform(get("/api/test/forbidden").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isForbidden())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.detail").value("권한이 없습니다."))
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void apiExceptionKeepsCodeAndDetail() throws Exception {
    mvc.perform(get("/api/test/conflict").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isConflict())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.code").value("SAMPLE_CONFLICT"))
        .andExpect(jsonPath("$.detail").value("충돌"));
  }

  @Test
  void unexpectedErrorHidesInternals() throws Exception {
    mvc.perform(get("/api/test/boom").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isInternalServerError())
        .andExpect(content().contentTypeCompatibleWith(PROBLEM))
        .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
        .andExpect(jsonPath("$.detail").value("서버 오류가 발생했습니다."))
        .andExpect(content().string(not(containsString("secret-host"))))
        .andExpect(content().string(not(containsString("trace"))));
  }

  @Test
  void missingPathVariableHidesInternalsAndIsLogged(CapturedOutput output) throws Exception {
    mvc.perform(get("/api/test/missing-path").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.detail").value("서버 오류가 발생했습니다."))
        .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"));

    assertThat(output).contains("처리하지 못한 오류");
  }

  @Test
  void unwritableResponseIsLogged(CapturedOutput output) throws Exception {
    mvc.perform(get("/api/test/unwritable").header(HttpHeaders.AUTHORIZATION, token()))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.detail").value("서버 오류가 발생했습니다."));

    assertThat(output).contains("처리하지 못한 오류");
  }

  @Test
  void currentUserReadsClaims() throws Exception {
    String bearer = TestTokens.bearer("u1", Map.of("email", "a@x.com", "name", "김"));

    mvc.perform(get("/api/test/me").header(HttpHeaders.AUTHORIZATION, bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("u1"))
        .andExpect(jsonPath("$.email").value("a@x.com"))
        .andExpect(jsonPath("$.name").value("김"));
  }

  @Test
  void currentUserTreatsBlankAsNull() throws Exception {
    String bearer = TestTokens.bearer("u1", Map.of("email", "  "));

    mvc.perform(get("/api/test/me").header(HttpHeaders.AUTHORIZATION, bearer))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value(nullValue()))
        .andExpect(jsonPath("$.name").value(nullValue()));
  }
}
