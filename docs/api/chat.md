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
| `PATCH /api/chat/channels/{id}` | 멤버 | 채널 이름 바꾸기 (`{ "name": "1~50자" }`) | 200 | 400, 403, 404 | US-06 |
| `POST /api/chat/channels/{id}/messages` | 멤버 | 메시지 보내기 | 201 | 400, 403, 404 | US-06, US-11 |
| `GET /api/chat/channels/{id}/messages?after=&limit=` | 멤버 | 놓친 메시지 조회 | 200 | 403, 404 | US-07 |
| `WS /api/chat/ws` | 멤버 | 새 메시지 받기 | 연결 | 401, 403 | US-06 |
| `POST /api/chat/messages/{id}/decision` | 멤버 | 결정 로그 등록 | 201 또는 200 | 403, 404 | US-10 |
| `DELETE /api/chat/messages/{id}/decision` | 멤버 | 결정 로그(고정) 해제 | 204 | 403, 404 | US-10 |
| `GET /api/chat/decisions?orgId=` | 멤버 | 결정 로그 조회 | 200 | 403 | US-10 |
| `GET /api/chat/messages/{id}/acknowledgements` | 보낸 사람 | 확인, 미확인자 조회 | 200 | 403, 404 | US-11 |
| `POST /api/chat/messages/{id}/acknowledgements` | 지정된 사용자 | 확인 처리 | 200 | 403, 404 | US-11 |
| `POST /api/chat/messages/{id}/reactions` | 멤버 | 이모지 추가 | 200 | 400, 403, 404 | US-11 |
| `DELETE /api/chat/messages/{id}/reactions/{emoji}` | 본인 | 이모지 취소 | 204 | 403, 404 | US-11 |

파일 미리보기(US-08)는 메시지의 `fileId`로 file 서비스의 `preview-url`을 호출합니다.

### 요청과 응답 예시

채널과 메시지 응답의 `id`는 문자열입니다.

`POST /api/chat/channels/{id}/messages`

```json
{
  "clientMessageId": "브라우저가 만든 값",
  "text": "확인 부탁드립니다",
  "attachments": [{ "fileId": "5", "name": "기획서.pdf", "contentType": "application/pdf" }],
  "acknowledgementUserIds": ["a", "b"]
}
```

`text`와 `attachments`(최대 5개) 중 하나는 있어야 합니다. 첨부는 조직 파일 목록(`GET /api/files`)의 `id` · `name` · `contentType`을 그대로 넣습니다. chat은 모양만 확인하고, 파일을 볼 권한은 미리보기 · 다운로드 주소를 받을 때 file이 확인합니다. `acknowledgementUserIds`(확인을 요청할 사람, 최대 20명)는 선택입니다. 모두 같은 조직 멤버여야 하며 아니면 400입니다. 보낸 사람 자신은 빠집니다.

`GET /api/chat/messages/{id}/acknowledgements` (보낸 사람만)

```json
{ "messageId": "6721f0a3", "users": [{ "userId": "a", "confirmedAt": "2026-11-23T10:00:00.000Z" }, { "userId": "b", "confirmedAt": null }] }
```

`POST /api/chat/messages/{id}/acknowledgements`는 본문 없이 보내며, 지정된 사람만 할 수 있습니다. 이미 확인했으면 그대로 200입니다. 응답은 바뀐 메시지입니다.

`POST /api/chat/messages/{id}/reactions`

```json
{ "emoji": "👍" }
```

이모지는 `👍 ✅ ❤️ 😂 🎉 👀` 중 하나이고, 그 밖은 400입니다. 같은 사람이 같은 이모지를 두 번 눌러도 한 번만 셉니다. 응답은 바뀐 메시지입니다. 취소(`DELETE .../reactions/{emoji}`)는 주소의 이모지를 URL 인코딩합니다.

`POST /api/chat/messages/{id}/decision`은 본문 없이 보냅니다. 처음 등록이면 201, 이미 등록된 메시지면 200과 처음 기록을 돌려줍니다. `GET /api/chat/decisions?orgId=`는 같은 모양의 목록을 최근 순으로 100개까지 줍니다. `DELETE /api/chat/messages/{id}/decision`은 등록을 지우고 204를 돌려줍니다. 이미 없어도 204이고, 지운 뒤 다시 등록할 수 있습니다. 웹에서는 이 기능을 "고정 메시지"라고 부릅니다.

```json
{ "id": "6722a1b0", "orgId": "1", "sourceChannelId": "10", "sourceMessageId": "6721f0a3", "text": "배포는 금요일에 하지 않는다", "authorId": "메시지 작성자", "registeredBy": "등록한 사람", "registeredAt": "2026-11-23T10:00:00.000Z" }
```

### WebSocket

연결 후 인증 메시지로 로그인 토큰을 보내고, 볼 채널을 구독합니다.

서버는 30초마다 ping을 보내고, 다음 ping 때까지 응답(pong)이 없으면 연결을 끊습니다. 브라우저는 자동으로 응답하므로 화면이 할 일은 없습니다. 아무 메시지 없이 열린 연결이 중간에서 끊기지 않게 하고, 사라진 브라우저의 연결을 정리하려는 것입니다.

```json
{ "type": "SUBSCRIBE", "channelId": "10" }
```

서버가 보내는 메시지

```json
{ "type": "MESSAGE_CREATED", "orgId": "1", "channelId": "10", "data": { "id": "6721f0a3", "seq": 121, "text": "내용" }, "sentAt": "2026-11-06T09:00:00+09:00" }
```

이모지와 확인 변경은 `MESSAGE_UPDATED`로 보냅니다. 모양은 `MESSAGE_CREATED`와 같고, `data`는 바뀐 뒤의 메시지 전체입니다. 화면은 같은 `id`의 메시지를 바꿔 끼웁니다.

연결이 끊기는 경우는 아래와 같습니다. 모두 코드 `1008`로 닫으며, 화면은 새 토큰으로 다시 연결합니다.

| 이유(reason) | 언제 |
|---|---|
| `Membership revoked` | user가 `MEMBER_REMOVED`를 알렸고, 그 사용자가 그 조직 채널을 구독 중일 때(US-04) |
| `Token expired` | 로그인 토큰이 만료됐을 때. 만료 전에 새 토큰으로 `AUTH`를 다시 보내면 연결이 이어집니다 |
| `User mismatch` | 다시 보낸 `AUTH`가 다른 사용자의 토큰일 때 |

## 3. 만들 때 확인할 것

- 다른 파드에 연결된 사용자에게 1초 안에 전달되는지 100건 측정(US-06)
- 재연결 후 놓친 메시지가 순서대로 누락 없이 오는지(US-07)
- Redis가 멈춰도 메시지가 저장되고, 재연결하면 복구되는지
- 내보낸 멤버의 연결이 끊기는지(US-04)
- 서버 여러 대에서 연결이 안정적인지. WebSocket 도구 설정을 함께 확인합니다

## 4. 이번에 만들지 않는 것

메시지 수정과 삭제, 비공개 채널, 메시지 검색, 읽음 표시는 요구사항에 없어 빼두었습니다.
