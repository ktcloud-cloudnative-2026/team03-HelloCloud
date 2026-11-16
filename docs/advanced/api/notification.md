# notification API

[← API 명세](README.md) · 데이터: [ERD](../erd/notification.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 예약 시각 | 보내는 사람이 정합니다. 화면은 수신자의 근무시간을 함께 보여 줍니다 | 예약 시각부터 5초 기준을 지키기 쉽습니다. **포기하는 점:** 근무시간 밖으로 자동 조정하지 않습니다 |
| 수신 경로 | 수신자가 웹, 이메일을 선택합니다. 기본값은 웹만 켜짐 | US-17 |
| 발송 처리 | 1초마다 보낼 알림을 찾아 `SKIP LOCKED`로 가져갑니다 | 서버가 여러 대여도 같은 알림을 두 번 보내지 않습니다 |
| 웹 알림 | 화면이 3초마다 조회합니다 | 공통 규칙의 결정입니다 |
| 장애 알림 | 환경 변수로 정한 장애 채널 1개로 보냅니다 | 서비스 간 호출의 결정입니다 |

## 2. 외부 API

모두 로그인 토큰이 필요합니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/notifications/me/working-hours` | 본인 | 근무시간 조회 | 200 | | US-17 |
| `PUT /api/notifications/me/working-hours` | 본인 | 근무시간 저장 | 200 | 400 | US-17 |
| `GET /api/notifications/me/channels` | 본인 | 수신 경로 조회 | 200 | | US-17 |
| `PUT /api/notifications/me/channels` | 본인 | 수신 경로 저장 | 200 | 400 | US-17 |
| `POST /api/notifications/scheduled` | 멤버 | 예약 알림 생성 | 201 | 400, 403 | US-17 |
| `DELETE /api/notifications/scheduled/{id}` | 보낸 사람 | 발송 전 예약 취소 | 204 | 403, 404, 409 | US-17 |
| `POST /api/notifications` | 멤버 | 지금 보내기 | 201 | 400, 403 | US-18 |
| `GET /api/notifications/me?orgId=&page=&size=` | 멤버 | 내 웹 알림 조회 | 200 | 403 | US-17, US-18 |
| `PATCH /api/notifications/me/{id}/read` | 본인 | 읽음 처리 | 200 | 404 | US-17, US-18 |

### 요청 예시

`POST /api/notifications/scheduled`

```json
{ "orgId": "1", "title": "회의 안내", "body": "10시 회의입니다.", "recipientIds": ["a", "b"], "scheduledAt": "2026-11-06T09:00:00+09:00" }
```

`PUT /api/notifications/me/channels`

```json
{ "webEnabled": true, "emailEnabled": false }
```

`PUT /api/notifications/me/working-hours`

```json
{ "workStart": "09:00", "workEnd": "18:00", "timeZone": "Asia/Seoul" }
```

## 3. 내부 API

| 주소 | 호출하는 곳 | 사용자 확인 | 응답 | 요구사항 |
|---|---|---|---|---|
| `POST /internal/notifications/alertmanager` | AlertManager | 토큰 없음, Istio 허용 목록 | 200 또는 503 | US-19 |

요청 본문은 AlertManager의 웹훅 형식을 따릅니다. 장애 채널은 환경 변수 `ALERT_ORG_ID`, `ALERT_CHANNEL_ID`로 정합니다.

이 서비스가 호출하는 곳은 아래와 같습니다.

| 대상 | 주소 | 언제 |
|---|---|---|
| user | `GET /internal/users/orgs/{orgId}/members/{userId}` | 수신자가 멤버인지 확인할 때. 보낸 사람의 토큰 전달 |
| user | `POST /internal/users/emails` | 이메일을 보내기 전 |
| chat | `POST /internal/chat/channels/{channelId}/system-messages` | 장애 알림 전달 |
| Gmail | 외부 API | 이메일 발송 |

## 4. 만들 때 확인할 것

- 예약 알림이 예약 시각부터 5초 안에 발송되는지 3회 측정(US-17)
- 지금 보내기가 5초 안에 발송되는지 3회 측정(US-18)
- 서버가 2대여도 같은 알림이 두 번 가지 않는지
- 수신자가 선택한 경로로만 전달되는지(US-17)
- 장애 알림이 5초 안에 채팅 채널에 도착하는지(US-19)
- 예약과 발송 사이에 조직을 나간 사용자의 처리 방법

## 5. 이번에 만들지 않는 것

예약 수정, 데스크톱 푸시, AI 발송 시간 추천, 근무시간에 따른 자동 조정은 빼두었습니다.
