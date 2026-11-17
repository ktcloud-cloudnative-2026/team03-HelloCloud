package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class MemberRemovalApiIntegrationTest extends AbstractIntegrationTest {

  @Autowired private MockMvc mvc;
  @Autowired private JdbcTemplate jdbc;

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
