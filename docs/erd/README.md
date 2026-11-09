# ERD

[← README](../../README.md)

서비스마다 자기 DB를 가집니다. 다른 서비스의 DB는 직접 읽지 않고 API를 호출합니다.

| 서비스 | DB | 파일 |
|---|---|---|
| user | MySQL | [user.md](user.md) |
| chat | MongoDB | [chat.md](chat.md) |
| file | MySQL | [file.md](file.md) |
| calendar | PostgreSQL | [calendar.md](calendar.md) |
| notification | MySQL | [notification.md](notification.md) |
| board | MySQL | [board.md](board.md) |
| meeting | PostgreSQL | [meeting.md](meeting.md) |
| document | MongoDB | [document.md](document.md) |

- MySQL · PostgreSQL은 Mermaid 그림으로, MongoDB는 문서 구조 예시로 씁니다. GitHub에서 바로 그림으로 보입니다
- 원본은 노션의 서비스별 ERD · API 페이지입니다. 바꿀 때는 노션과 이 폴더를 함께 고칩니다
- 테이블 변경 방법과 시드 데이터는 담당자가 구현하면서 정하고 이유를 PR에 적습니다

## 데이터 규칙

### 모든 DB 공통

- 서비스는 자기 DB만 직접 다룹니다. 다른 서비스 데이터는 ID만 저장하고, 외래 키와 JOIN을 쓰지 않습니다
- 조직 데이터에는 `org_id`를 넣고, 조회할 때 항상 조건에 포함합니다(US-05)
- 비밀번호는 저장하지 않습니다. Keycloak이 관리합니다

### MySQL · PostgreSQL

| 항목 | 규칙 | 예 |
|---|---|---|
| 표와 열 이름 | 복수형 표, `snake_case` | `room_reservations`, `start_at` |
| 기본 키 | `id` | |
| 생성 · 수정 시각 | `created_at`, `updated_at` | |
| 시각 저장 | UTC | |

같은 서비스 안에서는 외래 키를 씁니다.

### MongoDB

| 항목 | 규칙 | 예 |
|---|---|---|
| 컬렉션 이름 | 복수형, `camelCase` | `messages` |
| 필드 이름 | `camelCase` | `channelId` |
| 생성 · 수정 시각 | `createdAt`, `updatedAt` | |

항목이 늘어나 계속 커지는 목록은 문서 안에 넣지 않습니다. 문서 하나의 크기 제한이 16MB이기 때문입니다.
