# services

Gradle 멀티 프로젝트 루트입니다. `user-service`를 먼저 만들고, 나머지 서비스는 그 골격을 복사해 만듭니다.

```
services/
  <이름>-service/   user, chat, file, calendar, notification, board, meeting, document
    src/main
    src/test
    Dockerfile
    README.md       서비스 설명 · 실행 방법 · 담당
  libs/common/      JWT 사용자 추출, 멤버십 클라이언트, Problem Details
  web/              React + JavaScript
  compose.yaml      로컬 의존 구성 요소: MySQL, Redis, SeaweedFS, Keycloak, LiveKit
```

로컬에서는 의존 구성 요소만 `compose.yaml`로 띄우고, 서비스와 web은 호스트에서 실행합니다.

| 로컬 값 | 내용 |
|---|---|
| Keycloak | `http://localhost:8180`, realm `hellocloud`, client `hellocloud-web` (dev와 같은 이름) |
| 포트 | user-service `8081`, web `5173` |
| database · 계정 | `user_service`, `chat_service`, `file_service`, `calendar_service`, `notification_service`, `board_service`, `meeting_service`, `document_service` |
