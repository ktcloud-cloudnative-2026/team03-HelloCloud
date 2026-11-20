package com.ideaconnection.user.org;

import com.ideaconnection.user.user.UserProfile;
import com.ideaconnection.user.user.UserProfileRepository;
import java.util.List;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class OrganizationWriter {

  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository members;
  private final UserProfileRepository users;
  private final InvitationRepository invitations;

  OrganizationWriter(
      OrganizationRepository organizations,
      OrganizationMemberRepository members,
      UserProfileRepository users,
      InvitationRepository invitations) {
    this.organizations = organizations;
    this.members = members;
    this.users = users;
    this.invitations = invitations;
  }

  @Transactional
  OrganizationMember create(String name, String ownerId) {
    UserProfile owner = users.getReferenceById(ownerId);
    Organization organization = organizations.save(new Organization(name, owner));
    return members.save(new OrganizationMember(organization, owner, OrganizationRole.OWNER));
  }

  @Transactional
  void removeMember(OrganizationMember member) {
    members.delete(member);
  }

  /** 외래 키에 연쇄 삭제가 없어서 초대 → 멤버 → 조직 순서로 지운다. 지운 멤버의 userId를 돌려준다. */
  @Transactional
  List<String> deleteOrganization(Long orgId) {
    List<String> userIds = members.findUserIdsByOrganizationId(orgId);
    invitations.deleteByOrgId(orgId);
    members.deleteByOrganizationId(orgId);
    organizations.deleteById(orgId);
    return userIds;
  }
}
