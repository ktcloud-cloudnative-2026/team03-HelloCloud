CREATE TABLE organizations (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    name       VARCHAR(100) NOT NULL,
    created_by VARCHAR(64)  NOT NULL,
    created_at DATETIME(6)  NOT NULL,
    updated_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_organizations_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) CHARACTER SET utf8mb4;

CREATE TABLE organization_members (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    org_id     BIGINT      NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    role       VARCHAR(16) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_organization_members_org_user (org_id, user_id),
    CONSTRAINT fk_organization_members_org FOREIGN KEY (org_id) REFERENCES organizations (id),
    CONSTRAINT fk_organization_members_user FOREIGN KEY (user_id) REFERENCES users (id)
) CHARACTER SET utf8mb4;
