# document 데이터 구조

[← ERD](README.md)

DB: MongoDB

## documents

```json
{
  "_id": "ObjectId",
  "orgId": "1",
  "type": "DOCUMENT",
  "title": "회의 메모",
  "yjsState": "이진 데이터",
  "createdBy": "3f2c8e1a-...",
  "updatedBy": "3f2c8e1a-...",
  "createdAt": "시각",
  "updatedAt": "시각"
}
```

`type`은 `DOCUMENT` 또는 `DRAWING`입니다.

| 항목 | 규칙 | 이유 |
|---|---|---|
| 저장 | 문서 정보와 Yjs 데이터를 한 문서에 저장 | 구조가 단순합니다. 문서 하나의 제한은 16MB입니다 |
| 드로잉 이미지 | file 서비스에 올리고 주소만 저장 | 크기 제한을 넘지 않게 합니다 |
| 목록 조회 | `yjsState`를 제외합니다 | 목록이 무거워지지 않습니다 |
| 인덱스 | `orgId + updatedAt` | 조직 문서를 최근 순으로 찾습니다 |
