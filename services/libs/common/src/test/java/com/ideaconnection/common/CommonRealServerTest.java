package com.ideaconnection.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.ideaconnection.common.test.TestTokens;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 필터 단계 예외는 MockMvc로 재현되지 않아 실제 서버로 확인한다. */
@SpringBootTest(
    classes = CommonTestApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CommonRealServerTest {

  private final HttpClient client = HttpClient.newHttpClient();

  @LocalServerPort private int port;

  private HttpResponse<String> call(String path, String authorization) throws Exception {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
    if (authorization != null) {
      request.header("Authorization", authorization);
    }
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private void assertProblem(HttpResponse<String> response, int status, String code) {
    assertThat(response.statusCode()).isEqualTo(status);
    assertThat(response.headers().firstValue("Content-Type").orElseThrow())
        .startsWith("application/problem+json");
    assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
    JsonNode body = JsonMapper.builder().build().readTree(response.body());
    assertThat(body.get("code").asString()).isEqualTo(code);
    assertThat(response.body()).doesNotContain("/error").doesNotContain("secret-host");
  }

  @Test
  void authServerFailureIs503Problem() throws Exception {
    assertProblem(call("/api/test/me", "Bearer auth-down"), 503, "SERVICE_UNAVAILABLE");
  }

  @Test
  void decoderNotReadyIs503Problem() throws Exception {
    assertProblem(call("/api/test/me", "Bearer decoder-not-ready"), 503, "SERVICE_UNAVAILABLE");
  }

  @Test
  void unexpectedFilterErrorIs500Problem() throws Exception {
    assertProblem(call("/api/test/me", "Bearer filter-boom"), 500, "INTERNAL_SERVER_ERROR");
  }

  @Test
  void firewallRejectionIs400Problem() throws Exception {
    HttpResponse<String> response = call("/api/test/me;x=1", TestTokens.bearer("u1", Map.of()));

    assertProblem(response, 400, "BAD_REQUEST");
  }

  @Test
  void protectedResourceMetadataEndpointIsClosed() throws Exception {
    assertThat(call("/.well-known/oauth-protected-resource", null).statusCode()).isEqualTo(401);
  }

  @Test
  void unauthorizedHeaderDoesNotAdvertiseMetadata() throws Exception {
    String header =
        call("/api/test/me", null).headers().firstValue("WWW-Authenticate").orElseThrow();

    assertThat(header).startsWith("Bearer").doesNotContain("resource_metadata");
  }
}
