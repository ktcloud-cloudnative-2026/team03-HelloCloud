package com.ideaconnection.file;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface FileRepository extends JpaRepository<FileRecord, Long> {
  Page<FileRecord> findByOrgIdAndStatus(Long orgId, String status, Pageable pageable);

  @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @org.springframework.data.jpa.repository.Query("select f from FileRecord f where f.id = :id")
  java.util.Optional<FileRecord> findForUpdate(
      @org.springframework.data.repository.query.Param("id") Long id);
}
