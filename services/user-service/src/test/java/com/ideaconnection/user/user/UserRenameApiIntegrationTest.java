package com.ideaconnection.user.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ideaconnection.common.test.TestTokens;
import com.ideaconnection.user.AbstractIntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class UserRenameApiIntegrationTest extends AbstractIntegrationTest {

  @Autowired private MockMvc mvc;

  // 이메일 가입자는 Keycloak이 '이름 성' 순서로 name을 준다
  private final String me = TestTokens.bearer("u1", Map.of("email", "a@x.com", "name", "준형 김"));

  @Test
  void renamesMe() throws Exception {
    mvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, me))
        .andExpect(jsonPath("$.displayName").value("준형 김"));

    rename(me, "  김준형 ")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value("u1"))
        .andExpect(jsonPath("$.email").value("a@x.com"))
        .andExpect(jsonPath("$.displayName").value("김준형"));

    mvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, me))
        .andExpect(jsonPath("$.displayName").value("김준형"));
  }

  @Test
  void renameCreatesProfileIfMissing() throws Exception {
    rename(me, "김준형").andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("김준형"));
  }

  @Test
  void rejectsBlankName() throws Exception {
    rename(me, "   ")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
  }

  @Test
  void rejectsMissingName() throws Exception {
    mvc.perform(
            patch("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, me)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
  }

  @Test
  void rejectsTooLongName() throws Exception {
    rename(me, "가".repeat(51)).andExpect(status().isBadRequest());
  }

  @Test
  void acceptsFiftyCodePointsWithEmoji() throws Exception {
    // 이모지는 Java 문자 2개지만 한 글자로 센다
    rename(me, "😀".repeat(50)).andExpect(status().isOk());
  }

  private ResultActions rename(String bearer, String displayName) throws Exception {
    String body = "{\"displayName\":\"" + displayName + "\"}";
    return mvc.perform(
        patch("/api/users/me")
            .header(HttpHeaders.AUTHORIZATION, bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
  }
}
