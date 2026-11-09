# calendar ERD

[← ERD](README.md)

DB: PostgreSQL

```mermaid
erDiagram
  ROOMS ||--o{ ROOM_RESERVATIONS : "예약"
  ROOM_RESERVATIONS ||--o| EVENTS : "팀 일정"
  ROOM_RESERVATIONS ||--o{ GOOGLE_EVENT_LINKS : "Google 일정"
  ROOMS {
    bigint id PK
    bigint org_id
    varchar name
    timestamptz created_at
    timestamptz updated_at
  }
  ROOM_RESERVATIONS {
    bigint id PK
    bigint org_id
    bigint room_id FK
    varchar title
    varchar reserved_by
    timestamptz start_at
    timestamptz end_at
    timestamptz created_at
    timestamptz updated_at
  }
  EVENTS {
    bigint id PK
    bigint org_id
    varchar scope "TEAM 또는 PERSONAL"
    varchar owner_id
    bigint reservation_id FK
    varchar title
    text description
    timestamptz start_at
    timestamptz end_at
    timestamptz created_at
    timestamptz updated_at
  }
  GOOGLE_CONNECTIONS {
    varchar user_id PK
    varchar refresh_token_encrypted
    varchar google_calendar_id
    timestamptz created_at
    timestamptz updated_at
  }
  GOOGLE_EVENT_LINKS {
    bigint id PK
    bigint reservation_id FK
    varchar user_id
    varchar google_event_id
    timestamptz created_at
    timestamptz updated_at
  }
```

| 표 | 꼭 지킬 것 | 이유 |
|---|---|---|
| `room_reservations` | `EXCLUDE USING gist (room_id WITH =, tstzrange(start_at, end_at) WITH &&)` | 같은 회의실의 겹치는 시간을 DB가 막습니다(US-16). `btree_gist` 확장이 필요합니다 |
| `events` | `PERSONAL`은 `owner_id` 조건으로만 조회 | 다른 사람에게 보이지 않습니다(US-14) |
| `events` | 예약하면 팀 일정을 함께 만들고, 그 일정은 예약 API로만 바꿉니다 | 예약이 캘린더에 바로 보입니다(US-15) |
| `google_connections` | 토큰을 암호화해 저장하고 응답에 넣지 않습니다 | Google 계정 접근 권한입니다 |
| `google_event_links` | `reservation_id + user_id` 중복 금지 | 작업을 다시 처리해도 Google 일정이 늘지 않습니다 |
