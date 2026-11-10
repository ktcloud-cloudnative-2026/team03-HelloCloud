package com.ideaconnection.common;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.test.TestTokens;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoderInitializationException;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
class CommonTestApplication {

  @Bean
  JwtDecoder jwtDecoder() {
    JwtDecoder real = TestTokens.jwtDecoder();
    return token ->
        switch (token) {
          case "auth-down" -> throw new JwtException("JWK 조회 실패");
          case "decoder-not-ready" ->
              throw new JwtDecoderInitializationException("초기화 실패", new IllegalStateException());
          case "filter-boom" -> throw new IllegalStateException("jdbc:mysql://secret-host");
          default -> real.decode(token);
        };
  }

  @GetMapping("/api/test/missing-path")
  void missingPath(@PathVariable("b") String b) {}

  @GetMapping("/api/test/unwritable")
  Unwritable unwritable() {
    return new Unwritable();
  }

  static class Unwritable {
    public String getValue() {
      throw new IllegalStateException("직렬화 실패");
    }
  }

  @GetMapping("/api/test/me")
  CurrentUser me(CurrentUser user) {
    return user;
  }

  @GetMapping("/api/test/conflict")
  void conflict() {
    throw new ApiException(HttpStatus.CONFLICT, "SAMPLE_CONFLICT", "충돌");
  }

  @GetMapping("/api/test/forbidden")
  void forbidden() {
    throw new AccessDeniedException("no");
  }

  @GetMapping("/api/test/boom")
  void boom() {
    throw new IllegalStateException("jdbc:mysql://secret-host");
  }
}
