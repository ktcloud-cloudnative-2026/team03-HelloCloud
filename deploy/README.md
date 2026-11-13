# deploy

Helm 차트와 values, Argo CD 앱, 배포 검증 스크립트.
Argo CD에 등록된 앱은 `main`의 배포 설정 변경을 감지해 배포합니다.

```
deploy/
  cluster/           손 작업 절차: kubeadm, Calico, Argo CD, DB VM(MySQL)
  argocd/            Application (platform/, services/), 상위 앱 없음
  charts/            자체 차트: spring-service(서비스 공용), web
  values/<앱>/       values.yaml, values-dev.yaml, values-prod.yaml
  manifests/         gateway/dev/: GatewayClass, Gateway, HTTPRoute, ReferenceGrant
  scripts/           validate-helm.sh: 공통 Spring 차트 검증
```

## Envoy Gateway와 HTTP 경로 (dev)

2026-11-13에 `t4-dev-cp`에서 실제 YAML을 읽어 `manifests/gateway/dev/`와
대조했습니다. 생성 시간, UID, 상태, `last-applied-configuration`은 저장하지 않습니다.

- `ideaconnection-dev/hellocloud-gateway`: `eg-test` 클래스, HTTP 80,
  같은 namespace의 Route만 허용합니다.
- `web-route`: `/` → `web:80`.
- `keycloak-route`: `/realms`, `/resources`, `/admin` → `keycloak/keycloak:8080`.
  경로를 변경하지 않습니다.
- `keycloak/allow-hellocloud-gateway`: `ideaconnection-dev`의 HTTPRoute가
  `keycloak` Service를 참조하도록 허용합니다. Route 이름으로는 제한할 수 없습니다.
- `10.10.24.101`은 MetalLB가 할당한 현재 주소입니다. `status`의 값을
  `spec.addresses`에 복사하지 않으므로 재생성 시 같은 IP를 보장하지 않습니다.

현재 HTTP 구성과 `/admin` 노출을 보존하며 내부 dev 접속에 사용합니다.
HTTPS·로그인 토큰 검사·`/api` 연결은 이번 범위에 포함하지 않았습니다.
[설계의 보안 목표](../docs/architecture.md#5-네트워크--보안)는 별도 구현이 필요합니다.
Keycloak Deployment, Service, Secret과 Realm `hellocloud`, Client `hellocloud-web`은
관리 범위에 넣지 않습니다. Realm은 공개 OIDC 설정으로 확인하며,
Client는 전달받은 이름을 유지하고 관리자 API로 재확인하지 않습니다.

### 관리 범위와 최초 이관

`argocd/platform/gateway-dev.yaml`은 위의 리소스 5개만 관리합니다.
`web-dev`, `user-service-dev`의 Deployment와 Service는 그대로 둡니다.
`FailOnSharedResource=true`로 다른 앱의 관리 대상과 겹치면 동기화를 중단합니다.
`prune: false`로 자동 삭제를 막습니다. 공용 `eg-test`는 `envoy-test/test-gateway`도
사용하므로 별도로 `Prune=false,Delete=false`를 지정했습니다.
GatewayClass는 클러스터 공용 리소스라 namespace가 없습니다.

`argocd/platform/envoy-gateway-dev.yaml`은 공식 차트를 `v1.9.3`에 고정하고
기존 namespace `envoy-gateway-system`과 릴리스 이름 `eg`를 유지합니다.
실제 Helm 사용자 지정 값은 비어 있습니다. 공통 values는 이 기본값을 사용하고,
dev values는 기존 인증서 생성 Job, 관련 권한, topology webhook의 hook 7개를
`Skip`으로 제외합니다. 기존 인증서와 webhook을 재생성하거나 덮어쓰지 않습니다.
컨트롤러의 일반 리소스 12개와 CRD 21개가 이관 대상입니다.
이 설정은 **이미 설치된 dev의 이관용**입니다. 신규 클러스터의 인증서 초기 생성이나
갱신을 자동화하지 않으며, prod 값도 확인하지 않아 prod 앱과 values는 만들지 않았습니다.

컨트롤러 앱은 **수동 동기화**입니다. 큰 CRD는 서버 측 적용을 사용하고,
클라이언트 측 적용을 거치는 중간 이관은 끕니다.
Argo CD는 Helm을 템플릿 생성에만 사용하므로 기존 Helm 릴리스 기록은 갱신하지 않습니다.
이관 후 동일 리소스에 `helm upgrade/uninstall`을 병행하지 않습니다.

1. 아래 검증으로 spec과 소유권을 대조합니다. Deployment/Service 교체, hook 실행,
   CRD 변경이나 삭제가 계획에 있으면 진행하지 않습니다.
2. main 반영과 실제 환경 변경 승인을 받은 뒤 [Argo CD 최초 등록 절차](cluster/README.md#argo-cd-dev)로
   위의 Application 2개를 등록합니다. 상위 앱은 추가하지 않습니다.
   `gateway-dev`는 등록 직후 자동 동기화하므로 앱 등록 자체가 승인 대상입니다.
3. 컨트롤러는 Argo CD diff에서 hook 제외와 변경 내용을 확인하고 별도 승인 후 수동 Sync합니다.
   Force, Replace, Prune은 사용하지 않습니다. 자동 동기화 전환은 이관 확인 후 별도 PR로 결정합니다.

### 검증과 운영 확인

저장소 루트에서 실행합니다. kubectl은 dev 컨텍스트가 있는 cp에서 사용합니다.
로컬 컨텍스트가 없다면 kubeconfig를 복사하지 않고 SSH로 확인합니다.

```bash
bash deploy/scripts/validate.sh
helm template eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.9.3 --namespace envoy-gateway-system --include-crds \
  -f deploy/values/envoy-gateway/values.yaml \
  -f deploy/values/envoy-gateway/values-dev.yaml > /tmp/envoy-gateway-rendered.yaml
kubectl apply --dry-run=client -f /tmp/envoy-gateway-rendered.yaml
kubectl apply --dry-run=client -f deploy/manifests/gateway/dev/
kubectl apply --server-side --field-manager=envoy-gateway-gitops-check \
  --dry-run=server -f deploy/manifests/gateway/dev/
kubectl apply --dry-run=client -f deploy/argocd/platform/
kubectl apply --server-side --field-manager=envoy-gateway-gitops-check \
  --dry-run=server -f deploy/argocd/platform/
```

기존 `validate.sh`는 스키마가 없는 리소스를 건너뛰므로 Gateway API와
Application은 위의 서버 측 dry-run으로 설치된 CRD에 맞춰 추가 검증합니다.
컨트롤러의 서버 측 dry-run은 렌더링에서 `argocd.argoproj.io/hook: Skip`인 리소스를
먼저 제외합니다. Helm 소유권과 API 기본값 때문에 충돌할 수 있으므로, 읽기 전용
`--dry-run=server --force-conflicts`로 반환된 spec을 현재 spec과 비교합니다.
실제 적용에 `--force-conflicts`를 실행하는 것은 이번 검증에 포함하지 않습니다.
앱 등록 후에는 `argocd app diff gateway-dev`, `argocd app diff envoy-gateway-dev`도 확인합니다.
미등록 상태에서는 해당 diff를 실행할 수 없습니다.

```bash
kubectl get applications -n argocd
kubectl get gateway hellocloud-gateway -n ideaconnection-dev -o yaml
kubectl get httproute web-route keycloak-route -n ideaconnection-dev -o yaml
kubectl get referencegrant allow-hellocloud-gateway -n keycloak -o yaml
kubectl get gatewayclass eg-test -o yaml
kubectl rollout status deployment/envoy-gateway -n envoy-gateway-system
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://10.10.24.101/
curl --fail --silent http://10.10.24.101/realms/hellocloud/.well-known/openid-configuration
curl --silent --output /dev/null --write-out '%{http_code}\n' http://10.10.24.101/admin/
```

Gateway의 `Accepted`·`Programmed`, 두 Route의 `Accepted`·`ResolvedRefs`가
`True`인지 확인합니다. `/`와 Realm 공개 설정은 200, `/admin/`은 로그인 화면으로의
리다이렉트 또는 200을 기대합니다. 공개 issuer가 기존 OIDC 설정과 일치하는지도 확인합니다.
`/resources`는 로그인 화면이 참조하는 실제 정적 파일로 확인합니다.
최종 로그인은 기존 Client로 브라우저에서 확인하며, 비밀번호나 토큰은 기록하지 않습니다.

문제가 생기면 이전 설정으로 되돌리는 `git revert`의 PR을 사용합니다.
첫 추가를 revert해 파일만 지우면 prune이 꺼져 있어 클러스터 리소스는 삭제되지 않습니다.
삭제나 Helm 재설치로 롤백하지 않습니다.

참고: [Envoy Gateway v1.9 Helm 설치](https://gateway.envoyproxy.io/v1.9/install/install-helm/),
[Argo CD Helm 관리와 hook](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/),
[Git values 연결](https://argo-cd.readthedocs.io/en/stable/user-guide/multiple_sources/)

## 공통 Spring 차트 로컬 검증

현재 `charts/spring-service/`에는 Deployment와 내부 접속용 Service가 있으며,
`values/user-service/values.yaml`에는 포트와 Secret 참조가 있습니다.
공통 이미지 주소는 CI 작업 브랜치의
`ghcr.io/ktcloud-cloudnative-2026/idcn-user-service`에 맞췄습니다.
환경별 커밋 SHA는 `values-dev.yaml`, `values-prod.yaml`에 넣습니다.
dev는 파드 1개,
prod는 파드 2개로 시작하며, prod의 파드 수는 실제 부하를 확인하고 조정합니다.

Helm `v4.3.1`로 검증했습니다. CI는 GitHub Actions를 사용하기로 결정했습니다.
저장소 루트에서 실행합니다. 아래 이미지 주소와 SHA는 설정 생성만 확인하는
가짜 값입니다. 실제 배포에 사용하지 않습니다. namespace도 검증용 이름입니다.

```bash
helm lint deploy/charts/spring-service --strict \
  -f deploy/values/user-service/values.yaml \
  -f deploy/values/user-service/values-dev.yaml \
  --set-string image.repository=example.invalid/hellocloud/user-service \
  --set-string image.tag=0000000

helm template user-service deploy/charts/spring-service \
  --namespace ideaconnection-dev \
  -f deploy/values/user-service/values.yaml \
  -f deploy/values/user-service/values-dev.yaml \
  --set-string image.repository=example.invalid/hellocloud/user-service \
  --set-string image.tag=0000000
```

두 명령은 클러스터를 변경하지 않습니다. 이미지 주소와 태그를 생략하면
`helm template`은 오류를 내도록 했습니다. `user-service-env`는 배포 전에
대상 namespace에 준비해야 할 Secret 참조 이름이며, 실제 값은 저장소에 넣지 않습니다.

prod도 같은 명령에서 `values-prod.yaml`과 `ideaconnection-prod`로 바꿔 검증합니다.
두 환경의 lint·렌더링과 이미지 설정 누락 시 실패하는 동작은 한 번에 검사할 수 있습니다.
GitHub Actions에서 이 검사를 호출하는 코드는 PR #71에 반영돼 있습니다.
로컬에서는 아래 명령으로 실행합니다.

```bash
bash deploy/scripts/validate-helm.sh
```

초기 구동 중 DB 연결과 애플리케이션 준비를 기다리도록 startup probe를 둡니다.
5초 간격으로 최대 60회 확인한 뒤에도 기동하지 못하면 재시작합니다.
기동 확인 뒤에 liveness와 readiness 검사를 시작합니다.

## dev 자동 배포

`argocd/services/user-service-dev.yaml`은 dev 클러스터에 설치된 Argo CD의
`argocd` namespace에서 사용하는 Application입니다. `main`의 공통 values와
dev values를 순서대로 읽어 `ideaconnection-dev` namespace에 배포합니다.
자동 동기화는 Git에서 지운 리소스도 지우고(`prune`), 클러스터에서 수동으로
바꾼 설정도 Git 상태로 되돌립니다(`selfHeal`). namespace는 동기화할 때 만듭니다.

실제 dev 배포 전 다음 항목을 준비합니다.

- GHCR에 업로드된 이미지의 커밋 SHA를 dev values의 `image.tag`에 입력합니다.
  CI 작업 브랜치는 접두사 없이 커밋 SHA 앞 7자리를 태그로 사용합니다. GHCR 패키지는
  공개라서 이미지 다운로드용 Secret은 필요 없습니다.
- 대상 namespace에 `user-service-env` Secret을 준비합니다. 필요한 키는
  `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OIDC_ISSUER_URI`입니다.
- 최신 main의 서비스 설정은 8081 포트와 `/health/liveness`, `/health/readiness`로
  차트와 일치합니다. 실제 이미지에서도 해당 주소가 응답하는지 확인합니다.
- 저장소가 공개라서 Argo CD는 따로 등록하지 않아도 읽을 수 있습니다. Application을
  등록하는 상위 앱은 아직 없으므로 처음 등록은 [cluster/README.md](cluster/README.md#argo-cd-dev)의
  절차로 합니다.

실제 환경 변경은 승인 후 진행합니다. 배포 후에는 Argo CD의 `Synced`, `Healthy`,
Deployment의 준비된 파드 1개, 파드 이벤트와 로그의 DB·로그인 서버 연결 상태를
확인합니다.

## 담당자 간 연결 정보

현재 차트가 제공하는 user-service 연결 정보입니다. Gateway 담당자와 경로를
확정한 뒤 HTTPRoute는 Gateway 담당 구성에서 연결합니다.

| 항목 | 현재 설정 |
|---|---|
| dev namespace | `ideaconnection-dev` |
| Service 이름·포트 | `user-service:80` (컨테이너 `8081`) |
| 내부 주소 | `user-service.ideaconnection-dev.svc.cluster.local` |
| 백엔드 API | `/api/users/me`, `/api/orgs` (경로를 그대로 전달) |
| 상태 확인 | `/health/liveness`, `/health/readiness` |
| Secret 참조 | `user-service-env`의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OIDC_ISSUER_URI` |

Gateway의 HTTPRoute가 다른 namespace에 있으면 별도 접근 허용 설정이 필요합니다.
같은 namespace에서 Service를 참조하는 구성을 우선 담당자와 맞춥니다.
Keycloak issuer는 토큰의 issuer와 정확히 일치하고 서비스에서도 접속 가능해야 합니다.

## 웹 배포 준비

PR #68의 웹 Dockerfile은 정적 화면을 Nginx의 80번 포트에서 제공합니다.
Spring 서비스와 상태 확인 주소가 달라 `charts/web/`에 웹 전용 차트를 둡니다.
startup·liveness·readiness 검사는 모두 `/`의 HTTP 응답을 확인합니다.
이 검사는 웹 서버의 응답 확인이며 로그인이나 API 연결 성공을 뜻하지 않습니다.

- 공통 values: `deploy/values/web/values.yaml`
- 환경별 values: `deploy/values/web/values-dev.yaml`, `values-prod.yaml`
- 이미지: `ghcr.io/ktcloud-cloudnative-2026/idcn-web`
- dev Application: `deploy/argocd/services/web-dev.yaml`
- Gateway 연결 대상: `ideaconnection-dev` namespace의 `web:80`
- dev는 파드 1개, prod는 2개로 설정합니다. prod Application은 아직 작성하지 않았습니다.

`bash deploy/scripts/validate-helm.sh`는 user-service와 웹의 dev·prod 설정을
모두 검사합니다. 실제 이미지가 없어도 설정 검사는 가능하며 서버를 변경하지 않습니다.
검증용 이미지 주소는 실제 배포에 사용하지 않습니다.

웹 Application은 main의 웹 차트와 공통·dev values를 읽습니다.
실제 배포 전 Gateway 담당자와 웹 경로 및 `/api`의 백엔드 연결을 확인합니다.
웹 이미지에는 DB·Keycloak Secret을 주입하지 않습니다. 정적 화면의 API·Keycloak
주소는 프론트 담당자와 빌드 시 주입 여부를 확인해야 합니다.
컨테이너 환경 변수만 추가한다고 이미 빌드된 화면의 설정이 바뀌지는 않습니다.
웹 이미지 실행과 Gateway·로그인 연결은 아직 검증하지 않았습니다.

## GitHub Actions 연결

서비스 코드는 PR로 검사한 뒤 main에 머지합니다. 이후 GitHub Actions가
이미지를 빌드해 GHCR에 업로드하고,
`deploy/values/user-service/values-dev.yaml`의 `image.tag`를 갱신합니다.
이 태그 변경은 별도 PR 없이 Actions가 자동으로 커밋해 main에 직접 push합니다.
Argo CD는 main의 태그 변경을 감지해 dev에 배포합니다.
업로드된 이미지와 동일한 커밋 SHA를 사용하며,
SHA를 줄이면 CI와 values에서 같은 길이를 사용합니다.
웹 태그도 `deploy/values/web/values-dev.yaml`의 `image.tag`로 같은 방식으로 갱신합니다.
이미지 주소도 CI 담당자와 확인합니다. 현재 주소는 기존 CI 브랜치를 기준으로 한 값입니다.

Actions 워크플로와 공통 배포 검사는 [PR #71](https://github.com/ktcloud-cloudnative-2026/team03-HelloCloud/pull/71)에서 관리합니다.
코드에서 확인한 연결과 실제 환경에서 확인할 항목은 다음과 같습니다.

- PR #71의 Actions는 `bash deploy/scripts/validate.sh`를 실행합니다.
  이 스크립트는 `validate-helm.sh`가 있으면 공통 Spring 차트 검사를 맡기고,
  기존 YAML·리소스 검사도 수행합니다.
- 이미지 태그 갱신 경로와 `image.tag` 키는 PR #71 코드와 일치합니다.
  두 PR을 main에 반영한 상태에서의 검사와 실제 이미지 업로드·자동 배포는
  별도로 확인해야 합니다.
- CI 담당자는 저장소 Secret `CI_PUSH_TOKEN`과 main 직접 push에 필요한 권한·보호 규칙
  예외를 준비합니다. 토큰 등록만으로 보호 규칙을 우회할 수 있는 것은 아닙니다.
  토큰 값은 문서나 Git에 기록하지 않습니다. 팀 공통 규칙의 변경은 CI 전환 작업
  #70에서 함께 정리합니다.

## 실제 배포 확인 순서

dev 이미지 태그는 채워져 있고 GHCR 이미지는 공개입니다. 클러스터 배포는 아직 검증하지 않았습니다.
다음 준비를 마친 뒤 실제 환경 변경 승인을 받고 진행합니다.

1. 백엔드 담당자와 배포할 이미지 SHA를 확인하고 dev values에 반영합니다.
2. 인프라 담당자에게 dev DB·Keycloak 준비 여부와 Secret 존재 여부를 확인합니다.
   백엔드는 시작할 때 Flyway로 DB 구조를 변경하므로 DB 마이그레이션을 포함한
   첫 기동 승인을 받습니다. Secret 값은 Git이나 검증 결과에 기록하지 않습니다.
3. Argo CD 담당자와 저장소 접근, main에 반영된 차트, Application 최초 등록 경로를 확인합니다.
4. 배포 후 `Synced`, `Healthy`와 준비된 파드 1개를 확인합니다.
5. Gateway를 통한 Keycloak 로그인 후 `/api/users/me`, 조직 생성·목록을 확인합니다.
   프론트 인증·API 연결이 완료되어야 화면 전체 흐름을 검증할 수 있습니다.

되돌릴 때는 이미지 태그 변경을 `git revert`하는 PR을 사용합니다.
이미지 롤백으로 DB 마이그레이션은 되돌아가지 않으므로 스키마 호환성은
백엔드 담당자와 확인합니다.
