# ideaconnection MVP 설계

## 1. 목적과 제약

*   초보자 4명이 협업 툴을 만들며 인프라, 백엔드, 프론트를 모두 학습한다.
    역할은 기능별로 섞어서 맡는다.
*   기간: 2026-11-09 ~ 2027-01-03, 1주 스프린트 8회.
*   인프라: 제공받은 온프레미스 VM에 직접 구축한 k8s. 내부망에서 먼저
    완성하고, 공인 IP가 나오면 외부 접속으로 전환한다(8절).
*   비용: 유료 라이선스와 유료 클라우드 리소스를 쓰지 않는다(Route 53 제외).

## 2. 범위와 인수 조건

구현 순서대로 적었다. 일정이 밀리면 GANTT-1을 가장 먼저 뺀다.

| ID      | 기능      | 인수 조건                                                         |
| ------- | --------- | ----------------------------------------------------------------- |
| USER-1  | 로그인    | Keycloak으로 가입·로그인하고, 첫 로그인 때 프로필이 생긴다        |
| USER-2  | 조직      | 조직을 만든 사람이 OWNER가 된다                                   |
| USER-3  | 초대      | OWNER가 만든 링크로 수락하면 MEMBER가 된다. 링크는 한 번만 쓴다   |
| USER-4  | 접근 제한 | 속하지 않은 조직의 데이터는 볼 수 없다(403)                       |
| BOARD-1 | 칸반      | 보드 → 컬럼 → 카드. 카드에 담당자, 시작일, 마감일                 |
| BOARD-2 | 카드 이동 | 끌어서 옮긴 위치가 새로고침 후에도 유지된다                       |
| FILE-1  | 파일      | 조직 파일함에 올리고 내려받고 지운다. 업로드가 끝난 파일만 보인다 |
| CHAT-1  | 메신저    | 채널에서 새로고침 없이 메시지를 주고받는다                        |
| CHAT-2  | 재연결    | 끊겼다 돌아오면 놓친 메시지가 순서대로 보인다                     |
| MEET-1  | 화상 통화 | 여러 명이 한 회의방에서 영상과 음성을 주고받는다                    |
| GANTT-1 | 간트      | 기간이 있는 카드가 타임라인 막대로 보인다                         |

범위 밖: 문서 공동 편집, 알림, 검색, 카드 댓글, 메시지 수정·읽음 표시, 회의
녹화, 칸반 실시간 동기화.

## 3. 기술 결정

| 영역          | 결정                                                       |
| ------------- | ---------------------------------------------------------- |
| 서비스 구조   | 기능별 마이크로서비스 5개, 공통 템플릿 + 공용 Helm 차트    |
| 백엔드        | Java LTS + Spring Boot, Gradle 멀티 프로젝트               |
| 프론트        | React + Vite + TypeScript                                  |
| 인증          | Keycloak(Operator로 설치), OIDC + PKCE                     |
| DB            | MySQL 8.4 인스턴스 1개, 서비스별 database/계정, 자체 차트  |
| pub/sub       | Valkey                                                     |
| 파일 저장소   | SeaweedFS (S3 API)                                         |
| 화상          | LiveKit 자체 설치, 내장 TURN                               |
| Gateway       | Envoy Gateway: TLS 종료, 라우팅, JWT 검증                  |
| 서비스 메시   | Istio 사이드카 모드: mTLS STRICT, `AuthorizationPolicy`    |
| 클러스터      | dev, prod 2개. kubeadm + Calico, Longhorn, MetalLB(사설 IP 풀) |
| 인증서        | cert-manager + Let's Encrypt DNS-01 (Route 53)             |
| 배포          | Argo CD (App of Apps)                                      |
| CI            | Jenkins, CI 전용 VM, docker-compose, SCM 폴링              |
| 레지스트리    | GHCR                                                       |
| 관측          | kube-prometheus-stack, Kiali, Loki + Alloy                 |

버전은 구현 시점의 최신 안정판으로 고정한다.

## 4. 아키텍처

```text
브라우저 ── https://app.<도메인>, wss://livekit.<도메인> (Route 53)
   ├─ 443/TCP ─────────────────→ MetalLB IP #1: Envoy Gateway
   └─ 7881/TCP, 7882/UDP, 3478/UDP → MetalLB IP #2: LiveKit (메시 밖)

Envoy Gateway (TLS 종료, JWT 검증)
  /                → web
  /auth            → Keycloak
  /api/users, /api/orgs, /api/invitations → user-service
  /api/boards      → board-service
  /api/files       → file-service
  /api/chat        → chat-service (REST + WebSocket)
  /api/meetings    → meeting-service
  files.<도메인>   → SeaweedFS (presigned URL)
  livekit.<도메인> → LiveKit 시그널링

서비스 → MySQL(서비스별 database), Valkey(채팅), SeaweedFS(파일)
CI 전용 VM: Jenkins → GitHub 폴링, GHCR push
```

*   API 경로: Gateway는 `/api/` 다음 첫 세그먼트로 서비스를 고른다. 조직 단위
    목록은 `?orgId=` 쿼리로 받는다(예: `GET /api/boards?orgId=...`).
*   로그인: 브라우저 → Keycloak → JWT. Gateway와 각 서비스(Spring Security
    리소스 서버)가 모두 검증한다. 서비스도 검증하는 이유는 메시 없는 로컬에서
    같은 코드로 동작하게 하기 위해서다.
*   파일: `file-service`가 presigned URL을 주고 브라우저가 SeaweedFS에 직접
    올리고 받는다.
*   채팅: WebSocket(STOMP). DB에 저장한 뒤 Valkey pub/sub으로 모든 파드에
    전파한다.
*   화상: `meeting-service`가 LiveKit 입장 토큰(유효 10분)을 서명한다.

## 5. 서비스

*   사용자 ID는 Keycloak `sub`(UUID)를 그대로 쓴다. 사용자 테이블은 없다.
*   다른 서비스의 데이터는 ID로만 참조한다. 서비스 간 외래 키와 JOIN 금지.
*   멤버십 확인: `user-service`의 `GET /internal/orgs/{orgId}/members/{userId}`를
    호출하고 30초 캐시한다. 유일한 서비스 간 호출이다. Istio
    `AuthorizationPolicy`로 메시 내부에서만 호출할 수 있다.
*   테이블 컬럼은 각 서비스의 Flyway 마이그레이션이 정본이다.

| 서비스            | 책임                                         | 테이블                                                | 주요 API                                                                     |
| ----------------- | -------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `user-service`    | 프로필, 조직, 초대, 멤버/역할(OWNER, MEMBER) | `profile`, `organization`, `membership`, `invitation` | `/api/users/me`, `/api/orgs`, `/api/orgs/{id}/members`, `/api/invitations/{token}/accept` |
| `board-service`   | 보드/컬럼/카드, 순서, 담당자, 기간, 간트 조회 | `board`, `board_column`, `card`                      | `/api/boards?orgId=`, `/api/boards/{id}/cards`, `/api/boards/{id}/timeline`  |
| `file-service`    | presigned URL, 업로드 완료 확인, 목록/삭제   | `file_object` (`PENDING`/`READY`)                     | `/api/files?orgId=`, `/api/files/{id}/complete`, `/api/files/{id}/download-url` |
| `chat-service`    | 채널, 메시지 저장/조회, WebSocket            | `channel`, `channel_member`, `message`                | `/api/chat/channels?orgId=`, `/api/chat/channels/{id}/messages?after=`, WS `/api/chat/ws` |
| `meeting-service` | 회의방, LiveKit 입장 토큰                    | `meeting`                                             | `/api/meetings?orgId=`, `/api/meetings/{id}/token`                           |

## 6. 디렉터리 구조

```text
Jenkinsfile               변경된 경로만 빌드·검증
deploy/
  cluster/                손 작업 절차: kubeadm, Calico, Argo CD
  argocd/                 Argo CD Application (root.yaml, platform/, data/, services/)
  charts/                 자체 차트: spring-service(서비스 공용), mysql
  values/<앱>/            values.yaml, values-dev.yaml, values-prod.yaml
  manifests/              Gateway, Certificate, MetalLB IP 풀 등
  ci/                     Jenkins VM: docker-compose, JCasC
  scripts/validate.sh     yamllint, helm lint, helm template | kubeconform
services/
  <이름>-service/
  libs/common/            JWT 사용자 추출, 멤버십 클라이언트, Problem Details
  web/
  compose.yaml            로컬 개발: MySQL, Valkey, SeaweedFS, Keycloak, LiveKit
```

새 서비스는 `user-service` 골격을 복사해 만든다. 로컬에서는 의존 구성 요소만
`compose.yaml`로 띄우고 서비스와 web은 호스트에서 실행한다.

## 7. CI/CD

```text
PR        → Jenkins: 변경된 부분만 검증 → GitHub 상태 체크
            services/ → 빌드, 테스트, 린트 / deploy/ → validate.sh
main 머지 → services/ 변경 시 이미지 빌드 → GHCR push (태그: 커밋 SHA)
            → deploy/values/<서비스>/values.yaml의 image.tag 변경 PR 생성
            → 리뷰 후 머지 → Argo CD 자동 동기화
롤백      → git revert 후 머지
```

*   Jenkins는 사내망 전용 VM에 컨트롤러(실행기 0개)와 에이전트를
    docker-compose로 띄우고, 설정은 `deploy/ci/`의 JCasC로 관리한다.
*   변경 감지는 SCM 폴링(1~2분). `services/libs/common`이나 빌드 파일이 바뀌면
    모든 서비스를 빌드한다.
*   리포 쓰기 권한이 있는 사람의 PR만 빌드하고, PR 빌드에는 push 토큰을 주지
    않는다.

## 8. 네트워크와 DNS

| 단계      | 시점              | Route 53 A 레코드                      | LiveKit                   |
| --------- | ----------------- | -------------------------------------- | ------------------------- |
| 1. 내부망 | S2부터            | `app`, `livekit`, `files` → MetalLB 사설 IP | 사설 IP, TURN 없음   |
| 2. 외부   | 공인 IP를 받은 뒤 | 같은 이름 → 공인 IP                    | 외부 IP 설정, 내장 TURN   |

*   인증서는 DNS-01이라 1단계부터 정식 발급된다.
*   제공처 요청: 고정 공인 IP, 포트 포워딩(`443/TCP` → IP #1, `7881/TCP`,
    `7882/UDP`, `3478/UDP` → IP #2), CI 전용 VM.
*   S6(12/14)까지 공인 IP가 없으면 EC2 중계(WireGuard) 여부를 그때 정한다.
*   `chat-service` WebSocket 경로는 Envoy Gateway 타임아웃을 늘린다. Istio 재시도는
    GET에만 2회.

## 9. 시크릿

`kubectl create secret`으로 직접 만든다: MySQL 계정, Keycloak 관리자/DB,
Route 53 IAM 키(해당 호스팅 영역만), LiveKit API 키, SeaweedFS S3 키.

## 10. 에러 처리

*   에러 응답은 RFC 9457 Problem Details(`libs/common`). 401 인증 없음,
    403 조직 멤버 아님, 404 없음, 409 충돌, 400 입력 오류.
*   멤버십 확인 실패 시 막는다: 캐시만 인정하고, 캐시도 없으면 503.
*   파일: 중단된 업로드는 `PENDING`으로 남고 24시간 뒤 스케줄러가 지운다.
*   채팅: 지수 백오프로 재연결하고 `?after=<마지막 메시지 ID>`로 놓친
    메시지를 받는다. Valkey 장애 시 저장은 되고 실시간 전달만 빠진다.
*   모든 서비스는 Actuator liveness/readiness 프로브를 쓴다.

## 11. 테스트와 관측

| 대상     | 도구                                                   |
| -------- | ------------------------------------------------------ |
| 백엔드   | JUnit 5, Mockito, Testcontainers(MySQL, Valkey), Spotless |
| 프론트   | Vitest, React Testing Library, ESLint, Prettier        |
| API 계약 | springdoc OpenAPI → `openapi-typescript`               |
| deploy   | `deploy/scripts/validate.sh`                            |
| E2E      | 자동화하지 않음. 스프린트 데모에서 2절 인수 조건 확인  |

*   메트릭: `/actuator/prometheus` → kube-prometheus-stack.
*   로그: JSON stdout → Alloy → Loki → Grafana. 트래픽: Kiali.

## 12. 일정과 운영

선행 작업(~11/8): 제공처 요청, Route 53 IAM 사용자 생성, VM에서 AWS API
아웃바운드 확인.

| 스프린트 | 인프라                                                        | 기능                                                   |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| S1 11/9  | Jenkins VM, `validate.sh`, kubeadm + Calico, Argo CD          | 서비스 템플릿, `libs/common`, `compose.yaml`, web 로그인 |
| S2 11/16 | MetalLB, Longhorn, cert-manager, Envoy Gateway, Istio, MySQL | 조직, 초대, 멤버                                       |
| S3 11/23 | Keycloak, 공용 차트, 첫 배포, 이미지 태그 PR 자동화           | 보드/컬럼/카드                                         |
| S4 11/30 | Valkey, SeaweedFS, 모니터링, Loki                             | 드래그 앤 드롭, 파일                                   |
| S5 12/7  | 내부 API 정책, WebSocket 타임아웃                             | 채팅                                                   |
| S6 12/14 | LiveKit, 내부망 통화 확인                                     | 화상 통화                                              |
| S7 12/21 | (공인 IP가 있으면) 외부 접속 전환                             | 간트, 마무리                                           |
| S8 12/28 | 안정화                                                        | 버퍼, 인수 조건 전체 데모                              |

*   팀장(@mjkim134)은 고정이고, 팀장을 포함한 모두가 구현을 맡는다.
    스프린트마다 인프라 1명 + 기능 3명, 매주 순환한다. 기능은 한 사람이
    백엔드부터 화면까지 맡는다. Istio, WebSocket, LiveKit은 짝으로 한다.
*   GitHub Project 1개(`team04 보드`): `Status`(Todo, In Progress, In Review, Done), `서비스`.
    계획의 Task 하나 = 이슈 하나(2~3일 크기). PR의 `Closes #N`으로 머지 시
    Done.
*   월요일 계획, 매일 비동기 스탠드업, 주말 전 데모와 회고.
