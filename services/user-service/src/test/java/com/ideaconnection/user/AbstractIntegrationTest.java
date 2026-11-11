package com.ideaconnection.user;

import com.ideaconnection.common.test.TestTokens;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
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

  @Autowired private JdbcTemplate jdbc;

  @BeforeEach
  void cleanDatabase() {
    jdbc.update("delete from organization_members");
    jdbc.update("delete from organizations");
    jdbc.update("delete from users");
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
