package com.ideaconnection.user.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.user.AbstractIntegrationTest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class UserProfileServiceTest extends AbstractIntegrationTest {

  @Autowired private UserProfileService service;
  @Autowired private UserProfileRepository repository;

  @Test
  void createsProfileFromToken() {
    UserProfile profile = service.getOrCreate(new CurrentUser("u1", "a@x.com", "김민준"));

    assertThat(profile.getId()).isEqualTo("u1");
    assertThat(profile.getEmail()).isEqualTo("a@x.com");
    assertThat(profile.getDisplayName()).isEqualTo("김민준");
    assertThat(profile.getCreatedAt()).isNotNull();
  }

  @Test
  void displayNameFallsBackToEmail() {
    UserProfile profile = service.getOrCreate(new CurrentUser("u1", "a@x.com", null));

    assertThat(profile.getDisplayName()).isEqualTo("a@x.com");
  }

  @Test
  void displayNameFallsBackToDefault() {
    UserProfile profile = service.getOrCreate(new CurrentUser("u1", null, null));

    assertThat(profile.getDisplayName()).isEqualTo("사용자");
    assertThat(profile.getEmail()).isNull();
  }

  @Test
  void repeatedCallsKeepOneProfile() {
    service.getOrCreate(new CurrentUser("u1", "a@x.com", "김민준"));
    service.getOrCreate(new CurrentUser("u1", "a@x.com", "김민준"));

    assertThat(repository.count()).isEqualTo(1);
  }

  @Test
  void existingProfileIsNotOverwritten() {
    service.getOrCreate(new CurrentUser("u1", "a@x.com", "처음 이름"));

    UserProfile again = service.getOrCreate(new CurrentUser("u1", "b@x.com", "바뀐 이름"));

    assertThat(again.getDisplayName()).isEqualTo("처음 이름");
    assertThat(again.getEmail()).isEqualTo("a@x.com");
  }

  @Test
  void storesLongAndEmojiNames() {
    String longName = "가".repeat(511);

    service.getOrCreate(new CurrentUser("long", null, longName));
    service.getOrCreate(new CurrentUser("emoji", null, "민준😀"));

    assertThat(repository.findById("long").orElseThrow().getDisplayName()).isEqualTo(longName);
    assertThat(repository.findById("emoji").orElseThrow().getDisplayName()).isEqualTo("민준😀");
  }

  @Test
  void concurrentFirstCallsCreateOneProfile() throws Exception {
    int threads = 16;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Future<UserProfile>> results = new ArrayList<>();
    try {
      for (int i = 0; i < threads; i++) {
        results.add(
            pool.submit(
                () -> {
                  start.await();
                  return service.getOrCreate(new CurrentUser("u1", "a@x.com", "김민준"));
                }));
      }
      start.countDown();

      for (Future<UserProfile> result : results) {
        assertThat(result.get().getId()).isEqualTo("u1");
      }
    } finally {
      pool.shutdownNow();
    }
    assertThat(repository.count()).isEqualTo(1);
  }
}
