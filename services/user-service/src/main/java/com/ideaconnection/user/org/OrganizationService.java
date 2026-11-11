package com.ideaconnection.user.org;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.web.PageQuery;
import com.ideaconnection.common.web.PageResponse;
import com.ideaconnection.user.user.UserProfileService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class OrganizationService {

  private static final int MAX_NAME_LENGTH = 100;

  private final UserProfileService profiles;
  private final OrganizationWriter writer;
  private final OrganizationMemberRepository members;

  OrganizationService(
      UserProfileService profiles,
      OrganizationWriter writer,
      OrganizationMemberRepository members) {
    this.profiles = profiles;
    this.writer = writer;
    this.members = members;
  }

  // 프로필 생성이 조직 트랜잭션에 묶이지 않도록 여기에는 트랜잭션을 걸지 않는다.
  public OrganizationMember create(CurrentUser user, String rawName) {
    String name = validName(rawName);
    profiles.getOrCreate(user);
    return writer.create(name, user.id());
  }

  public PageResponse<OrganizationResponse> list(String userId, PageQuery query) {
    Page<OrganizationMember> page =
        members.findPageByUserId(userId, PageRequest.of(query.page(), query.size()));
    return new PageResponse<>(
        page.map(OrganizationResponse::from).getContent(),
        query.page(),
        query.size(),
        page.getTotalElements());
  }

  private static String validName(String rawName) {
    String name = (rawName == null) ? "" : rawName.strip();
    if (name.isEmpty() || name.codePointCount(0, name.length()) > MAX_NAME_LENGTH) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "BAD_REQUEST", "조직 이름은 1자 이상 100자 이하로 입력해 주세요.");
    }
    return name;
  }
}
