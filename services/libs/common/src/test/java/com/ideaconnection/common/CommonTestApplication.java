package com.ideaconnection.common;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.test.TestTokens;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
class CommonTestApplication {

  @Bean
  JwtDecoder jwtDecoder() {
    return TestTokens.jwtDecoder();
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
