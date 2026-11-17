package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class InvitationApiIntegrationTest extends AbstractIntegrationTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcTemplate jdbc;

  private final String alice = TestTokens.bearer("alice", Map.of("name", "앨리스"));
  private final String bob = TestTokens.bearer("bob", Map.of("name", "밥"));
  private final String carol = TestTokens.bearer("carol", Map.of("name", "캐럴"));

  private OrgFixtures fixtures;
  private String orgId;

  @BeforeEach
  void setUp() throws Exception {
    fixtures = new OrgFixtures(mvc, jdbc);
    orgId = fixtures.createOrg(alice, "HelloCloud");
  }

  @Test
  void ownerCreatesLink() throws Exception {
    OffsetDateTime before = OffsetDateTime.now();
    String body =
        createInvite(alice, orgId)
            .andExpect(status().isCreated())
            .andExpect(
                jsonPath(
                    "$.inviteUrl", matchesPattern("^https://hc\\.test/invite/[A-Za-z0-9_-]{43}$")))
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);

    OffsetDateTime expiresAt = OffsetDateTime.parse(JsonPath.read(body, "$.expiresAt"));
    assertThat(Duration.between(before.plusDays(7), expiresAt).abs())
        .isLessThan(Duration.ofMinutes(1));
  }

  @Test
  void tokenStoredOnlyAsHash() throws Exception {
    String token = newToken();

    List<String> hashes = jdbc.queryForList("select token_hash from invitations", String.class);
    assertThat(hashes).hasSize(1);
    assertThat(hashes.get(0)).hasSize(64).isNotEqualTo(token).doesNotContain(token);
  }

  @Test
  void onlyOwnerCanCreateLink() throws Exception {
    fixtures.addMember(orgId, "bob", "밥");

    createInvite(bob, orgId)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    createInvite(carol, orgId).andExpect(status().isForbidden());
    createInvite(alice, "999999").andExpect(status().isNotFound());
    assertThat(jdbc.queryForObject("select count(*) from invitations", Long.class)).isZero();
  }

  @Test
  void acceptJoinsAsMember() throws Exception {
    String token = newToken();

    accept(bob, token)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.orgId").value(orgId))
        .andExpect(jsonPath("$.role").value("MEMBER"));

    mvc.perform(get("/api/orgs").header(HttpHeaders.AUTHORIZATION, bob))
        .andExpect(jsonPath("$.items[0].id").value(orgId))
        .andExpect(jsonPath("$.items[0].role").value("MEMBER"));
    assertThat(jdbc.queryForObject("select display_name from users where id = 'bob'", String.class))
        .isEqualTo("밥");
  }

  @Test
  void reuseIs409Used() throws Exception {
    String token = newToken();
    accept(bob, token).andExpect(status().isOk());

    accept(carol, token)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVITATION_ALREADY_USED"));
  }

  @Test
  void unknownTokenIs404() throws Exception {
    accept(bob, "no-such-token")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("INVITATION_NOT_FOUND"));
  }

  @Test
  void expiredIs409EvenForExistingMember() throws Exception {
    String token = newToken();
    jdbc.update("update invitations set expires_at = now(6) - interval 1 second");

    accept(bob, token)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVITATION_EXPIRED"));
    accept(alice, token)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVITATION_EXPIRED"));
  }

  @Test
  void alreadyMemberIs409AndLinkStaysUnused() throws Exception {
    String token = newToken();

    accept(alice, token)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
    accept(bob, token).andExpect(status().isOk());
  }

  @Test
  void concurrentAcceptOnlyOneWins() throws Exception {
    String token = newToken();
    int users = 8;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(users);
    List<Future<String>> results = new ArrayList<>();
    for (int i = 0; i < users; i++) {
      String bearer = TestTokens.bearer("racer" + i, Map.of("name", "racer" + i));
      results.add(
          pool.submit(
              () -> {
                start.await();
                var response = accept(bearer, token).andReturn().getResponse();
                return response.getStatus()
                    + " "
                    + response.getContentAsString(StandardCharsets.UTF_8);
              }));
    }
    start.countDown();
    List<String> outcomes = new ArrayList<>();
    for (Future<String> result : results) {
      outcomes.add(result.get());
    }
    pool.shutdown();

    assertThat(outcomes).filteredOn(o -> o.startsWith("200")).hasSize(1);
    assertThat(outcomes)
        .filteredOn(o -> !o.startsWith("200"))
        .allMatch(o -> o.startsWith("409") && o.contains("INVITATION_ALREADY_USED"));
    assertThat(
            jdbc.queryForObject(
                "select count(*) from organization_members where org_id = ?",
                Long.class,
                Long.valueOf(orgId)))
        .isEqualTo(2);
  }

  private String newToken() throws Exception {
    String body =
        createInvite(alice, orgId)
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    String url = JsonPath.read(body, "$.inviteUrl");
    return url.substring(url.lastIndexOf('/') + 1);
  }

  private ResultActions createInvite(String bearer, String id) throws Exception {
    return mvc.perform(
        post("/api/orgs/" + id + "/invitations").header(HttpHeaders.AUTHORIZATION, bearer));
  }

  private ResultActions accept(String bearer, String token) throws Exception {
    return mvc.perform(
        post("/api/invitations/" + token + "/accept").header(HttpHeaders.AUTHORIZATION, bearer));
  }
}
