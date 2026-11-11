CREATE TABLE users (
    id           VARCHAR(64)  NOT NULL,
    email        VARCHAR(255) NULL,
    display_name VARCHAR(512) NOT NULL,
    created_at   DATETIME(6)  NOT NULL,
    updated_at   DATETIME(6)  NOT NULL,
    PRIMARY KEY (id)
) CHARACTER SET utf8mb4;
