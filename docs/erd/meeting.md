# meeting ERD

[← ERD](README.md)

DB: PostgreSQL

```mermaid
erDiagram
  MEETINGS ||--o{ MEETING_PARTICIPANTS : "참여"
  MEETINGS ||--o| TRANSCRIPTS : "변환 결과"
  MEETINGS {
    bigint id PK
    bigint org_id
    varchar title
    varchar livekit_room_name UK
    varchar status "OPEN 또는 ENDED"
    varchar created_by
    varchar egress_id
    timestamptz ended_at
    timestamptz created_at
    timestamptz updated_at
  }
  MEETING_PARTICIPANTS {
    bigint id PK
    bigint meeting_id FK
    varchar user_id
    timestamptz first_joined_at
  }
  TRANSCRIPTS {
    bigint id PK
    bigint meeting_id FK
    varchar status "PENDING RUNNING DONE FAILED"
    varchar audio_path
    text content
    int attempts
    timestamptz created_at
    timestamptz updated_at
  }
```

| 표 | 꼭 지킬 것 | 이유 |
|---|---|---|
| `meeting_participants` | `meeting_id + user_id` 중복 금지 | 다시 들어와도 한 번만 기록합니다 |
| `transcripts` | `meeting_id` 중복 금지 | 종료 알림이 두 번 와도 작업이 하나입니다 |
| `transcripts` | 변환이 끝나면 `audio_path`의 원본 음성을 지웁니다 | 원본 음성은 변환 후 삭제합니다(US-24) |
