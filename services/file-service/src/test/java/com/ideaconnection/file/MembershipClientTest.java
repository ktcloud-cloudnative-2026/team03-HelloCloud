package com.ideaconnection.file;

import static org.assertj.core.api.Assertions.*;

import com.ideaconnection.common.error.ApiException;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class MembershipClientTest {
  HttpServer server;
  MembershipClient client;
  int status = 200;
  String body = "{\"member\":true,\"role\":\"OWNER\"}";
  AtomicReference<String> token = new AtomicReference<>();
  AtomicReference<String> requestId = new AtomicReference<>();

  @BeforeEach
  void setup() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/internal/users/orgs/1/members/u1",
        exchange -> {
          token.set(exchange.getRequestHeaders().getFirst("Authorization"));
          requestId.set(exchange.getRequestHeaders().getFirst("X-Request-Id"));
          byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(status, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    server.start();
    client =
        new MembershipClient(
            "http://127.0.0.1:" + server.getAddress().getPort(), new ObjectMapper());
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void forwardsTokenAndTrace() {
    assertThat(client.requireMember(1L, "u1", "Bearer token", "trace")).isEqualTo("OWNER");
    assertThat(token.get()).isEqualTo("Bearer token");
    assertThat(requestId.get()).isEqualTo("trace");
  }

  @Test
  void removedMemberIsRejectedOnNextRequest() {
    client.requireMember(1L, "u1", "Bearer token", null);
    body = "{\"member\":false}";
    assertCode("FORBIDDEN");
  }

  @Test
  void expiredTokenStaysUnauthorized() {
    status = 401;
    assertCode("UNAUTHORIZED");
  }

  @Test
  void failureIsNotTreatedAsNonMembership() {
    status = 500;
    assertCode("MEMBERSHIP_UNAVAILABLE");
  }

  @Test
  void malformedReplyFailsClosed() {
    body = "{}";
    assertCode("MEMBERSHIP_UNAVAILABLE");
  }

  private void assertCode(String code) {
    assertThatThrownBy(() -> client.requireMember(1L, "u1", "Bearer token", null))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
  }
}
