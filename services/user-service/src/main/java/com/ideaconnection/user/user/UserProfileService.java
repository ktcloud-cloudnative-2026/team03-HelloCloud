package com.ideaconnection.user.user;

import com.ideaconnection.common.security.CurrentUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {

  private static final String DEFAULT_DISPLAY_NAME = "사용자";

  private final UserProfileRepository repository;
  private final UserProfileWriter writer;

  UserProfileService(UserProfileRepository repository, UserProfileWriter writer) {
    this.repository = repository;
    this.writer = writer;
  }

  /** 프로필을 찾고 없으면 만든다. 생성이 호출자의 트랜잭션에 묶이지 않도록 트랜잭션 밖에서 호출한다. */
  public UserProfile getOrCreate(CurrentUser user) {
    return repository.findById(user.id()).orElseGet(() -> create(user));
  }

  private UserProfile create(CurrentUser user) {
    UserProfile profile = new UserProfile(user.id(), user.email(), displayName(user));
    try {
      writer.insert(profile);
      return profile;
    } catch (DataIntegrityViolationException e) {
      return repository.findById(user.id()).orElseThrow(() -> e);
    }
  }

  private static String displayName(CurrentUser user) {
    if (user.name() != null) {
      return user.name();
    }
    return (user.email() != null) ? user.email() : DEFAULT_DISPLAY_NAME;
  }
}
