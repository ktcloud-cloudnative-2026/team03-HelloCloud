package com.ideaconnection.user.user;

public record UserResponse(String id, String email, String displayName) {

  static UserResponse from(UserProfile profile) {
    return new UserResponse(profile.getId(), profile.getEmail(), profile.getDisplayName());
  }
}
