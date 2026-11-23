# chat-service

조직의 채널 · 메시지 · 고정 메시지(결정 로그) · 확인 요청 · 이모지 · 첨부를 다루고, WebSocket으로 메시지를 실시간 전달합니다. NestJS(Node 24) 서비스입니다. API와 WebSocket 메시지 형식은 [docs/api/chat.md](../../docs/api/chat.md)에 있습니다.

담당: 정호윤(실시간 전달), 김준형(고정 메시지 · 확인 요청 · 첨부)

## 어떻게 동작하나

- HTTP API는 `/api/chat/...`, WebSocket은 `/api/chat/ws`입니다. 포트는 3000입니다
- 메시지는 MongoDB(`chat_service` DB)에 먼저 저장하고, 저장에 성공하면 Redis 채널 `hellocloud-chat-events`로 알립니다. 파드가 여러 개여도 모든 파드가 이 채널을 구독해 자기에게 연결된 브라우저에 보냅니다. Redis가 멈춰도 메시지는 저장되고, 다시 연결하면 놓친 메시지를 HTTP로 받습니다(US-07)
- user-service가 멤버를 내보내면 Redis 채널 `hellocloud-member-events`로 `MEMBER_REMOVED`를 받아, 그 사람의 그 조직 채널 연결을 끊습니다(US-04)
- 로그인 토큰은 Keycloak의 공개 키로 직접 확인하고, 조직 멤버인지는 요청마다 user-service의 내부 API에 묻습니다
- 상태 확인: `/health/liveness`, `/health/readiness`. Prometheus 지표는 `/metrics`(HTTP 요청 수 · 시간, WebSocket 연결 수, Node 기본 지표)

## 로컬 실행

1. MongoDB와 Redis를 띄웁니다. 로컬에서는 비밀번호 없이 씁니다(서버와 같은 버전).

   ```bash
   docker run -d --name chat-mongo -p 127.0.0.1:27017:27017 mongo:8.0.34
   docker run -d --name chat-redis -p 127.0.0.1:6379:6379 redis:8.10.0
   ```

2. Keycloak과 user-service를 띄웁니다. 방법은 [user-service README](../user-service/README.md)를 따릅니다(Keycloak은 `services/compose.yaml`).
3. `.env.example`을 `.env`로 복사하고 값을 고칩니다. 로컬 MongoDB · Redis는 비밀번호가 없으니 아래 두 줄로 바꾸고 `DB_USERNAME` · `DB_PASSWORD` · `REDIS_PASSWORD` 줄은 지웁니다.

   ```bash
   DB_URL=mongodb://localhost:27017/chat_service
   REDIS_URL=redis://localhost:6379
   ```

4. 이 폴더에서 실행합니다. Nest는 `.env`를 스스로 읽지 않으므로 셸에 먼저 넣습니다.

   ```bash
   npm ci
   set -a; . ./.env; set +a
   npm run start:dev
   ```

| 환경 변수 | 필수 | 설명 |
|---|---|---|
| `DB_URL` | 예 | MongoDB 주소. 서버는 `mongodb://<DB VM>:27017/chat_service?authSource=chat_service` |
| `DB_USERNAME`, `DB_PASSWORD` | 서버만 | MongoDB 계정. 로컬은 비워 둡니다 |
| `REDIS_URL` | 예 | Redis 주소. 비밀번호는 URL에 넣지 않습니다 |
| `REDIS_PASSWORD` | 서버만 | Redis 비밀번호. 없으면 넣지 않습니다 |
| `OIDC_ISSUER_URI` | 예 | 토큰 발급자. 로컬 `http://localhost:8180/realms/hellocloud` |
| `OIDC_JWKS_URI` | 아니요 | 공개 키 주소를 따로 줄 때. 없으면 `<issuer>/protocol/openid-connect/certs` |
| `USER_SERVICE_URL` | 아니요 | 소속 확인을 물을 주소. 로컬 `http://localhost:8081`, 클러스터 `http://user-service` |
| `PORT` | 아니요 | 기본 3000 |

## 검사

```bash
npm run lint
npm test                 # 단위 테스트
MONGO_TEST_URL=mongodb://127.0.0.1:27017 npm test   # 실제 MongoDB 테스트까지
```

`MONGO_TEST_URL`이 없으면 실제 MongoDB를 쓰는 테스트(`*.mongo.spec.ts`)는 건너뜁니다. CI는 Dockerfile의 `test` 단계(`docker build --target test`)를 돌리며, 거기엔 MongoDB가 없어 이 테스트가 빠집니다. MongoDB 쿼리를 고쳤다면 로컬에서 위 명령으로 한 번 돌려 주세요.

## 배포

- 이미지: `ghcr.io/ktcloud-cloudnative-2026/idcn-chat-service:<커밋 7자리>`. main에 머지되면 CI가 만들고 dev 태그를 바꿉니다
- 차트는 공통 `deploy/charts/spring-service`를 씁니다(상태 확인 주소 · 포트 규칙이 같음). 값은 `deploy/values/chat-service/`
- dev는 파드 2개입니다. 서로 다른 파드에 붙은 사용자 사이 전달(US-06)을 dev에서도 확인하려고 2개로 둡니다
- 비밀값은 Secret `chat-service-env`(`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_URL`, `REDIS_PASSWORD`, `OIDC_ISSUER_URI`)에 두고, `USER_SERVICE_URL`은 values에 둡니다. 만드는 법은 [deploy/README.md](../../deploy/README.md)
