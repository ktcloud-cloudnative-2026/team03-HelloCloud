package com.ideaconnection.user.org;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.web.PageQuery;
import com.ideaconnection.common.web.PageResponse;
import com.ideaconnection.user.user.UserProfileService;
import java.util.List;
import java.util.Optional;
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
  private final OrganizationRepository organizations;
  private final MemberEventPublisher events;

  OrganizationService(
      UserProfileService profiles,
      OrganizationWriter writer,
      OrganizationMemberRepository members,
      OrganizationRepository organizations,
      MemberEventPublisher events) {
    this.profiles = profiles;
    this.writer = writer;
    this.members = members;
    this.organizations = organizations;
    this.events = events;
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

  /** 조직이 없으면 404, 멤버가 아니면 403을 던진다. */
  public OrganizationMember requireMember(Long orgId, String userId) {
    if (!organizations.existsById(orgId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "조직을 찾을 수 없습니다.");
    }
    return members
        .findByOrganizationIdAndUserId(orgId, userId)
        .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "이 조직의 멤버가 아닙니다."));
  }

  public PageResponse<MemberResponse> members(Long orgId, String requesterId, PageQuery query) {
    requireMember(orgId, requesterId);
    Page<OrganizationMember> page =
        members.findPageByOrganizationId(orgId, PageRequest.of(query.page(), query.size()));
    return new PageResponse<>(
        page.map(MemberResponse::from).getContent(),
        query.page(),
        query.size(),
        page.getTotalElements());
  }

  /** OWNER가 멤버를 지우거나 본인이 나간다. OWNER는 나갈 수 없다. */
  public void removeMember(Long orgId, String requesterId, String targetUserId) {
    OrganizationMember requester = requireMember(orgId, requesterId);
    OrganizationMember target =
        members
            .findByOrganizationIdAndUserId(orgId, targetUserId)
            .orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "이 조직의 멤버가 아닙니다."));
    if (target.getRole() == OrganizationRole.OWNER) {
      throw new ApiException(HttpStatus.CONFLICT, "OWNER_CANNOT_LEAVE", "조직 소유자는 나갈 수 없습니다.");
    }
    if (!requesterId.equals(targetUserId) && requester.getRole() != OrganizationRole.OWNER) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "조직 소유자만 멤버를 제거할 수 있습니다.");
    }
    // 커밋이 끝난 뒤에 알린다. 먼저 알리면 chat이 끊은 사용자가 다시 붙을 때 아직 멤버로 보인다.
    writer.removeMember(target);
    events.memberRemoved(orgId, targetUserId);
  }

  /**
   * OWNER가 조직을 지운다. file · chat 데이터는 지우지 않는다(소속 확인이 막으므로 아무도 못 연다, user.md 6절). 커밋 뒤 멤버마다
   * MEMBER_REMOVED를 보내 chat의 실시간 연결을 끊는다.
   */
  public void deleteOrganization(Long orgId, String requesterId) {
    OrganizationMember requester = requireMember(orgId, requesterId);
    if (requester.getRole() != OrganizationRole.OWNER) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "조직 소유자만 조직을 삭제할 수 있습니다.");
    }
    List<String> removedUserIds = writer.deleteOrganization(orgId);
    removedUserIds.forEach(userId -> events.memberRemoved(orgId, userId));
  }

  /** 다른 서비스용 소속 확인. 없는 조직도 멤버가 아닌 것으로 본다. */
  public Optional<OrganizationRole> membership(Long orgId, String userId) {
    return members.findByOrganizationIdAndUserId(orgId, userId).map(OrganizationMember::getRole);
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
