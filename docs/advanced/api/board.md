# board API

[← API 명세](README.md) · 데이터: [ERD](../erd/board.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 컬럼 | 보드를 만들면 Todo, In Progress, Done을 자동으로 만듭니다 | 컬럼 관리 화면 없이 바로 쓸 수 있습니다 |
| 카드 순서 | `position` 숫자를 1000 간격으로 둡니다 | 카드 사이로 옮길 때 다른 카드를 거의 고치지 않습니다 |
| 동시 이동 | 마지막 요청을 저장합니다 | 가장 단순합니다. **포기하는 점:** 먼저 옮긴 내용이 덮일 수 있습니다 |
| 메시지 → 카드 | 메시지당 카드 1개 | 다시 시도해도 카드가 늘지 않습니다 |
| 화면 갱신 | 2초마다 조회 | 공통 규칙의 결정입니다(US-21) |

## 2. 외부 API

모두 로그인 토큰과 조직 소속이 필요합니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/boards?orgId=` | 멤버 | 보드 목록 | 200 | 403 | US-20 |
| `POST /api/boards` | 멤버 | 보드와 기본 컬럼 생성 | 201 | 400, 403 | US-20 |
| `GET /api/boards/{id}` | 멤버 | 보드와 컬럼 조회 | 200 | 403, 404 | US-20 |
| `GET /api/boards/{id}/cards` | 멤버 | 보드의 전체 카드 조회. 화면 갱신에 사용 | 200 | 403, 404 | US-20, US-21 |
| `POST /api/boards/{id}/cards` | 멤버 | 카드 생성 | 201 | 400, 403, 404 | US-20 |
| `PATCH /api/boards/{id}/cards/{cardId}` | 멤버 | 제목, 내용, 담당자, 기간 수정 | 200 | 400, 403, 404 | US-20 |
| `PATCH /api/boards/{id}/cards/{cardId}/position` | 멤버 | 카드 이동 | 200 | 400, 403, 404 | US-21 |
| `DELETE /api/boards/{id}/cards/{cardId}` | 멤버 | 카드 삭제 | 204 | 403, 404 | US-20 |
| `GET /api/boards/{id}/timeline` | 멤버 | 시작일과 마감일이 모두 있는 카드 조회 | 200 | 403, 404 | US-22 |

`GET /api/boards/{id}/cards`는 한 화면에 모두 보여 주므로 페이지를 나누지 않습니다.

### 요청과 응답 예시

`POST /api/boards/{id}/cards`

```json
{ "columnId": "1", "title": "로그인 화면", "description": "", "assigneeId": "3f2c8e1a-...", "startDate": "2026-11-06", "dueDate": "2026-11-13" }
```

`PATCH /api/boards/{id}/cards/{cardId}/position`

```json
{ "columnId": "2", "position": 1500 }
```

카드 응답

```json
{ "id": "10", "boardId": "1", "columnId": "2", "title": "로그인 화면", "description": "", "assigneeId": "3f2c8e1a-...", "startDate": "2026-11-06", "dueDate": "2026-11-13", "position": 1500, "sourceChannelId": null, "sourceMessageId": null }
```

## 3. 내부 API

| 주소 | 호출하는 곳 | 사용자 확인 | 응답 | 요구사항 |
|---|---|---|---|---|
| `POST /internal/boards/{boardId}/cards` | chat | 로그인 토큰 전달 | 새 카드 201, 이미 있으면 기존 카드 200 | US-09 |

```json
{
  "orgId": "1",
  "title": "로그인 오류 확인",
  "content": "메시지 원문",
  "sourceMessageId": "6721f0a3",
  "sourceChannelId": "10"
}
```

- 카드는 보드의 첫 번째 컬럼에 만듭니다.
- 요청한 사용자는 넘겨받은 토큰에서 확인합니다.
- 원본으로 이동할 수 있도록 `sourceChannelId`와 `sourceMessageId`를 저장합니다.
- 보드가 요청의 `orgId`와 다른 조직이면 403입니다.

## 4. 만들 때 확인할 것

- 카드를 옮기고 새로고침해도 위치가 유지되는지(US-21)
- 다른 사용자 화면에 3초 안에 보이는지(US-21)
- 같은 메시지로 동시에 두 번 요청해도 카드가 하나인지(US-09)
- 다른 조직의 보드와 카드에 접근하면 403이 나오는지(US-05)

## 5. 이번에 만들지 않는 것

보드 수정과 삭제, 컬럼 추가와 수정, 카드 댓글은 요구사항에 없어 빼두었습니다.
