package com.ideaconnection.user.org;

public record MemberResponse(String userId, String displayName, OrganizationRole role) {

  static MemberResponse from(OrganizationMember member) {
    return new MemberResponse(
        member.getUser().getId(), member.getUser().getDisplayName(), member.getRole());
  }
}
