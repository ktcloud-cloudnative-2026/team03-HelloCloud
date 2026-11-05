# 기술 스택

[← 아키텍처](architecture.md) · [README](../README.md) · 다음: [API 명세](api/)

> 학습 프로젝트이므로 쉽게 시작할 수 있는 선택을 우선한 초안입니다. 정확한 버전은 설치하는 PR에서 고정합니다(`latest` 금지).

영역마다 "왜 이것인가"를 한 줄로 씁니다. 나중에 바꾸면 [결정 기록](adr/)에 이유를 남깁니다.

| 영역 | 선택 | 왜 | 어디에 | 버린 대안 |
|---|---|---|---|---|
| 서비스 구조 | 기능별 마이크로서비스 8개, 공용 Helm 차트 | 요구사항의 서비스 구분과 같고 MSA를 학습할 수 있음 | `services/`, `deploy/charts/` | 모놀리스 |
| 서비스 언어 | Java LTS + Spring Boot, Gradle 멀티 프로젝트 | 자료가 많고 대부분의 서비스를 같은 방식으로 만들 수 있음 | `services/` | Go, Node.js 통일 |
| 예외 언어 | document: Node.js | Hocuspocus를 그대로 쓰면 직접 구현할 양이 줄어듦 | `services/document/` | Java로 직접 구현 |
| 프론트 | React + Vite + TypeScript | 자료가 많고 필요한 라이브러리가 대부분 있음 | `services/web/` | Vue, Next.js |
| 프론트 라이브러리 | TanStack Query, dnd-kit, FullCalendar, frappe-gantt, stompjs, LiveKit React SDK | 칸반, 캘린더, 간트, 채팅, 화상을 직접 구현하지 않음 | `services/web/` | 전부 직접 구현 |
| 인증 | Keycloak(Operator), OIDC + PKCE | 가입, 로그인, 토큰 발급을 직접 만들지 않음 | 클러스터, `keycloak` database | 자체 구현, 외부 인증 서비스 |
| DB | MySQL 8.4 인스턴스 1개, 서비스별 database와 계정, 자체 차트 | 구성이 단순하고 차트 구조를 학습할 수 있음 | 클러스터(StatefulSet + local-path) | 서비스별 인스턴스, 복제 구성 |
| DB 운영 | Flyway, 매일 `mysqldump` CronJob | 스키마 변경을 코드로 관리하고 백업을 단순하게 유지함 | `services/`, `deploy/` | 수동 SQL, 백업 도구 도입 |
| 스토리지 | local-path-provisioner | 설치가 가장 쉬움. 노드 장애 시 데이터 복제는 없음 | 클러스터 | Longhorn, Ceph |
| 가용성 범위 | 앱 서비스 파드 2개 이상, 인프라와 Whisper는 1개 | 복제 구성의 부담 없이 앱 수준의 무중단을 학습함 | `deploy/` | 인프라 전체 이중화 |
| 서비스 사이 호출 | HTTP, 허용 목록 3건, 멤버십 캐시 TTL 3초 | 권한 회수 5초 기준(US-04)을 지키고 호출 구조를 단순하게 유지함 | `services/libs/common/` | gRPC, 메시지 큐 |
| 메시징 | Redis pub/sub | 파드 간 실시간 전달에 충분하고 LiveKit Egress와 함께 쓸 수 있음 | 클러스터 | Valkey, Kafka |
| 예약 작업 | DB 작업 테이블 + Spring Scheduler(`SKIP LOCKED`) | 추가 도구 없이 알림과 Google 반영의 재시도와 중복 방지를 처리함 | notification, calendar | Quartz, 메시지 큐 |
| 파일 저장소 | SeaweedFS(S3 API) | 클러스터 안에서 S3 방식을 학습할 수 있음 | 클러스터 | MinIO, 외부 S3 |
| 파일 미리보기 | PDF, 이미지, 텍스트를 브라우저로 표시 | 문서 변환 서버가 필요 없음 | `services/web/`, file | LibreOffice 변환 |
| 화상 | LiveKit 자체 설치, 내장 TURN | 8명 통화와 화면 공유를 직접 구현하지 않음 | 클러스터(메시 밖) | 직접 WebRTC 구현, 외부 화상 API |
| 회의 음성 수집 | LiveKit Egress(음성만) | LiveKit이 제공하는 방식이고 저장 위치로 S3를 쓸 수 있음 | 클러스터, SeaweedFS | 브라우저 녹음 후 업로드 |
| 음성 텍스트 변환 | Whisper 오픈소스 모델 `small`(CPU), HTTP 컨테이너로 실행(whisper-asr-webservice 후보) | 자체 운영할 수 있고 변환 코드를 직접 만들지 않음. 정확도와 시간은 측정 후 조정 | 클러스터(메시 밖), meeting에서 호출 | 외부 STT API, 별도 작업자 구현 |
| 공동 편집 | Yjs + Hocuspocus(Redis 확장), Tiptap, Excalidraw | CRDT를 직접 구현하지 않고 파드 간 동기화 기능을 쓸 수 있음 | `services/document/`, `services/web/` | 직접 CRDT 구현, Automerge |
| 실시간 전달 | STOMP WebSocket + Redis(chat, board, notification) | 같은 방식을 재사용해 학습 부담을 줄임 | 각 서비스 | 서비스마다 다른 방식, 폴링 |
| 알림 경로 | 웹: WebSocket, 이메일: Spring Mail + Gmail SMTP | 외부 푸시 서비스 없이 시작할 수 있음. 페이지를 닫으면 이메일로만 받음 | notification | Web Push, FCM, SES |
| 외부 일정 | Google Calendar API, OAuth 테스트 모드 | 팀 내 시연에 충분하고 앱 검증 절차가 필요 없음 | calendar | 양방향 동기화, CalDAV |
| Gateway | Envoy Gateway: TLS 종료, 라우팅, JWT 검증 | Kubernetes Gateway API를 학습하고 외부 진입과 메시의 역할을 나눔 | 클러스터 | Istio Gateway, NGINX |
| 서비스 메시 | Istio 사이드카 모드: mTLS STRICT, `AuthorizationPolicy` | 서비스 코드 변경 없이 mTLS와 접근 제어를 적용함 | 클러스터(Envoy Gateway, 앱 서비스) | Linkerd, 앰비언트 모드 |
| 클러스터 | kubeadm + Calico, MetalLB(사설 IP 풀) | 제공된 VM에 직접 구축하며 쿠버네티스를 학습함 | dev, prod VM | 관리형 쿠버네티스, k3s |
| 인증서 | cert-manager + Let's Encrypt DNS-01(Route 53) | 사설 IP에서도 발급할 수 있음 | 클러스터 | 수동 인증서, HTTP-01 |
| CD | Argo CD(App of Apps), 클러스터별 설치 | 설치와 인증이 단순하고 `git revert`로 롤백할 수 있음 | `deploy/argocd/` | Argo CD 한 곳 통합, 수동 Helm |
| CI | Jenkins(JCasC), SCM 폴링 | 사설망에서 웹훅 없이 동작하고 설정을 코드로 관리함 | CI 전용 VM, `deploy/ci/` | GitHub Actions |
| 레지스트리 | GHCR, `imagePullSecret` | GitHub와 함께 관리할 수 있고 별도 설치가 없음 | GitHub | Harbor, Docker Hub |
| 관측 | kube-prometheus-stack, Kiali, Loki + Alloy, Micrometer, 보관 7일 | 지표, 로그, 알림을 한 번에 구성함 | 클러스터 | ELK, 분산 추적 도입 |
| 백엔드 테스트 | JUnit 5, Mockito, Testcontainers(MySQL, Redis), Spotless | Spring 표준 구성이고 실제 DB로 검증할 수 있음 | `services/` | H2 인메모리 DB |
| document 테스트 | Vitest | 프론트와 같은 도구를 씀 | `services/document/` | 테스트 생략 |
| 프론트 테스트 | Vitest, React Testing Library, ESLint, Prettier | Vite와 잘 맞고 설정이 적음 | `services/web/` | Jest |
| API 계약 | REST: springdoc OpenAPI → `openapi-typescript`, WebSocket: 메시지 형식 표 | 프론트 타입을 자동 생성하고, WebSocket은 문서로 간단히 맞춤 | `services/`, `docs/api/` | 수동 타입 작성, AsyncAPI |
| 성능 측정 | k6 | 스크립트가 쉽고 HTTP와 WebSocket을 모두 측정할 수 있음 | `services/` | JMeter |
| E2E | 자동화하지 않고 수용 기준 체크리스트로 수동 확인 | 구현 학습에 시간을 쓰고 데모 때 직접 확인함 | `docs/` | Playwright |
