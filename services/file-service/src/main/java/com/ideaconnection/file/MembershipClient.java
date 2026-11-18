package com.ideaconnection.file;

import com.ideaconnection.common.error.ApiException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
class MembershipClient {
  private final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(1))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();
  private final String baseUrl;
  private final ObjectMapper mapper;

  MembershipClient(@Value("${file.user-service-url}") String baseUrl, ObjectMapper mapper) {
    this.baseUrl = baseUrl;
    this.mapper = mapper;
  }

  String requireMember(Long orgId, String userId, String authorization, String requestId) {
    try {
      var builder =
          HttpRequest.newBuilder(
                  URI.create(
                      baseUrl
                          + "/internal/users/orgs/"
                          + orgId
                          + "/members/"
                          + java.net.URLEncoder.encode(
                              userId, java.nio.charset.StandardCharsets.UTF_8)))
              .timeout(Duration.ofSeconds(1))
              .header("Authorization", authorization)
              .GET();
      if (requestId != null) builder.header("X-Request-Id", requestId);
      var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 401)
        throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다.");
      if (response.statusCode() != 200) throw unavailable();
      var data = mapper.readTree(response.body());
      if (!data.path("member").isBoolean()) throw unavailable();
      if (!data.path("member").asBoolean())
        throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "이 조직의 멤버가 아닙니다.");
      String role = data.path("role").asText();
      if (!"OWNER".equals(role) && !"MEMBER".equals(role)) throw unavailable();
      return role;
    } catch (ApiException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw unavailable();
    } catch (Exception e) {
      throw unavailable();
    }
  }

  private ApiException unavailable() {
    return new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "MEMBERSHIP_UNAVAILABLE", "조직 소속을 확인할 수 없습니다.");
  }
}
