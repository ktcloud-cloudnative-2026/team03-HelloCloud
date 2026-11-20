package com.ideaconnection.user.org;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
class RedisMemberEventPublisher implements MemberEventPublisher {

  static final String CHANNEL = "hellocloud-member-events";

  private static final Logger log = LoggerFactory.getLogger(RedisMemberEventPublisher.class);

  private final StringRedisTemplate redis;
  private final ObjectMapper json;

  RedisMemberEventPublisher(StringRedisTemplate redis, ObjectMapper json) {
    this.redis = redis;
    this.json = json;
  }

  // 멤버 삭제는 이미 커밋됐고 새 요청은 소속 확인으로 막히므로, Redis가 멈춰도 요청은 성공시킨다.
  // 놓친 연결은 chat이 로그인 토큰 만료 때 끊는다.
  @Override
  public void memberRemoved(Long orgId, String userId) {
    String message =
        json.writeValueAsString(
            Map.of("type", "MEMBER_REMOVED", "orgId", String.valueOf(orgId), "userId", userId));
    try {
      redis.convertAndSend(CHANNEL, message);
    } catch (RuntimeException e) {
      log.warn("MEMBER_REMOVED 알림 실패 orgId={} userId={}", orgId, userId, e);
    }
  }
}
