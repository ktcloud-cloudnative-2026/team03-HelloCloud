package com.ideaconnection.user.org;

import com.ideaconnection.user.user.UserProfileRepository;
import java.time.Instant;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class InvitationWriter {

  private final InvitationRepository invitations;
  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository members;
  private final UserProfileRepository users;

  InvitationWriter(
      InvitationRepository invitations,
      OrganizationRepository organizations,
      OrganizationMemberRepository members,
      UserProfileRepository users) {
    this.invitations = invitations;
    this.organizations = organizations;
    this.members = members;
    this.users = users;
  }

  @Transactional
  Invitation create(Invitation invitation) {
    return invitations.save(invitation);
  }

  /**
   * 링크를 사용 처리하고 MEMBER로 넣는다. 다른 요청이 먼저 썼거나 기한이 지났으면 false를 돌려준다. 이미 멤버면
   * DataIntegrityViolationException이 나고 사용 처리도 함께 되돌린다.
   */
  @Transactional
  boolean accept(Invitation invitation, String userId, Instant now) {
    if (invitations.markAccepted(invitation.getId(), userId, now) == 0) {
      return false;
    }
    members.saveAndFlush(
        new OrganizationMember(
            organizations.getReferenceById(invitation.getOrgId()),
            users.getReferenceById(userId),
            OrganizationRole.MEMBER));
    return true;
  }
}
