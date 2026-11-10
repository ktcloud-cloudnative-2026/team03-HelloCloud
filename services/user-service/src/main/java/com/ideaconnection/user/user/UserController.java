package com.ideaconnection.user.user;

import com.ideaconnection.common.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class UserController {

  private final UserProfileService profiles;

  UserController(UserProfileService profiles) {
    this.profiles = profiles;
  }

  @GetMapping("/api/users/me")
  UserResponse me(CurrentUser user) {
    UserProfile profile = profiles.getOrCreate(user);
    return new UserResponse(profile.getId(), profile.getEmail(), profile.getDisplayName());
  }
}
