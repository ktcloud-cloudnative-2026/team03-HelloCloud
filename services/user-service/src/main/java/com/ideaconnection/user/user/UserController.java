package com.ideaconnection.user.user;

import com.ideaconnection.common.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class UserController {

  private final UserProfileService profiles;

  UserController(UserProfileService profiles) {
    this.profiles = profiles;
  }

  @GetMapping("/api/users/me")
  UserResponse me(CurrentUser user) {
    return UserResponse.from(profiles.getOrCreate(user));
  }

  @PatchMapping("/api/users/me")
  UserResponse rename(CurrentUser user, @RequestBody UpdateProfileRequest request) {
    return UserResponse.from(profiles.rename(user, request.displayName()));
  }
}
