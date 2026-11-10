# file API

[← API 명세](README.md) · 데이터: [ERD](../erd/file.md)

## 1. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 업로드 | 브라우저가 SeaweedFS로 직접 올립니다 | 큰 파일이 서비스를 지나가지 않습니다 |
| 미리보기 | 이미지와 PDF만 지원합니다 | 브라우저가 바로 보여 줍니다. **포기하는 점:** Office 파일은 내려받아야 합니다 |
| 파일 크기 | 한 파일 최대 100MB | 내부망 데모에 충분하고 저장 공간을 보호합니다 |
| 삭제 | 올린 사람 또는 OWNER | 다른 멤버의 실수를 막습니다 |

## 2. 업로드 순서

1. 브라우저가 `POST /api/files`로 업로드를 시작하고 임시 업로드 주소를 받습니다.
2. 브라우저가 그 주소로 SeaweedFS에 파일을 올립니다.
3. 브라우저가 `POST /api/files/{id}/complete`를 호출합니다.
4. 서비스가 SeaweedFS의 파일 크기를 확인하고 `COMPLETED`로 바꿉니다.

## 3. 외부 API

모두 로그인 토큰과 조직 소속이 필요합니다.

| 주소 | 권한 | 하는 일 | 성공 | 에러 | 요구사항 |
|---|---|---|---|---|---|
| `GET /api/files?orgId=` | 멤버 | 완료된 파일 목록 | 200 | 403 | US-11 |
| `POST /api/files` | 멤버 | 업로드 시작, 업로드 주소 받기 | 201 | 400, 403 | US-11 |
| `POST /api/files/{id}/complete` | 올린 사람 | 업로드 완료 | 200 | 403, 404, 409 | US-11 |
| `GET /api/files/{id}/download-url` | 멤버 | 다운로드 주소 받기 | 200 | 403, 404, 409 | US-11 |
| `GET /api/files/{id}/preview-url` | 멤버 | 미리보기 주소 받기 | 200 | 403, 404, 409 | US-08 |
| `DELETE /api/files/{id}` | 올린 사람 또는 OWNER | 파일 삭제 | 204 | 403, 404 | US-11 |

### 요청과 응답 예시

`POST /api/files`

```json
{ "orgId": "1", "name": "기획서.pdf", "contentType": "application/pdf", "sizeBytes": 1048576 }
```

```json
{ "id": "5", "uploadUrl": "임시 업로드 주소", "expiresAt": "2026-11-06T09:15:00+09:00" }
```

`GET /api/files/{id}/download-url`

```json
{ "url": "임시 다운로드 주소", "expiresAt": "2026-11-06T09:15:00+09:00" }
```

### 에러 코드

| 상태 코드 | `code` | 상황 |
|---|---|---|
| 400 | `FILE_TOO_LARGE` | 100MB 초과 |
| 409 | `UPLOAD_NOT_FOUND` | 파일을 올리지 않고 완료를 요청함 |
| 409 | `UPLOAD_SIZE_MISMATCH` | 저장된 크기가 다름 |
| 409 | `FILE_NOT_READY` | 완료되지 않은 파일을 내려받으려 함 |
| 409 | `PREVIEW_NOT_SUPPORTED` | 미리보기를 지원하지 않는 형식 |

## 4. 만들 때 확인할 것

- SeaweedFS에서 임시 업로드와 다운로드 주소가 동작하는지. 아직 실제로 확인하지 않았습니다
- 내려받은 파일이 원본과 같은지(US-11)
- 업로드 중인 파일이 목록에 보이지 않는지(US-11)
- 다른 조직의 파일 주소를 요청하면 403이 나오는지(US-05)
- 파일을 지우면 SeaweedFS에서도 지워지는지

## 5. 이번에 만들지 않는 것

폴더, 외부 공개 링크, 파일 수정, 완료되지 않은 파일 자동 정리는 빼두었습니다.
