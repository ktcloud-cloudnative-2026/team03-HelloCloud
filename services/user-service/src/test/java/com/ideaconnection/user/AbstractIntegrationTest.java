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
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.mysql.MySQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Import(AbstractIntegrationTest.TestSecurity.class)
public abstract class AbstractIntegrationTest {

  private static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4.13");
  private static final GenericContainer<?> REDIS =
      new GenericContainer<>("redis:8.10.0")
          .withExposedPorts(6379)
          // dev처럼 비밀번호를 건다. 비밀번호 없이 붙는 설정 실수를 테스트가 잡게 한다
          .withCommand("redis-server", "--requirepass", "test-redis-pass");

  static {
    MYSQL.start();
    REDIS.start();
  }

  @Autowired private JdbcTemplate jdbc;

  @BeforeEach
  void cleanDatabase() {
    jdbc.update("delete from invitations");
    jdbc.update("delete from organization_members");
    jdbc.update("delete from organizations");
    jdbc.update("delete from users");
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
    registry.add("spring.datasource.username", MYSQL::getUsername);
    registry.add("spring.datasource.password", MYSQL::getPassword);
    registry.add("redis.url", () -> "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379));
    registry.add("redis.password", () -> "test-redis-pass");
    registry.add(
        "spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> "http://issuer.invalid");
    registry.add("invite.base-url", () -> "https://hc.test/");
  }

  @TestConfiguration
  static class TestSecurity {
    @Bean
    JwtDecoder jwtDecoder() {
      return TestTokens.jwtDecoder();
    }
  }
}
