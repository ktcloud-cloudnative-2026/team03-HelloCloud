package com.ideaconnection.user.org;

import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.web.PageQuery;
import com.ideaconnection.common.web.PageResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orgs")
class OrganizationController {

  private final OrganizationService organizations;

  OrganizationController(OrganizationService organizations) {
    this.organizations = organizations;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  OrganizationResponse create(CurrentUser user, @RequestBody CreateOrganizationRequest request) {
    return OrganizationResponse.from(organizations.create(user, request.name()));
  }

  @GetMapping
  PageResponse<OrganizationResponse> list(
      CurrentUser user,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size) {
    return organizations.list(user.id(), PageQuery.of(page, size));
  }

  @GetMapping("/{id}/members")
  PageResponse<MemberResponse> members(
      CurrentUser user,
      @PathVariable Long id,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size) {
    return organizations.members(id, user.id(), PageQuery.of(page, size));
  }

  @DeleteMapping("/{id}/members/{userId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void removeMember(CurrentUser user, @PathVariable Long id, @PathVariable String userId) {
    organizations.removeMember(id, user.id(), userId);
  }
}
