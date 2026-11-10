package com.ideaconnection.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

  private final RequestIdFilter filter = new RequestIdFilter();
  private final MockHttpServletResponse response = new MockHttpServletResponse();
  private final AtomicReference<String> seenInMdc = new AtomicReference<>();
  private final FilterChain chain = (req, res) -> seenInMdc.set(MDC.get("request_id"));

  private String run(String headerValue) throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest();
    if (headerValue != null) {
      request.addHeader("X-Request-Id", headerValue);
    }
    filter.doFilter(request, response, chain);
    return response.getHeader("X-Request-Id");
  }

  @Test
  void keepsValidRequestId() throws Exception {
    assertThat(run("abc-123_X.9")).isEqualTo("abc-123_X.9");
    assertThat(seenInMdc.get()).isEqualTo("abc-123_X.9");
  }

  @Test
  void generatesIdWhenMissing() throws Exception {
    String id = run(null);

    assertThat(UUID.fromString(id)).isNotNull();
    assertThat(seenInMdc.get()).isEqualTo(id);
  }

  @Test
  void replacesRequestIdWithLineBreak() throws Exception {
    String id = run("abc\n{\"level\":\"fake\"}");

    assertThat(UUID.fromString(id)).isNotNull();
  }

  @Test
  void replacesTooLongRequestId() throws Exception {
    String id = run("a".repeat(129));

    assertThat(UUID.fromString(id)).isNotNull();
  }

  @Test
  void clearsMdcAfterRequest() throws Exception {
    run("abc");

    assertThat(MDC.get("request_id")).isNull();
  }
}
