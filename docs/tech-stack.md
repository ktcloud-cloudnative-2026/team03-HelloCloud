# 기술 스택

[← 아키텍처](architecture.md) · [README](../README.md) · 다음: [API 명세](api/)

> 채울 항목의 예입니다. 팀 프로젝트에 맞게 항목을 더하거나 빼도 됩니다.
>
> 외부 도구로 써도 됩니다(추천: [Notion](https://www.notion.so)). 그 경우 이 파일에는 링크와 한 줄 요약만 남깁니다.

영역마다 "왜 이것인가"를 한 줄로 씁니다. 나중에 바꾸면 [결정 기록](adr/)에 이유를 남깁니다.

| 영역 | 선택 | 왜 | 어디에 | 버린 대안 |
|---|---|---|---|---|
| 서비스 구조 | 기능별 마이크로서비스 5개, 공용 Helm 차트 | | `services/`, `deploy/charts/` | |
| 서비스 언어 | Java LTS + Spring Boot, Gradle 멀티 프로젝트 | | `services/` | |
| 프론트 | React + Vite + TypeScript | | `services/web/` | |
| 인증 | Keycloak(Operator), OIDC + PKCE | | 클러스터 | |
| DB | MySQL 8.4 인스턴스 1개, 서비스별 database와 계정, 자체 차트 | | 클러스터(StatefulSet + Longhorn) | |
| 서비스 사이 호출 | HTTP, 멤버십 확인 1건, 30초 캐시 | | `services/libs/common/` | |
| 메시징 | Valkey pub/sub | | 클러스터 | |
| 파일 저장소 | SeaweedFS(S3 API) | | 클러스터 | |
| 화상 | LiveKit 자체 설치, 내장 TURN | | 클러스터(메시 밖) | |
| Gateway | Envoy Gateway: TLS 종료, 라우팅, JWT 검증 | | 클러스터 | |
| 서비스 메시 | Istio 사이드카 모드: mTLS STRICT, `AuthorizationPolicy` | | 클러스터 | |
| 클러스터 | kubeadm + Calico, Longhorn, MetalLB(사설 IP 풀) | | dev, prod VM | |
| 인증서 | cert-manager + Let's Encrypt DNS-01(Route 53) | | 클러스터 | |
| CD | Argo CD(App of Apps) | | `deploy/argocd/` | |
| CI | Jenkins(JCasC), SCM 폴링 | | CI 전용 VM, `deploy/ci/` | |
| 레지스트리 | GHCR | | GitHub | |
| 관측 | kube-prometheus-stack, Kiali, Loki + Alloy | | 클러스터 | |
| 백엔드 테스트 | JUnit 5, Mockito, Testcontainers(MySQL, Valkey), Spotless | | `services/` | |
| 프론트 테스트 | Vitest, React Testing Library, ESLint, Prettier | | `services/web/` | |
| API 계약 | springdoc OpenAPI → `openapi-typescript` | | `services/` | |
| E2E | 자동화하지 않음 | | | |

## 고르는 기준
- 요구사항(특히 [비기능](requirements.md#2-비기능-요구사항))에 맞나
- 팀이 운영할 수 있나 — 배운 것, 익히는 시간
- 클러스터 자원 안에 들어가나
- 대안과 비교했나
