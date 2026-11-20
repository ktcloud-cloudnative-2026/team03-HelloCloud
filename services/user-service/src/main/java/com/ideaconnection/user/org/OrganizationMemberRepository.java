package com.ideaconnection.user.org;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {

  @Query(
      value =
          "select m from OrganizationMember m join fetch m.organization o"
              + " where m.user.id = :userId order by o.id",
      countQuery = "select count(m) from OrganizationMember m where m.user.id = :userId")
  Page<OrganizationMember> findPageByUserId(@Param("userId") String userId, Pageable pageable);

  Optional<OrganizationMember> findByOrganizationIdAndUserId(Long orgId, String userId);

  @Query(
      value =
          "select m from OrganizationMember m join fetch m.user"
              + " where m.organization.id = :orgId order by m.id",
      countQuery = "select count(m) from OrganizationMember m where m.organization.id = :orgId")
  Page<OrganizationMember> findPageByOrganizationId(@Param("orgId") Long orgId, Pageable pageable);

  @Query("select m.user.id from OrganizationMember m where m.organization.id = :orgId")
  List<String> findUserIdsByOrganizationId(@Param("orgId") Long orgId);

  @Modifying
  @Query("delete from OrganizationMember m where m.organization.id = :orgId")
  int deleteByOrganizationId(@Param("orgId") Long orgId);
}
