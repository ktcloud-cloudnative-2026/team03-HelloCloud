package com.ideaconnection.user.org;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {

  @Query(
      value =
          "select m from OrganizationMember m join fetch m.organization o"
              + " where m.user.id = :userId order by o.id",
      countQuery = "select count(m) from OrganizationMember m where m.user.id = :userId")
  Page<OrganizationMember> findPageByUserId(@Param("userId") String userId, Pageable pageable);
}
