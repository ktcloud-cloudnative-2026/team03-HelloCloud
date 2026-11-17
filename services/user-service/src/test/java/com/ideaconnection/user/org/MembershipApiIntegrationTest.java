package com.ideaconnection.user.org;

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

class MembershipApiIntegrationTest extends AbstractIntegrationTest {

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
    fixtures.addMember(orgId, "bob", "밥");
  }

  @Test
  void membersListedForMember() throws Exception {
    members(bob, orgId)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(2))
        .andExpect(jsonPath("$.items[0].userId").value("alice"))
        .andExpect(jsonPath("$.items[0].displayName").value("앨리스"))
        .andExpect(jsonPath("$.items[0].role").value("OWNER"))
        .andExpect(jsonPath("$.items[1].userId").value("bob"))
        .andExpect(jsonPath("$.items[1].role").value("MEMBER"))
        .andExpect(jsonPath("$.page").value(0))
        .andExpect(jsonPath("$.size").value(20))
        .andExpect(jsonPath("$.total").value(2));
  }

  @Test
  void membersForbiddenForOutsider() throws Exception {
    members(carol, orgId)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void membersOfMissingOrgIs404() throws Exception {
    members(alice, "999999")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void nonNumericOrgIdIs400() throws Exception {
    members(alice, "abc")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
  }

  @Test
  void membersWithoutTokenIs401() throws Exception {
    mvc.perform(get("/api/orgs/" + orgId + "/members")).andExpect(status().isUnauthorized());
  }

  @Test
  void internalReturnsRole() throws Exception {
    internal(bob, orgId, "alice")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.member").value(true))
        .andExpect(jsonPath("$.role").value("OWNER"));
  }

  @Test
  void internalReturnsFalseForOutsiderAndMissingOrg() throws Exception {
    internal(bob, orgId, "carol")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.member").value(false))
        .andExpect(jsonPath("$.role").doesNotExist());
    internal(bob, "999999", "alice")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.member").value(false));
  }

  @Test
  void internalRequiresToken() throws Exception {
    mvc.perform(get("/internal/users/orgs/" + orgId + "/members/alice"))
        .andExpect(status().isUnauthorized());
  }

  private ResultActions members(String bearer, String id) throws Exception {
    return mvc.perform(
        get("/api/orgs/" + id + "/members").header(HttpHeaders.AUTHORIZATION, bearer));
  }

  private ResultActions internal(String bearer, String id, String userId) throws Exception {
    return mvc.perform(
        get("/internal/users/orgs/" + id + "/members/" + userId)
            .header(HttpHeaders.AUTHORIZATION, bearer));
  }
}
