# services

백엔드 서비스와 웹 화면이 있는 폴더입니다. Spring 서비스(user, file)와 `libs/common`은 이 폴더를 루트로 하는 Gradle 멀티 프로젝트이고, chat은 Gradle 밖의 NestJS(Node) 프로젝트입니다(`settings.gradle`에 없음).

```
services/
  <이름>-service/   user, file (Spring + Gradle), chat (NestJS + npm)
    src/main
    src/test
    Dockerfile
    README.md       서비스 설명 · 실행 방법 · 담당
  libs/common/      Spring 공통: JWT 사용자(CurrentUser), Problem Details 오류 응답, JSON 로그, 페이지 · 요청 ID
  web/              React + JavaScript
  compose.yaml      로컬 공통 구성 요소: MySQL, Keycloak
```

로컬에서는 공통 구성 요소를 `compose.yaml`로 띄우고, 서비스와 web은 호스트에서 실행합니다. `compose.yaml`에는 MySQL과 Keycloak만 있으므로 서비스마다 필요한 나머지는 아래 표를 보고 따로 준비합니다. 자세한 방법은 각 서비스 README에 있습니다.

| 서비스 | 포트 | 더 필요한 것 | 실행 방법 |
|---|---|---|---|
| user-service | `8081` | 없음 (compose의 MySQL `user_service` DB · 계정 사용) | [user-service/README.md](user-service/README.md) |
| file-service | `8082` | 파일 전용 MySQL DB · 계정 `file_service`(compose가 만들지 않으므로 직접 만듦, 없으면 unknown database · access denied로 시작 실패), SeaweedFS S3 `8333` | [file-service/README.md](file-service/README.md) |
| chat-service | `3000` | MongoDB `27017`(`chat_service` DB), Redis `6379` | [chat-service/README.md](chat-service/README.md) |
| web | `5173` | 없음 | [web/README.md](web/README.md) |

| 로컬 값 | 내용 |
|---|---|
| Keycloak | `http://localhost:8180`, realm `hellocloud`, client `hellocloud-web` (dev와 같은 이름) |
| database · 계정 | MySQL: `user_service`(compose가 만듦), `file_service`(직접 만듦) · MongoDB: `chat_service` |
