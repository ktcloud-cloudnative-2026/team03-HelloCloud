CREATE TABLE invitations (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    org_id      BIGINT      NOT NULL,
    token_hash  CHAR(64)    NOT NULL,
    created_by  VARCHAR(64) NOT NULL,
    accepted_by VARCHAR(64) NULL,
    accepted_at DATETIME(6) NULL,
    expires_at  DATETIME(6) NOT NULL,
    created_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_invitations_token_hash (token_hash),
    CONSTRAINT fk_invitations_org FOREIGN KEY (org_id) REFERENCES organizations (id),
    CONSTRAINT fk_invitations_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_invitations_accepted_by FOREIGN KEY (accepted_by) REFERENCES users (id)
) CHARACTER SET utf8mb4;
