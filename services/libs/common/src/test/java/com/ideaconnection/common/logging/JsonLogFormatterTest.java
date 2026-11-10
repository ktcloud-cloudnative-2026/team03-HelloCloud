package com.ideaconnection.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxy;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class JsonLogFormatterTest {

  private final JsonLogFormatter formatter =
      new JsonLogFormatter(
          new MockEnvironment().withProperty("spring.application.name", "user-service"));

  private ILoggingEvent event(Map<String, String> mdc) {
    ILoggingEvent event = mock(ILoggingEvent.class);
    when(event.getInstant()).thenReturn(Instant.parse("2026-11-04T00:00:00Z"));
    when(event.getLevel()).thenReturn(Level.INFO);
    when(event.getFormattedMessage()).thenReturn("hello");
    when(event.getMDCPropertyMap()).thenReturn(mdc);
    return event;
  }

  private JsonNode parse(String line) {
    return JsonMapper.builder().build().readTree(line);
  }

  @Test
  void writesTeamLogFields() {
    JsonNode log = parse(formatter.format(event(Map.of("request_id", "r1"))));

    assertThat(log.get("time").asString()).isEqualTo("2026-11-04T09:00:00+09:00");
    assertThat(log.get("level").asString()).isEqualTo("info");
    assertThat(log.get("service").asString()).isEqualTo("user-service");
    assertThat(log.get("request_id").asString()).isEqualTo("r1");
    assertThat(log.get("message").asString()).isEqualTo("hello");
  }

  @Test
  void omitsRequestIdOutsideRequest() {
    JsonNode log = parse(formatter.format(event(Map.of())));

    assertThat(log.has("request_id")).isFalse();
  }

  @Test
  void includesStackTraceForErrors() {
    ILoggingEvent event = event(Map.of());
    when(event.getThrowableProxy()).thenReturn(new ThrowableProxy(new IllegalStateException("x")));

    JsonNode log = parse(formatter.format(event));

    assertThat(log.get("stack_trace").asString()).contains("java.lang.IllegalStateException");
  }

  @Test
  void endsWithSingleNewline() {
    String line = formatter.format(event(Map.of()));

    assertThat(line).endsWith("\n").doesNotContain("\n\n");
    assertThat(line.indexOf('\n')).isEqualTo(line.length() - 1);
  }
}
