package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import com.ideaconnection.user.user.UserProfileRepository;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class OrganizationApiIntegrationTest extends AbstractIntegrationTest {

  private static final String ORGS = "/api/orgs";
  private static final String NAME_ERROR = "조직 이름은 1자 이상 100자 이하로 입력해 주세요.";

  @Autowired private MockMvc mvc;
  @Autowired private OrganizationRepository organizations;
  @Autowired private UserProfileRepository profiles;

  private final String alice = TestTokens.bearer("alice", Map.of("name", "앨리스"));
  private final String bob = TestTokens.bearer("bob", Map.of("name", "밥"));

  @Test
  void createReturns201WithOwnerRole() throws Exception {
    create(alice, "{\"name\":\"HelloCloud\"}")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id", matchesPattern("^\\d+$")))
        .andExpect(jsonPath("$.name").value("HelloCloud"))
        .andExpect(jsonPath("$.role").value("OWNER"))
        .andExpect(
            jsonPath(
                "$.createdAt",
                matchesPattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\+09:00$")));
  }

  @Test
  void createWithoutTokenIs401() throws Exception {
    mvc.perform(post(ORGS).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

    assertThat(organizations.count()).isZero();
  }

  @Test
  void invalidNameIs400Problem() throws Exception {
    for (String body : List.of("{\"name\":\"  \"}", "{}")) {
      create(alice, body)
          .andExpect(status().isBadRequest())
          .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
          .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
          .andExpect(jsonPath("$.detail").value(NAME_ERROR));
    }

    assertThat(profiles.count()).isZero();
  }

  @Test
  void malformedJsonIs400Problem() throws Exception {
    create(alice, "{")
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
  }

  @Test
  void emptyBodyIs400Problem() throws Exception {
    create(alice, "")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
  }

  @Test
  void listShowsOnlyMyOrganizations() throws Exception {
    createNamed(alice, "A조직");
    createNamed(bob, "B조직");

    list(alice, "")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].name").value("A조직"))
        .andExpect(jsonPath("$.total").value(1));
  }

  @Test
  void listUsesDefaultPaging() throws Exception {
    list(alice, "").andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20));
  }

  @Test
  void listItemMatchesCreateResponse() throws Exception {
    String created = createNamed(alice, "HelloCloud");

    list(alice, "")
        .andExpect(jsonPath("$.items[0].id").value(JsonPath.<String>read(created, "$.id")))
        .andExpect(jsonPath("$.items[0].name").value("HelloCloud"))
        .andExpect(jsonPath("$.items[0].role").value("OWNER"))
        .andExpect(
            jsonPath("$.items[0].createdAt").value(JsonPath.<String>read(created, "$.createdAt")));
  }

  @Test
  void listIsPagedInCreationOrder() throws Exception {
    createNamed(alice, "첫째");
    createNamed(alice, "둘째");
    createNamed(alice, "셋째");

    list(alice, "?page=1&size=2")
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].name").value("셋째"))
        .andExpect(jsonPath("$.page").value(1))
        .andExpect(jsonPath("$.size").value(2))
        .andExpect(jsonPath("$.total").value(3));
  }

  @Test
  void pageBeyondEndIsEmpty() throws Exception {
    createNamed(alice, "첫째");

    list(alice, "?page=5")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(0))
        .andExpect(jsonPath("$.total").value(1));
  }

  @Test
  void invalidPagingIs400Problem() throws Exception {
    for (String query : List.of("?size=0", "?size=101", "?page=-1", "?page=abc")) {
      list(alice, query)
          .andExpect(status().isBadRequest())
          .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
          .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }
  }

  @Test
  void listForNewUserDoesNotCreateProfile() throws Exception {
    list(alice, "").andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));

    assertThat(profiles.count()).isZero();
  }

  @Test
  void listWithoutTokenIs401() throws Exception {
    mvc.perform(get(ORGS)).andExpect(status().isUnauthorized());
  }

  private ResultActions create(String bearer, String body) throws Exception {
    return mvc.perform(
        post(ORGS)
            .header(HttpHeaders.AUTHORIZATION, bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
  }

  private String createNamed(String bearer, String name) throws Exception {
    return create(bearer, "{\"name\":\"" + name + "\"}")
        .andExpect(status().isCreated())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);
  }

  private ResultActions list(String bearer, String query) throws Exception {
    return mvc.perform(get(ORGS + query).header(HttpHeaders.AUTHORIZATION, bearer));
  }
}
