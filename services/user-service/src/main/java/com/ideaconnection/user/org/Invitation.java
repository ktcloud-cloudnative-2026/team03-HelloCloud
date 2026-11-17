package com.ideaconnection.user.org;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "invitations")
class Invitation {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "org_id", nullable = false, updatable = false)
  private Long orgId;

  @Column(name = "token_hash", nullable = false, updatable = false, columnDefinition = "char(64)")
  private String tokenHash;

  @Column(name = "created_by", nullable = false, updatable = false)
  private String createdBy;

  @Column(name = "accepted_by")
  private String acceptedBy;

  @Column(name = "accepted_at")
  private Instant acceptedAt;

  @Column(name = "expires_at", nullable = false, updatable = false)
  private Instant expiresAt;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected Invitation() {}

  Invitation(Long orgId, String tokenHash, String createdBy, Instant expiresAt) {
    this.orgId = orgId;
    this.tokenHash = tokenHash;
    this.createdBy = createdBy;
    this.expiresAt = expiresAt;
  }

  Long getId() {
    return id;
  }

  Long getOrgId() {
    return orgId;
  }

  Instant getAcceptedAt() {
    return acceptedAt;
  }

  Instant getExpiresAt() {
    return expiresAt;
  }

  boolean isExpiredAt(Instant now) {
    return !expiresAt.isAfter(now);
  }
}
