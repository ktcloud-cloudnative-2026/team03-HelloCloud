package com.ideaconnection.user.org;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code baseUrl}: 초대 링크 앞부분(웹 화면 주소). 비어 있으면 로컬 웹 주소를 쓴다. */
@ConfigurationProperties("invite")
record InviteProperties(String baseUrl) {

  private static final String LOCAL_WEB = "http://localhost:5173";

  InviteProperties {
    // .env.example을 그대로 복사하면 빈 값이 들어와 상대 주소 링크가 만들어지므로 막는다.
    baseUrl =
        (baseUrl == null || baseUrl.isBlank()) ? LOCAL_WEB : baseUrl.strip().replaceAll("/+$", "");
  }
}
