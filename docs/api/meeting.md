# meeting API

[← API 명세](README.md) · 데이터: [ERD](../erd/meeting.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 음성 저장 | 영상은 녹화하지 않고 음성만 임시 저장합니다 | 변환 후 지웁니다(US-24) |
| 회의 종료 감지 | LiveKit 웹훅(이벤트 알림)을 받습니다 | 사용자가 탭만 닫아도 회의 종료를 알 수 있습니다 |
| 작업 전달 | Redis Streams | 서비스 간 호출의 결정입니다 |
| 변환 결과 조회 | 입장권을 받은 참여자만 | 회의 참여자만 볼 수 있습니다(US-24) |
| 회의방 인원 | 최대 8명 | US-23 |

## 2. 외부 API

모두 로그인 토큰과 조직 소속이 필요합니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `POST /api/meetings` | 멤버 | 회의방 생성 | 201 | 400, 403 | US-25 |
| `GET /api/meetings?orgId=` | 멤버 | 회의방 목록 | 200 | 403 | US-23, US-25 |
| `GET /api/meetings/{id}/token` | 멤버 | LiveKit 입장권 받기 | 200 | 403, 404, 409 | US-23, US-25 |
| `POST /api/meetings/{id}/end` | 만든 사람 또는 OWNER | 회의 종료 | 200 | 403, 404 | US-25 |
| `GET /api/meetings/{id}/transcript` | 참여자 | 변환 상태와 결과 조회 | 200 | 403, 404 | US-24 |

퇴장, 마이크와 카메라, 참여자 목록, 화면 공유는 브라우저와 LiveKit이 직접 처리하므로 별도 API가 없습니다(US-25, US-26, US-27).

### 요청과 응답 예시

`POST /api/meetings`

```json
{ "orgId": "1", "title": "스프린트 회의" }
```

`GET /api/meetings/{id}/token`

```json
{ "livekitUrl": "wss://LiveKit 주소", "token": "입장권", "expiresAt": "2026-11-06T10:00:00+09:00" }
```

`GET /api/meetings/{id}/transcript`

```json
{ "status": "DONE", "content": "회의 내용" }
```

| 상태 코드 | `code` | 상황 |
|---|---|---|
| 409 | `MEETING_ENDED` | 끝난 회의에 입장 |
| 409 | `MEETING_FULL` | 8명이 이미 참여 중 |

## 3. 내부 API

| 주소 | 호출하는 곳 | 사용자 확인 | 응답 | 요구사항 |
|---|---|---|---|---|
| `POST /internal/meetings/livekit-webhook` | LiveKit | LiveKit 서명 확인 | 200 | US-24 |

## 4. 음성 변환 순서

1. 첫 입장권을 발급할 때 LiveKit Egress로 음성 저장을 시작합니다.
2. LiveKit 웹훅으로 회의 종료를 받으면 `transcripts`를 `PENDING`으로 저장하고 Redis에 작업을 넣습니다.
3. 음성 변환 프로그램이 작업을 가져가 `RUNNING`으로 바꿉니다.
4. 변환이 끝나면 결과를 저장하고 `DONE`으로 바꾼 뒤, 원본 음성을 지우고 처리 완료를 표시합니다.
5. 3번 시도해도 실패하면 `FAILED`로 저장합니다.

```json
{ "meetingId": "1", "audioPath": "SeaweedFS 파일 위치" }
```

- 음성 파일은 대기열에 넣지 않고 SeaweedFS의 파일 위치만 넣습니다.
- 변환 프로그램이 여러 개여도 Redis Streams의 소비자 그룹으로 같은 작업을 나눠 받습니다.
- 작업이 재시작 후에도 남도록 Redis 저장 설정을 켜야 합니다. **포기하는 점:** 그래도 Redis 장애 시 작업을 넣지 못할 수 있으며, 상태가 오래 `PENDING`이면 다시 넣어야 합니다.

멤버 제거 알림을 받으면 LiveKit 서버 API로 그 참여자를 내보냅니다.

## 5. 만들 때 확인할 것

- 8명이 10분간 통화되는지(US-23)
- 내부망에서 HTTPS와 LiveKit 연결이 동작하는지
- Egress가 음성을 SeaweedFS에 저장할 수 있는지. 아직 확인하지 않았습니다
- 10분 회의가 10분 안에 변환되는지, 한국어 정확도는 충분한지(US-24)
- 변환 후 원본 음성이 지워지는지(US-24)
- 소속되지 않은 사용자가 입장권을 요청하면 403인지(US-25)

## 6. 이번에 만들지 않는 것

영상 녹화, 회의 예약, 실시간 자막은 빼두었습니다.
