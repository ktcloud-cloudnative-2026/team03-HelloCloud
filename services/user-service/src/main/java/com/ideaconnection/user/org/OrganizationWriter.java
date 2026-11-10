package com.ideaconnection.user.org;

import com.ideaconnection.user.user.UserProfile;
import com.ideaconnection.user.user.UserProfileRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class OrganizationWriter {

  private final OrganizationRepository organizations;
  private final OrganizationMemberRepository members;
  private final UserProfileRepository users;

  OrganizationWriter(
      OrganizationRepository organizations,
      OrganizationMemberRepository members,
      UserProfileRepository users) {
    this.organizations = organizations;
    this.members = members;
    this.users = users;
  }

  @Transactional
  OrganizationMember create(String name, String ownerId) {
    UserProfile owner = users.getReferenceById(ownerId);
    Organization organization = organizations.save(new Organization(name, owner));
    return members.save(new OrganizationMember(organization, owner, OrganizationRole.OWNER));
  }
}
