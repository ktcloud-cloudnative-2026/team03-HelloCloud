# 공통 규칙

[← README](../README.md)

## 1. Git 전략
- 트렁크 기반으로 `main`만 오래 유지하고, 브랜치는 3일 안에 PR로 머지합니다. `main`에 직접 push와 force push는 금지합니다

| 항목 | 규칙 | 예 |
|---|---|---|
| 브랜치 이름 | `<type>/<이슈번호>-<짧은-설명>` | `feat/12-seat-list`, `fix/15-booking-409` |
| 커밋 메시지 | [Conventional Commits](https://www.conventionalcommits.org): `<type>: <subject>` | `feat: 좌석 조회 API 추가` |
| type | `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci` | |
| subject | 50자 이내, 명령형, 마침표 없음. 한 커밋은 한 목적만 담음 | |
| PR 크기 | 이슈 하나에 PR 하나 | |
| PR 본문 | 변경 내용, 확인 방법, `Closes #<이슈번호>` | |
| 리뷰 | 1명 이상 승인과 CI 통과 후 머지 | |
| merge 방식 | Squash merge 후 브랜치 삭제 | |
| 충돌 | main을 내 브랜치에 먼저 합침 | `git pull origin main` |
| 배포 | `deploy/` 변경이 `main`에 머지되면 Argo CD가 배포(서비스는 이미지 태그 PR 머지 시), 롤백은 `git revert` | |

작업 순서는 [GitHub 사용 가이드](github-guide.md)를 따릅니다.

## 2. 코드 · 서비스 공통
| 항목 | 규칙 |
|---|---|
| 기술 스택 | [기술 스택](tech-stack.md) |
| 폴더 구조 | `services/<서비스>/` 아래 `src/main` · `src/test` · `Dockerfile` |
| 공통 API | `/actuator/health/liveness`, `/actuator/health/readiness` |
| 환경변수 이름 | `DB_URL`, `DB_USERNAME`, `MYSQL_SERVICE_PASSWORD`, `OIDC_ISSUER_URI` |
| 에러 · 로그 형식 | [API 명세 공통 규칙](api/README.md#공통-규칙), [관측 설계](observability.md#3-로그-형식-모든-서비스-같게) |
| 작업 범위 | 이슈 범위 안에서 고침. 새 패키지는 PR에 이유 |

## 3. 비밀값 · 환경
- 비밀번호 · 토큰 · 키는 Git에 넣지 않습니다. 형식만 [.env.example](../.env.example)에
- 실제 값은 Kubernetes Secret으로
