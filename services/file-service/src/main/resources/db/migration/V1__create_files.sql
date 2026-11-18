CREATE TABLE files (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 org_id BIGINT NOT NULL,
 name VARCHAR(255) NOT NULL,
 content_type VARCHAR(255) NOT NULL,
 size_bytes BIGINT NOT NULL,
 storage_key VARCHAR(512) NOT NULL,
 status VARCHAR(16) NOT NULL,
 uploaded_by VARCHAR(64) NOT NULL,
 completed_at DATETIME(6),
 created_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL,
 UNIQUE KEY uk_files_storage_key (storage_key),
 KEY idx_files_org_status_created (org_id, status, created_at, id)
) CHARACTER SET utf8mb4;
