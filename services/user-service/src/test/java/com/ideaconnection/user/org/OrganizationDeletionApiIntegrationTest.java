package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import java.util.ArrayList;
import java.util.List;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class OrganizationDeletionApiIntegrationTest extends AbstractIntegrationTest {

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
    mvc.perform(
            post("/api/orgs/" + orgId + "/invitations").header(HttpHeaders.AUTHORIZATION, alice))
        .andExpect(status().isCreated());

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
  void ownerDeletesOrg() throws Exception {
    deleteOrg(alice, orgId).andExpect(status().isNoContent());

    assertThat(count("organizations", "id")).isZero();
    assertThat(count("organization_members", "org_id")).isZero();
    assertThat(count("invitations", "org_id")).isZero();
  }

  @Test
  void memberCannotDelete() throws Exception {
    deleteOrg(bob, orgId)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));

    assertThat(count("organizations", "id")).isEqualTo(1);
    assertThat(count("organization_members", "org_id")).isEqualTo(3);
  }

  @Test
  void outsiderCannotDelete() throws Exception {
    deleteOrg(carol, orgId).andExpect(status().isForbidden());

    assertThat(count("organizations", "id")).isEqualTo(1);
  }

  @Test
  void missingOrgIs404() throws Exception {
    deleteOrg(alice, "999999").andExpect(status().isNotFound());
  }

  @Test
  void deletingTwiceIs404() throws Exception {
    deleteOrg(alice, orgId).andExpect(status().isNoContent());
    deleteOrg(alice, orgId).andExpect(status().isNotFound());
  }

  @Test
  void publishesMemberRemovedForEveryMember() throws Exception {
    deleteOrg(alice, orgId).andExpect(status().isNoContent());

    List<String> userIds = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      String event = events.poll(5, TimeUnit.SECONDS);
      assertThat(event).isNotNull();
      JsonNode node = json.readTree(event);
      assertThat(node.get("type").asString()).isEqualTo("MEMBER_REMOVED");
      assertThat(node.get("orgId").asString()).isEqualTo(orgId);
      userIds.add(node.get("userId").asString());
    }
    assertThat(userIds).containsExactlyInAnyOrder("alice", "bob", "dave");
    assertThat(events.poll(300, TimeUnit.MILLISECONDS)).isNull();
  }

  @Test
  void rejectedDeletePublishesNothing() throws Exception {
    deleteOrg(bob, orgId).andExpect(status().isForbidden());

    assertThat(events.poll(500, TimeUnit.MILLISECONDS)).isNull();
  }

  @Test
  void ownerOnlyOrgDeletes() throws Exception {
    String solo = fixtures.createOrg(eve, "Solo");

    deleteOrg(eve, solo).andExpect(status().isNoContent());

    assertThat(events.poll(5, TimeUnit.SECONDS)).contains("\"userId\":\"eve\"");
  }

  @Test
  void otherOrgUntouched() throws Exception {
    String otherOrg = fixtures.createOrg(eve, "Other");
    fixtures.addMember(otherOrg, "bob", "밥");

    deleteOrg(alice, orgId).andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "select count(*) from organization_members where org_id = ?",
                Long.class,
                Long.valueOf(otherOrg)))
        .isEqualTo(2);
    mvc.perform(get("/api/orgs").header(HttpHeaders.AUTHORIZATION, bob))
        .andExpect(jsonPath("$.total").value(1));
  }

  @Test
  void internalMembershipFalseAfterDelete() throws Exception {
    deleteOrg(alice, orgId).andExpect(status().isNoContent());

    mvc.perform(
            get("/internal/users/orgs/" + orgId + "/members/bob")
                .header(HttpHeaders.AUTHORIZATION, bob))
        .andExpect(jsonPath("$.member").value(false));
  }

  private long count(String table, String column) {
    return jdbc.queryForObject(
        "select count(*) from " + table + " where " + column + " = ?",
        Long.class,
        Long.valueOf(orgId));
  }

  private ResultActions deleteOrg(String bearer, String id) throws Exception {
    return mvc.perform(delete("/api/orgs/" + id).header(HttpHeaders.AUTHORIZATION, bearer));
  }
}
