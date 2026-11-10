package com.ideaconnection.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class ApiTimeTest {

  @Test
  void formatsInKoreanOffset() {
    assertThat(ApiTime.format(Instant.parse("2026-11-06T00:00:00Z")))
        .isEqualTo("2026-11-06T09:00:00+09:00");
  }

  @Test
  void dropsFractionOfSecond() {
    assertThat(ApiTime.format(Instant.parse("2026-11-06T00:00:00.123456Z")))
        .isEqualTo("2026-11-06T09:00:00+09:00");
  }
}
