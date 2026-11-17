package com.ideaconnection.user.org;

import com.ideaconnection.common.error.ApiException;
import com.ideaconnection.common.security.CurrentUser;
import com.ideaconnection.common.web.ApiTime;
import com.ideaconnection.user.user.UserProfileService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class InvitationService {

  private static final Duration VALIDITY = Duration.ofDays(7);
  private static final int TOKEN_BYTES = 32;

  private final SecureRandom random = new SecureRandom();
  private final OrganizationService organizations;
  private final UserProfileService profiles;
  private final InvitationRepository invitations;
  private final InvitationWriter writer;
  private final String baseUrl;

  InvitationService(
      OrganizationService organizations,
      UserProfileService profiles,
      InvitationRepository invitations,
      InvitationWriter writer,
      InviteProperties properties) {
    this.organizations = organizations;
    this.profiles = profiles;
    this.invitations = invitations;
    this.writer = writer;
    this.baseUrl = properties.baseUrl();
  }

  public InvitationResponse create(CurrentUser user, Long orgId) {
    if (organizations.requireMember(orgId, user.id()).getRole() != OrganizationRole.OWNER) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "조직 소유자만 초대할 수 있습니다.");
    }
    String token = newToken();
    Instant expiresAt = Instant.now().plus(VALIDITY);
    writer.create(new Invitation(orgId, hash(token), user.id(), expiresAt));
    return new InvitationResponse(baseUrl + "/invite/" + token, ApiTime.format(expiresAt));
  }

  // 프로필 생성이 수락 트랜잭션에 묶이지 않도록 여기에는 트랜잭션을 걸지 않는다.
  public AcceptInvitationResponse accept(CurrentUser user, String token) {
    Invitation invitation =
        invitations
            .findByTokenHash(hash(token))
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.NOT_FOUND, "INVITATION_NOT_FOUND", "초대 링크를 찾을 수 없습니다."));
    Instant now = Instant.now();
    if (invitation.getAcceptedAt() != null) {
      throw alreadyUsed();
    }
    if (invitation.isExpiredAt(now)) {
      throw expired();
    }
    if (organizations.membership(invitation.getOrgId(), user.id()).isPresent()) {
      throw alreadyMember();
    }
    profiles.getOrCreate(user);
    try {
      if (!writer.accept(invitation, user.id(), now)) {
        throw invitation.isExpiredAt(now) ? expired() : alreadyUsed();
      }
    } catch (DataIntegrityViolationException e) {
      throw alreadyMember();
    }
    return new AcceptInvitationResponse(
        String.valueOf(invitation.getOrgId()), OrganizationRole.MEMBER);
  }

  private String newToken() {
    byte[] bytes = new byte[TOKEN_BYTES];
    random.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static String hash(String token) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static ApiException alreadyUsed() {
    return new ApiException(HttpStatus.CONFLICT, "INVITATION_ALREADY_USED", "이미 사용한 초대 링크입니다.");
  }

  private static ApiException expired() {
    return new ApiException(HttpStatus.CONFLICT, "INVITATION_EXPIRED", "기한이 지난 초대 링크입니다.");
  }

  private static ApiException alreadyMember() {
    return new ApiException(HttpStatus.CONFLICT, "ALREADY_MEMBER", "이미 이 조직의 멤버입니다.");
  }
}
