package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class InvitePropertiesTest {

  @Test
  void blankBaseUrlFallsBackToLocalWeb() {
    assertThat(new InviteProperties("").baseUrl()).isEqualTo("http://localhost:5173");
    assertThat(new InviteProperties("  ").baseUrl()).isEqualTo("http://localhost:5173");
    assertThat(new InviteProperties(null).baseUrl()).isEqualTo("http://localhost:5173");
  }

  @Test
  void trailingSlashesAreRemoved() {
    assertThat(new InviteProperties("http://10.10.24.101//").baseUrl())
        .isEqualTo("http://10.10.24.101");
  }
}
