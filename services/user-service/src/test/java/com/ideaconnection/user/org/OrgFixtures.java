package com.ideaconnection.user.org;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 조직과 멤버를 테스트용으로 빠르게 만든다. */
final class OrgFixtures {

  private final MockMvc mvc;
  private final JdbcTemplate jdbc;

  OrgFixtures(MockMvc mvc, JdbcTemplate jdbc) {
    this.mvc = mvc;
    this.jdbc = jdbc;
  }

  /** API로 조직을 만들고 id를 돌려준다. 만든 사람은 OWNER다. */
  String createOrg(String bearer, String name) throws Exception {
    String body =
        mvc.perform(
                post("/api/orgs")
                    .header(HttpHeaders.AUTHORIZATION, bearer)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"" + name + "\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    return JsonPath.read(body, "$.id");
  }

  /** 프로필이 없으면 만들고 MEMBER로 넣는다. */
  void addMember(String orgId, String userId, String displayName) {
    jdbc.update(
        "insert ignore into users (id, email, display_name, created_at, updated_at)"
            + " values (?, null, ?, now(6), now(6))",
        userId,
        displayName);
    jdbc.update(
        "insert into organization_members (org_id, user_id, role, created_at)"
            + " values (?, ?, 'MEMBER', now(6))",
        Long.valueOf(orgId),
        userId);
  }
}
