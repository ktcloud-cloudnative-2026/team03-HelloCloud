# calendar API

[← API 명세](README.md) · 데이터: [ERD](../erd/calendar.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 중복 예약 방지 | 회의실 행을 잠근 뒤 겹침을 확인하고(US-16), DB의 시간 겹침 금지 규칙도 함께 겁니다 | 코드에 실수가 있어도 DB가 막습니다 |
| 예약과 일정 | 예약하면 팀 일정을 함께 만듭니다 | 예약이 캘린더에 바로 보입니다(US-15) |
| Google 반영 대상 | 예약한 사람만 | 단순합니다. **포기하는 점:** 참석자 일정에는 들어가지 않습니다 |
| Google 반영 방식 | Redis Streams 메시지 큐 | 학습용으로 결정했습니다 |
| 팀 일정 수정 | 작성자 또는 OWNER | 다른 멤버의 실수를 막습니다 |
| 화면 갱신 | 캘린더를 보는 동안 2초마다 조회 | 3초 기준을 쉽게 지킵니다(US-15) |

## 2. 외부 API

모두 로그인 토큰과 조직 소속이 필요합니다.

### 일정

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/calendars/team/events?orgId=&from=&to=` | 멤버 | 팀 일정 조회 | 200 | 400, 403 | US-13 |
| `POST /api/calendars/team/events` | 멤버 | 팀 일정 생성 | 201 | 400, 403 | US-13 |
| `PATCH /api/calendars/team/events/{id}` | 작성자 또는 OWNER | 팀 일정 수정 | 200 | 400, 403, 404 | US-13 |
| `DELETE /api/calendars/team/events/{id}` | 작성자 또는 OWNER | 팀 일정 삭제 | 204 | 403, 404 | US-13 |
| `GET /api/calendars/me/events?orgId=&from=&to=` | 본인 | 개인 일정 조회 | 200 | 400, 403 | US-14 |
| `POST /api/calendars/me/events` | 본인 | 개인 일정 생성 | 201 | 400, 403 | US-14 |
| `PATCH /api/calendars/me/events/{id}` | 본인 | 개인 일정 수정 | 200 | 400, 404 | US-14 |
| `DELETE /api/calendars/me/events/{id}` | 본인 | 개인 일정 삭제 | 204 | 404 | US-14 |

예약에서 만들어진 팀 일정은 예약 API로만 바꿉니다. 일정 API로 바꾸면 409입니다.

### 회의실

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/rooms?orgId=` | 멤버 | 회의실 목록 | 200 | 403 | US-15 |
| `POST /api/rooms` | OWNER | 회의실 생성 | 201 | 400, 403 | US-15 |
| `GET /api/rooms/{id}/reservations?from=&to=` | 멤버 | 예약 조회 | 200 | 400, 403, 404 | US-15 |
| `POST /api/rooms/{id}/reservations` | 멤버 | 예약 | 201 | 400, 403, 404, 409 | US-15, US-16 |
| `PATCH /api/rooms/{id}/reservations/{reservationId}` | 예약자 또는 OWNER | 예약 변경 | 200 | 400, 403, 404, 409 | US-15, US-16 |
| `DELETE /api/rooms/{id}/reservations/{reservationId}` | 예약자 또는 OWNER | 예약 취소 | 204 | 403, 404 | US-15 |

### Google Calendar 연동

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/calendars/me/google-calendar` | 본인 | 연동 상태 조회 | 200 | | US-15 |
| `POST /api/calendars/me/google-calendar` | 본인 | 연동 시작, Google 승인 주소 받기 | 200 | | US-15 |
| `GET /api/calendars/me/google-calendar/callback` | Google 복귀 | 승인 결과 처리 | 302 | 400 | US-15 |
| `DELETE /api/calendars/me/google-calendar` | 본인 | 연동 해제 | 204 | | US-15 |

### 요청과 에러 예시

`POST /api/rooms/{id}/reservations`

```json
{ "orgId": "1", "title": "스프린트 회의", "startAt": "2026-11-06T09:00:00+09:00", "endAt": "2026-11-06T10:00:00+09:00" }
```

| 상태 코드 | `code` | 상황 |
|---|---|---|
| 400 | `INVALID_TIME_RANGE` | 종료 시각이 시작 시각보다 이름 |
| 409 | `ROOM_ALREADY_RESERVED` | 이미 예약된 시간 |
| 409 | `EVENT_MANAGED_BY_RESERVATION` | 예약에서 만든 일정을 일정 API로 바꾸려 함 |

## 3. 내부 처리: Google 반영

이 처리는 calendar 서비스 안에서 Redis Streams로 전달합니다.

1. 예약, 변경, 취소를 PostgreSQL에 저장합니다.
2. 예약한 사람이 연동해 두었으면 작업을 Redis에 넣습니다.
3. 작업 프로그램이 작업을 가져가 Google에 반영하고 처리 완료를 표시합니다.

```json
{ "action": "CREATE", "reservationId": "1024", "userId": "3f2c8e1a-..." }
```

**포기하는 점:** Redis가 멈추면 예약은 성공해도 Google 반영이 빠질 수 있습니다.

## 4. 만들 때 확인할 것

- 같은 회의실을 동시에 예약하면 한 건만 성공하고 나머지는 409인지(US-16)
- 예약 변경과 취소가 3초 안에 캘린더에 보이는지(US-15)
- Google에 1분 안에 반영되는지(US-15)
- 같은 작업을 두 번 처리해도 Google 일정이 하나인지
- 다른 사람의 개인 일정을 조회할 수 없는지(US-14)
- 내부망에서 Google 승인과 복귀 주소가 동작하는지. 아직 확인하지 않았습니다

## 5. 이번에 만들지 않는 것

반복 일정, 참석자 초대, 회의실 수정과 삭제, Google에서 우리 서비스로 가져오기는 빼두었습니다.
