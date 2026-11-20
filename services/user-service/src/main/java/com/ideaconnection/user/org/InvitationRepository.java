package com.ideaconnection.user.org;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface InvitationRepository extends JpaRepository<Invitation, Long> {

  Optional<Invitation> findByTokenHash(String tokenHash);

  /** 아직 쓰지 않았고 기한이 남은 링크만 사용 처리한다. 동시에 수락하면 한 요청만 1을 받는다. */
  @Modifying
  @Query(
      "update Invitation i set i.acceptedBy = :userId, i.acceptedAt = :now"
          + " where i.id = :id and i.acceptedAt is null and i.expiresAt > :now")
  int markAccepted(@Param("id") Long id, @Param("userId") String userId, @Param("now") Instant now);

  @Modifying
  @Query("delete from Invitation i where i.orgId = :orgId")
  int deleteByOrgId(@Param("orgId") Long orgId);
}
