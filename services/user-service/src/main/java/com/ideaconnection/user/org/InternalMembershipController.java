package com.ideaconnection.user.org;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** 다른 서비스가 소속을 확인하는 내부 API. 게이트웨이는 /internal을 외부에 열지 않는다. */
@RestController
class InternalMembershipController {

  private final OrganizationService organizations;

  InternalMembershipController(OrganizationService organizations) {
    this.organizations = organizations;
  }

  @GetMapping("/internal/users/orgs/{orgId}/members/{userId}")
  MembershipResponse membership(@PathVariable Long orgId, @PathVariable String userId) {
    return organizations
        .membership(orgId, userId)
        .map(role -> new MembershipResponse(true, role))
        .orElse(new MembershipResponse(false, null));
  }
}
