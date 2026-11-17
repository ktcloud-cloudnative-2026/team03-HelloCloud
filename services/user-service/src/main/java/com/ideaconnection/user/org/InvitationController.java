package com.ideaconnection.user.org;

import com.ideaconnection.common.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class InvitationController {

  private final InvitationService invitations;

  InvitationController(InvitationService invitations) {
    this.invitations = invitations;
  }

  @PostMapping("/api/orgs/{id}/invitations")
  @ResponseStatus(HttpStatus.CREATED)
  InvitationResponse create(CurrentUser user, @PathVariable Long id) {
    return invitations.create(user, id);
  }

  @PostMapping("/api/invitations/{token}/accept")
  AcceptInvitationResponse accept(CurrentUser user, @PathVariable String token) {
    return invitations.accept(user, token);
  }
}
