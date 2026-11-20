package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import tools.jackson.databind.json.JsonMapper;

class RedisMemberEventPublisherTest {

  @Test
  void redisFailureDoesNotFailRemoval() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    doThrow(new RedisConnectionFailureException("down"))
        .when(redis)
        .convertAndSend(anyString(), anyString());

    RedisMemberEventPublisher publisher =
        new RedisMemberEventPublisher(redis, JsonMapper.builder().build());

    assertThatCode(() -> publisher.memberRemoved(1L, "bob")).doesNotThrowAnyException();
  }
}
