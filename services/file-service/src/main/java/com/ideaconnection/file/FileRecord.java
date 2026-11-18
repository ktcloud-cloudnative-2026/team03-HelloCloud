package com.ideaconnection.file;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "files")
class FileRecord {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  Long id;

  @Column(name = "org_id", nullable = false)
  Long orgId;

  @Column(nullable = false)
  String name;

  @Column(name = "content_type", nullable = false)
  String contentType;

  @Column(name = "size_bytes", nullable = false)
  long sizeBytes;

  @Column(name = "storage_key", nullable = false, unique = true, length = 512)
  String storageKey;

  @Column(nullable = false, length = 16)
  String status = "UPLOADING";

  @Column(name = "uploaded_by", nullable = false, length = 64)
  String uploadedBy;

  @Column(name = "completed_at")
  Instant completedAt;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  Instant createdAt;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  Instant updatedAt;

  protected FileRecord() {}

  FileRecord(
      Long orgId,
      String name,
      String contentType,
      long sizeBytes,
      String storageKey,
      String uploadedBy) {
    this.orgId = orgId;
    this.name = name;
    this.contentType = contentType;
    this.sizeBytes = sizeBytes;
    this.storageKey = storageKey;
    this.uploadedBy = uploadedBy;
  }
}
