# chat 데이터 구조

[← ERD](README.md)

DB: MongoDB

## channels

```json
{
  "_id": "ObjectId",
  "orgId": "1",
  "name": "개발",
  "type": "NORMAL",
  "lastSeq": 120,
  "createdBy": "3f2c8e1a-...",
  "createdAt": "시각",
  "updatedAt": "시각"
}
```

`type`은 `NORMAL`, `DECISION`(결정 로그), `SYSTEM`(장애 알림) 중 하나입니다.

## messages

```json
{
  "_id": "ObjectId",
  "orgId": "1",
  "channelId": "10",
  "seq": 121,
  "clientMessageId": "브라우저가 만든 값",
  "senderType": "USER",
  "senderId": "3f2c8e1a-...",
  "text": "내용",
  "attachments": [{ "fileId": "5", "name": "기획서.pdf" }],
  "reactions": [{ "emoji": "👍", "userIds": ["3f2c8e1a-..."] }],
  "acknowledgement": {
    "requiredUserIds": ["a", "b"],
    "confirmed": [{ "userId": "a", "at": "시각" }]
  },
  "alertId": null,
  "createdAt": "시각"
}
```

## decisions

```json
{
  "_id": "ObjectId",
  "orgId": "1",
  "sourceChannelId": "10",
  "sourceMessageId": "6721f0a3",
  "text": "결정 내용",
  "authorId": "메시지 작성자",
  "registeredBy": "등록한 사람",
  "registeredAt": "시각"
}
```

## 인덱스

| 컬렉션 | 인덱스 | 이유 |
|---|---|---|
| `messages` | `channelId + seq` 중복 금지 | 순서대로 조회하고 번호 중복을 막습니다 |
| `messages` | `channelId + clientMessageId` 중복 금지 | 재전송 메시지를 막습니다 |
| `messages` | `alertId` 값이 있을 때 중복 금지 | 장애 알림 재전송을 막습니다 |
| `decisions` | `sourceMessageId` 중복 금지 | 같은 메시지를 두 번 등록하지 않습니다 |

번호는 `channels.lastSeq`를 원자적으로 1 올려 만듭니다. 저장 실패로 번호가 비어도 `after` 조회는 정상 동작합니다.
