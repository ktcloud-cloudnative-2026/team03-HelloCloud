package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

class MemberRemovalApiIntegrationTest extends AbstractIntegrationTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private RedisConnectionFactory redis;
  @Autowired private ObjectMapper json;

  private final BlockingQueue<String> events = new LinkedBlockingQueue<>();
  private RedisMessageListenerContainer listener;

  private final String alice = TestTokens.bearer("alice", Map.of("name", "앨리스"));
  private final String bob = TestTokens.bearer("bob", Map.of("name", "밥"));
  private final String carol = TestTokens.bearer("carol", Map.of("name", "캐럴"));
  private final String eve = TestTokens.bearer("eve", Map.of("name", "이브"));

  private OrgFixtures fixtures;
  private String orgId;

  @BeforeEach
  void setUp() throws Exception {
    fixtures = new OrgFixtures(mvc, jdbc);
    orgId = fixtures.createOrg(alice, "HelloCloud");
    fixtures.addMember(orgId, "bob", "밥");
    fixtures.addMember(orgId, "dave", "데이브");

    listener = new RedisMessageListenerContainer();
    listener.setConnectionFactory(redis);
    listener.addMessageListener(
        (message, pattern) -> events.add(new String(message.getBody())),
        new ChannelTopic(RedisMemberEventPublisher.CHANNEL));
    listener.afterPropertiesSet();
    listener.start();
    // 구독이 끝나기 전에 보낸 알림은 받지 못한다
    Thread.sleep(200);
  }

  @AfterEach
  void stopListener() throws Exception {
    listener.destroy();
  }

  @Test
  void removalPublishesMemberRemoved() throws Exception {
    remove(alice, orgId, "bob").andExpect(status().isNoContent());

    String event = events.poll(5, TimeUnit.SECONDS);
    assertThat(event).isNotNull();
    assertThat(json.readTree(event).properties())
        .extracting(Map.Entry::getKey)
        .containsExactlyInAnyOrder("type", "orgId", "userId");
    assertThat(json.readTree(event).get("type").asString()).isEqualTo("MEMBER_REMOVED");
    assertThat(json.readTree(event).get("orgId").asString()).isEqualTo(orgId);
    assertThat(json.readTree(event).get("userId").asString()).isEqualTo("bob");
  }

  @Test
  void leavingSelfAlsoPublishes() throws Exception {
    remove(bob, orgId, "bob").andExpect(status().isNoContent());

    assertThat(events.poll(5, TimeUnit.SECONDS)).contains("\"userId\":\"bob\"");
  }

  @Test
  void rejectedRemovalPublishesNothing() throws Exception {
    remove(bob, orgId, "dave").andExpect(status().isForbidden());
    remove(alice, orgId, "alice").andExpect(status().isConflict());

    assertThat(events.poll(500, TimeUnit.MILLISECONDS)).isNull();
  }

  @Test
  void ownerRemovesMemberAndAccessIsRevokedAtOnce() throws Exception {
    remove(alice, orgId, "bob").andExpect(status().isNoContent());

    mvc.perform(get("/api/orgs/" + orgId + "/members").header(HttpHeaders.AUTHORIZATION, bob))
        .andExpect(status().isForbidden());
    mvc.perform(
            get("/internal/users/orgs/" + orgId + "/members/bob")
                .header(HttpHeaders.AUTHORIZATION, alice))
        .andExpect(jsonPath("$.member").value(false));
  }

  @Test
  void memberLeavesSelf() throws Exception {
    remove(bob, orgId, "bob").andExpect(status().isNoContent());

    assertThat(isMember("bob")).isFalse();
  }

  @Test
  void memberCannotRemoveOther() throws Exception {
    remove(bob, orgId, "dave")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));

    assertThat(isMember("dave")).isTrue();
  }

  @Test
  void ownerCannotLeave() throws Exception {
    remove(alice, orgId, "alice")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("OWNER_CANNOT_LEAVE"));
    remove(bob, orgId, "alice")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("OWNER_CANNOT_LEAVE"));

    assertThat(isMember("alice")).isTrue();
  }

  @Test
  void outsiderIs403() throws Exception {
    remove(carol, orgId, "bob").andExpect(status().isForbidden());

    assertThat(isMember("bob")).isTrue();
  }

  @Test
  void missingOrgIs404() throws Exception {
    remove(alice, "999999", "bob").andExpect(status().isNotFound());
  }

  @Test
  void targetNotMemberIs404() throws Exception {
    remove(alice, orgId, "nobody")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void crossOrgTargetIs404AndOtherOrgUntouched() throws Exception {
    String otherOrg = fixtures.createOrg(eve, "Other");

    remove(alice, orgId, "eve").andExpect(status().isNotFound());

    assertThat(
            jdbc.queryForObject(
                "select count(*) from organization_members where org_id = ? and user_id = 'eve'",
                Long.class,
                Long.valueOf(otherOrg)))
        .isEqualTo(1);
  }

  private boolean isMember(String userId) {
    return jdbc.queryForObject(
            "select count(*) from organization_members where org_id = ? and user_id = ?",
            Long.class,
            Long.valueOf(orgId),
            userId)
        > 0;
  }

  private ResultActions remove(String bearer, String id, String userId) throws Exception {
    return mvc.perform(
        delete("/api/orgs/" + id + "/members/" + userId).header(HttpHeaders.AUTHORIZATION, bearer));
  }
}
