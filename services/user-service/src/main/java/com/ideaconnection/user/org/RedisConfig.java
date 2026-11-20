package com.ideaconnection.user.org;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.data.redis.autoconfigure.DataRedisConnectionDetails;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class RedisConfig {

  // 팀 규칙대로 주소(REDIS_URL)와 비밀번호(REDIS_PASSWORD)를 따로 받는다. spring.data.redis.url을 쓰면
  // Spring Boot가 password 설정을 무시하고 URL 안의 비밀번호만 써서 NOAUTH가 난다.
  @Bean
  DataRedisConnectionDetails redisConnectionDetails(
      @Value("${redis.url}") URI url, @Value("${redis.password:}") String password) {
    String host = url.getHost();
    int port = (url.getPort() == -1) ? 6379 : url.getPort();
    return new DataRedisConnectionDetails() {
      @Override
      public String getPassword() {
        return password.isEmpty() ? null : password;
      }

      @Override
      public Standalone getStandalone() {
        return Standalone.of(host, port);
      }
    };
  }
}
