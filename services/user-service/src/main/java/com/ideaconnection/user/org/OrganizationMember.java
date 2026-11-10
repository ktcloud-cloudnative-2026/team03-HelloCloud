package com.ideaconnection.user.org;

import com.ideaconnection.user.user.UserProfile;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "organization_members")
public class OrganizationMember {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "org_id", nullable = false, updatable = false)
  private Organization organization;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false, updatable = false)
  private UserProfile user;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private OrganizationRole role;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected OrganizationMember() {}

  OrganizationMember(Organization organization, UserProfile user, OrganizationRole role) {
    this.organization = organization;
    this.user = user;
    this.role = role;
  }

  public Organization getOrganization() {
    return organization;
  }

  public OrganizationRole getRole() {
    return role;
  }
}
