# chat API

[← API 명세](README.md) · 데이터: [데이터 구조](../erd/chat.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 메시지 보내기 | HTTP로 보내고, 받기만 WebSocket으로 합니다 | 저장 성공과 실패를 응답으로 바로 알 수 있습니다 |
| 메시지 순서 | 채널마다 1씩 늘어나는 `seq`를 씁니다 | 놓친 메시지를 순서대로 찾습니다(US-07) |
| 재전송 | 브라우저가 만든 `clientMessageId`로 중복을 막습니다 | 응답을 못 받아 다시 보내도 메시지가 늘지 않습니다 |
| 채널 권한 | 조직 멤버는 모든 채널을 볼 수 있습니다 | 단순합니다. **포기하는 점:** 비공개 채널이 없습니다 |
| 저장 순서 | MongoDB에 저장한 뒤 Redis로 알립니다 | Redis가 멈춰도 메시지는 남습니다 |

## 2. 외부 API

모두 로그인 토큰과 조직 소속이 필요합니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/chat/channels?orgId=` | 멤버 | 채널 목록 | 200 | 403 | US-06 |
| `POST /api/chat/channels` | 멤버 | 채널 생성 | 201 | 400, 403 | US-06 |
| `POST /api/chat/channels/{id}/messages` | 멤버 | 메시지 보내기 | 201 | 400, 403, 404 | US-06, US-10 |
| `GET /api/chat/channels/{id}/messages?after=&limit=` | 멤버 | 놓친 메시지 조회 | 200 | 403, 404 | US-07 |
| `WS /api/chat/ws` | 멤버 | 새 메시지 받기 | 연결 | 401, 403 | US-06 |
| `POST /api/chat/messages/{id}/decision` | 멤버 | 결정 로그 등록 | 201 또는 200 | 403, 404 | US-09 |
| `GET /api/chat/decisions?orgId=` | 멤버 | 결정 로그 조회 | 200 | 403 | US-09 |
| `GET /api/chat/messages/{id}/acknowledgements` | 보낸 사람 | 확인, 미확인자 조회 | 200 | 403, 404 | US-10 |
| `POST /api/chat/messages/{id}/acknowledgements` | 지정된 사용자 | 확인 처리 | 200 | 403, 404 | US-10 |
| `POST /api/chat/messages/{id}/reactions` | 멤버 | 이모지 추가 | 200 | 400, 403, 404 | US-10 |
| `DELETE /api/chat/messages/{id}/reactions/{emoji}` | 본인 | 이모지 취소 | 204 | 403, 404 | US-10 |

파일 미리보기(US-08)는 메시지의 `fileId`로 file 서비스의 `preview-url`을 호출합니다.

### 요청과 응답 예시

`POST /api/chat/channels/{id}/messages`

```json
{
  "clientMessageId": "브라우저가 만든 값",
  "text": "확인 부탁드립니다",
  "attachments": [{ "fileId": "5", "name": "기획서.pdf" }],
  "acknowledgementUserIds": ["a", "b"]
}
```

### WebSocket

연결 후 인증 메시지로 로그인 토큰을 보내고, 볼 채널을 구독합니다.

```json
{ "type": "SUBSCRIBE", "channelId": "10" }
```

서버가 보내는 메시지

```json
{ "type": "MESSAGE_CREATED", "orgId": "1", "channelId": "10", "data": { "id": "6721f0a3", "seq": 121, "text": "내용" }, "sentAt": "2026-11-06T09:00:00+09:00" }
```

이모지와 확인 변경은 `MESSAGE_UPDATED`로 보냅니다. 멤버 제거를 알리는 `MEMBER_REMOVED`를 받으면 그 사용자의 연결을 끊습니다.

## 3. 만들 때 확인할 것

- 다른 파드에 연결된 사용자에게 1초 안에 전달되는지 100건 측정(US-06)
- 재연결 후 놓친 메시지가 순서대로 누락 없이 오는지(US-07)
- Redis가 멈춰도 메시지가 저장되고, 재연결하면 복구되는지
- 내보낸 멤버의 연결이 끊기는지(US-04)
- 서버 여러 대에서 연결이 안정적인지. WebSocket 도구 설정을 함께 확인합니다

## 4. 이번에 만들지 않는 것

메시지 수정과 삭제, 비공개 채널, 메시지 검색, 읽음 표시는 요구사항에 없어 빼두었습니다.
