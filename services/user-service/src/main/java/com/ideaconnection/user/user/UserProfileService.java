package com.ideaconnection.user.user;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {

  private static final String DEFAULT_DISPLAY_NAME = "사용자";
  private static final int MAX_DISPLAY_NAME_LENGTH = 50;

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

  /** 앱에서 보일 내 이름을 바꾼다. 처음 로그인 때 정해진 이름(Google 별명, '이름 성' 순서 등)을 고칠 때 쓴다. */
  public UserProfile rename(CurrentUser user, String rawName) {
    String name = (rawName == null) ? "" : rawName.strip();
    if (name.isEmpty() || name.codePointCount(0, name.length()) > MAX_DISPLAY_NAME_LENGTH) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "이름은 1자 이상 50자 이하로 입력해 주세요.");
    }
    UserProfile profile = getOrCreate(user);
    profile.rename(name);
    return repository.saveAndFlush(profile);
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
