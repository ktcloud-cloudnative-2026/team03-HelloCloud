package com.ideaconnection.user.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.user.AbstractIntegrationTest;
import com.ideaconnection.user.user.UserProfile;
import com.ideaconnection.user.user.UserProfileRepository;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

class OrganizationServiceTest extends AbstractIntegrationTest {

  private static final CurrentUser USER = new CurrentUser("u1", "a@x.com", "김민준");
  private static final String NAME_ERROR = "조직 이름은 1자 이상 100자 이하로 입력해 주세요.";

  @Autowired private OrganizationService service;
  @Autowired private OrganizationRepository organizations;
  @Autowired private OrganizationMemberRepository members;
  @Autowired private UserProfileRepository profiles;

  @Test
  void creatorBecomesOwner() {
    OrganizationMember member = service.create(USER, "HelloCloud");

    assertThat(member.getRole()).isEqualTo(OrganizationRole.OWNER);
    assertThat(member.getOrganization().getName()).isEqualTo("HelloCloud");
    assertThat(member.getOrganization().getCreatedAt()).isNotNull();
    assertThat(organizations.count()).isEqualTo(1);
    assertThat(members.count()).isEqualTo(1);
  }

  @Test
  void createsMissingProfileFirst() {
    service.create(USER, "HelloCloud");

    assertThat(profiles.findById("u1")).isPresent();
    assertThat(profiles.count()).isEqualTo(1);
  }

  @Test
  void trimsName() {
    assertThat(service.create(USER, "  Hello  ").getOrganization().getName()).isEqualTo("Hello");
  }

  @Test
  void acceptsHundredCharacters() {
    assertStoredUnchanged("가".repeat(100));
  }

  @Test
  void countsEmojiAsOneCharacter() {
    assertStoredUnchanged("😀".repeat(100));
  }

  @Test
  void rejectsBlankName() {
    for (String name : Arrays.asList(null, "", "   ")) {
      assertInvalidName(name);
    }
    assertThat(profiles.count()).isZero();
  }

  @Test
  void rejectsTooLongName() {
    assertInvalidName("가".repeat(101));

    assertThat(profiles.count()).isZero();
    assertThat(organizations.count()).isZero();
  }

  @Test
  void allowsSameNameTwice() {
    service.create(USER, "HelloCloud");
    service.create(USER, "HelloCloud");

    assertThat(organizations.count()).isEqualTo(2);
  }

  @Test
  void concurrentFirstCreatesKeepOneProfile() throws Exception {
    int threads = 8;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Future<OrganizationMember>> results = new ArrayList<>();
    try {
      for (int i = 0; i < threads; i++) {
        results.add(
            pool.submit(
                () -> {
                  start.await();
                  return service.create(USER, "HelloCloud");
                }));
      }
      start.countDown();

      for (Future<OrganizationMember> result : results) {
        assertThat(result.get().getRole()).isEqualTo(OrganizationRole.OWNER);
      }
    } finally {
      pool.shutdownNow();
    }
    assertThat(profiles.count()).isEqualTo(1);
    assertThat(organizations.count()).isEqualTo(threads);
  }

  @Test
  void databaseRejectsDuplicateMembership() {
    OrganizationMember owner = service.create(USER, "HelloCloud");
    UserProfile profile = profiles.findById("u1").orElseThrow();
    OrganizationMember duplicate =
        new OrganizationMember(owner.getOrganization(), profile, OrganizationRole.MEMBER);

    assertThatThrownBy(() -> members.saveAndFlush(duplicate))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  private void assertStoredUnchanged(String name) {
    Long id = service.create(USER, name).getOrganization().getId();

    assertThat(organizations.findById(id).orElseThrow().getName()).isEqualTo(name);
  }

  private void assertInvalidName(String name) {
    assertThatThrownBy(() -> service.create(USER, name))
        .isInstanceOfSatisfying(
            ApiException.class,
            e -> {
              assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
              assertThat(e.getCode()).isEqualTo("BAD_REQUEST");
              assertThat(e.getMessage()).isEqualTo(NAME_ERROR);
            });
  }
}
