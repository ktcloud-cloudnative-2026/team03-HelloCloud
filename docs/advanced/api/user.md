# user API

[← API 명세](README.md) · 데이터: [ERD](../erd/user.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 초대 링크 기한 | 7일 | 링크가 유출되어도 시간이 지나면 쓸 수 없습니다 |
| OWNER 탈퇴 | 나갈 수 없음 | 소유자 없는 조직이 생기지 않습니다. **포기하는 점:** 소유자를 바꾸는 기능이 없습니다 |
| 소속 확인 | 호출한 서비스의 로그인 토큰을 받아 확인합니다 | 서비스 간 호출의 결정입니다 |
| 이메일 조회 | 토큰 없이 Istio 허용 목록으로 확인합니다 | 예약 알림에는 로그인 사용자가 없습니다 |

## 2. 외부 API

모두 로그인 토큰이 필요합니다. 공통 에러 외에 이 서비스에서 생기는 에러만 적었습니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/users/me` | 로그인 | 내 프로필 조회. 첫 로그인이면 생성 | 200 | | US-01 |
| `GET /api/orgs` | 로그인 | 내가 속한 조직 목록 | 200 | | US-02 |
| `POST /api/orgs` | 로그인 | 조직 생성. 프로필이 없으면 먼저 만든다. 만든 사람은 OWNER | 201 | 400 | US-02 |
| `GET /api/orgs/{id}/members` | 멤버 | 멤버 목록 | 200 | 403, 404 | US-05 |
| `POST /api/orgs/{id}/invitations` | OWNER | 초대 링크 생성 | 201 | 403, 404 | US-03 |
| `POST /api/invitations/{token}/accept` | 로그인 | 초대 수락. MEMBER로 가입 | 200 | 404, 409 | US-03 |
| `DELETE /api/orgs/{id}/members/{userId}` | OWNER 또는 본인 | 멤버 제거 또는 탈퇴 | 204 | 403, 404, 409 | US-04 |

### 요청과 응답 예시

`GET /api/users/me`

```json
{ "id": "3f2c8e1a-...", "email": "a@example.com", "displayName": "김민준" }
```

`POST /api/orgs`

```json
{ "name": "HelloCloud" }
```

```json
{ "id": "1", "name": "HelloCloud", "role": "OWNER", "createdAt": "2026-11-06T09:00:00+09:00" }
```

조직 이름은 앞뒤 공백을 뺀 1자 이상 100자 이하입니다. `GET /api/orgs`의 항목은 `POST /api/orgs`의 응답과 같습니다.

`GET /api/orgs`와 `GET /api/orgs/{id}/members`는 공통 규칙의 목록 형식(`items`, `page`, `size`, `total`)을 씁니다. 멤버 목록의 항목은 아래와 같습니다.

```json
{ "userId": "3f2c8e1a-...", "displayName": "김민준", "role": "OWNER" }
```

`POST /api/orgs/{id}/invitations`

```json
{ "inviteUrl": "https://도메인/invite/토큰", "expiresAt": "2026-11-13T09:00:00+09:00" }
```

초대 토큰 원문은 이 응답에서 한 번만 보여 줍니다.

`POST /api/invitations/{token}/accept`

```json
{ "orgId": "1", "role": "MEMBER" }
```

### 에러 코드

| 상태 코드 | `code` | 상황 |
|---|---|---|
| 404 | `INVITATION_NOT_FOUND` | 없는 초대 링크 |
| 409 | `INVITATION_ALREADY_USED` | 이미 사용한 링크 |
| 409 | `INVITATION_EXPIRED` | 기한이 지난 링크 |
| 409 | `ALREADY_MEMBER` | 이미 조직 멤버. 링크는 사용 처리하지 않습니다 |
| 409 | `OWNER_CANNOT_LEAVE` | OWNER는 나갈 수 없음 |

## 3. 내부 API

브라우저에서 호출할 수 없습니다. 형식은 [서비스끼리 쓰는 내부 API](README.md#서비스끼리-쓰는-내부-api)를 따릅니다.

| 주소 | 호출하는 곳 | 사용자 확인 | 응답 | 요구사항 |
|---|---|---|---|---|
| `GET /internal/users/orgs/{orgId}/members/{userId}` | 조직 서비스 | 로그인 토큰 전달 | `{ "member": true, "role": "OWNER" }` 또는 `{ "member": false }` | US-04, US-05 |
| `POST /internal/users/emails` | notification | 토큰 없음, Istio 허용 목록 | `{ "users": [], "notFound": [] }` | US-17, US-18 |

이메일 조회는 ID 목록을 한 번에 받습니다. 이메일만 돌려주고 한 번에 최대 100명까지 받습니다.

```json
{ "userIds": ["a", "b"] }
```

```json
{ "users": [{ "id": "a", "email": "a@example.com" }], "notFound": ["b"] }
```

## 4. 멤버가 나갈 때

1. `organization_members` 행을 지웁니다. 다른 서비스의 소속 기억은 3초 뒤 사라지므로 새 요청은 5초 안에 막힙니다.
2. Redis로 `MEMBER_REMOVED`를 알려, chat, document, meeting이 그 사용자의 실시간 연결을 끊습니다.

```json
{ "type": "MEMBER_REMOVED", "orgId": "1", "userId": "3f2c8e1a-..." }
```

## 5. 만들 때 확인할 것

- 첫 로그인을 동시에 두 번 요청해도 프로필이 하나만 생기는지
- 같은 초대 링크를 동시에 수락해도 한 명만 성공하는지
- 멤버 제거 후 5초 안에 다른 조직 API가 403을 돌려주는지(US-04)
- OWNER가 아닌 멤버가 초대 링크를 만들면 403이 나오는지

## 6. 이번에 만들지 않는 것

프로필 수정, 조직 이름 변경과 삭제, 소유자 변경, 초대 링크 목록과 취소는 요구사항에 없어 빼두었습니다. 필요해지면 추가합니다.
