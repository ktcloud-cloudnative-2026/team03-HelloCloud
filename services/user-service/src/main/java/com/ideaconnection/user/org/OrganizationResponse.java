package com.ideaconnection.user.org;

import com.ideaconnection.common.web.ApiTime;

public record OrganizationResponse(
    String id, String name, OrganizationRole role, String createdAt) {

  static OrganizationResponse from(OrganizationMember member) {
    Organization organization = member.getOrganization();
    return new OrganizationResponse(
        String.valueOf(organization.getId()),
        organization.getName(),
        member.getRole(),
        ApiTime.format(organization.getCreatedAt()));
  }
}
