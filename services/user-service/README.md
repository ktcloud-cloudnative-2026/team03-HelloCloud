# user-service

프로필, 조직, 초대, 권한을 관리합니다. 가입과 로그인은 Keycloak이 처리하고, 이 서비스는 첫 로그인 때 프로필을 저장합니다. API는 [docs/api/user.md](../../docs/api/user.md), 테이블은 [docs/erd/user.md](../../docs/erd/user.md)에 있습니다.

담당: 김준형

## 로컬 실행

1. 저장소 루트의 `.env.example`을 `.env`로 복사하고 값을 채웁니다.
2. `services/`에서 MySQL과 Keycloak을 띄웁니다.

   ```bash
   docker compose --env-file ../.env up -d
   ```

3. 환경 변수를 넣고 `services/`에서 실행합니다. JDK 17이 필요합니다.

   ```bash
   ./gradlew :user-service:bootRun
   ```

| 환경 변수 | 로컬 값 |
|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/user_service` |
| `DB_USERNAME` | `user_service` |
| `DB_PASSWORD` | `.env`에 정한 값 |
| `OIDC_ISSUER_URI` | `http://localhost:8180/auth/realms/ideaconnection` |

테스트 계정은 `http://localhost:8180/auth/realms/ideaconnection/account`의 회원가입 화면에서 만듭니다.

## 검사

`services/`에서 실행합니다. 테스트에는 Docker가 필요합니다.

```bash
./gradlew check        # 테스트, Spotless(포맷), Checkstyle(실수 찾기)
./gradlew spotlessApply # 포맷 자동 수정
```

Java 17에서 돌아야 하므로 google-java-format은 1.28.0, Checkstyle은 12.3.1에 고정했습니다.

의존성을 바꾸면 `./gradlew resolveAndLockAll --write-locks`로 `gradle.lockfile`을 갱신합니다.
