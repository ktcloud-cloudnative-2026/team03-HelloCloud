package com.ideaconnection.user;

import com.ideaconnection.common.test.TestTokens;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mysql.MySQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Import(AbstractIntegrationTest.TestSecurity.class)
public abstract class AbstractIntegrationTest {

  private static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4.13");

  static {
    MYSQL.start();
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
    registry.add("spring.datasource.username", MYSQL::getUsername);
    registry.add("spring.datasource.password", MYSQL::getPassword);
    registry.add(
        "spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> "http://issuer.invalid");
  }

  @TestConfiguration
  static class TestSecurity {
    @Bean
    JwtDecoder jwtDecoder() {
      return TestTokens.jwtDecoder();
    }
  }
}
