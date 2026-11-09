# notification ERD

[← ERD](README.md)

DB: MySQL

```mermaid
erDiagram
  NOTIFICATIONS ||--o{ NOTIFICATION_RECIPIENTS : "수신자"
  NOTIFICATIONS {
    bigint id PK
    bigint org_id
    varchar sender_id
    varchar title
    text body
    varchar type "SCHEDULED 또는 IMMEDIATE"
    varchar status "PENDING SENT FAILED CANCELED"
    datetime scheduled_at
    datetime sent_at
    datetime created_at
    datetime updated_at
  }
  NOTIFICATION_RECIPIENTS {
    bigint id PK
    bigint notification_id FK
    varchar user_id
    varchar channel "WEB 또는 EMAIL"
    varchar status "PENDING SENT FAILED"
    datetime read_at
    datetime sent_at
    datetime created_at
  }
  NOTIFICATION_SETTINGS {
    varchar user_id PK
    boolean web_enabled
    boolean email_enabled
    time work_start
    time work_end
    varchar time_zone
    datetime created_at
    datetime updated_at
  }
```

| 표 | 꼭 지킬 것 | 이유 |
|---|---|---|
| `notifications` | `status + scheduled_at` 인덱스 | 보낼 알림을 빠르게 찾습니다 |
| `notifications` | 보낼 알림은 `SKIP LOCKED`로 가져갑니다 | 서버가 여러 대여도 같은 알림을 두 번 보내지 않습니다 |
| `notification_recipients` | `notification_id + user_id + channel` 중복 금지 | 같은 경로로 두 번 보내지 않습니다 |
| `notification_settings` | 기본값은 웹만 켜짐 | 수신자가 경로를 고르기 전에도 알림을 받습니다(US-17) |
