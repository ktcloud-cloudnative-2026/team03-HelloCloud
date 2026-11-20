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

2026-11-13에 기존 dev 리소스를 유지한 채 두 Application의 최초 동기화를 완료했습니다.
Gateway 리소스 5개와 컨트롤러·CRD 33개를 Argo CD가 관리하며, 두 앱은
`Synced`, `Healthy`, 마지막 동기화 `Succeeded`를 확인했습니다.
기존 리소스의 UID와 spec, 인증서 Secret, Webhook, Helm 릴리스와 Gateway IP는 유지했습니다.
생성 시간, UID, 상태, `last-applied-configuration`은 매니페스트에 저장하지 않습니다.

- `ideaconnection-dev/hellocloud-gateway`: `eg-test` 클래스, HTTP 80,
  같은 namespace의 Route만 허용합니다.
- `web-route`: `/` → `web:80`.
- `keycloak-route`: `/realms`, `/resources`, `/admin` → `keycloak/keycloak:8080`.
  경로를 변경하지 않습니다.
- `user-service-route`: `/api/users`, `/api/orgs` → `user-service:80`. 경로 앞부분을
  자르지 않고 그대로 전달합니다. 다른 서비스도 `/api` 아래를 쓰므로 서비스별 경로만 연결합니다.
- `chat-service-route`: `/api/chat` → `chat-service:80`. WebSocket(`/api/chat/ws`)도
  같은 경로로 연결합니다.
- `keycloak/allow-hellocloud-gateway`: `ideaconnection-dev`의 HTTPRoute가
  `keycloak` Service를 참조하도록 허용합니다. Route 이름으로는 제한할 수 없습니다.
- `10.10.24.101`은 MetalLB가 할당한 현재 주소입니다. `status`의 값을
  `spec.addresses`에 복사하지 않으므로 재생성 시 같은 IP를 보장하지 않습니다.

현재 HTTP 구성과 `/admin` 노출을 보존하며 내부 dev 접속에 사용합니다.
HTTPS와 Gateway의 로그인 토큰 검사는 아직 없습니다. 토큰은 각 서비스가 검사합니다.
[설계의 보안 목표](../docs/architecture.md#5-네트워크--보안)는 별도 구현이 필요합니다.
Keycloak Deployment, Service, Secret과 Realm `hellocloud`, Client `hellocloud-web`은
관리 범위에 넣지 않습니다. Realm은 공개 OIDC 설정으로 확인하며,
Client는 전달받은 이름을 유지하고 관리자 API로 재확인하지 않습니다.

### 관리 범위와 최초 이관

`argocd/platform/gateway-dev.yaml`은 위의 리소스와 `manifests/gateway/dev/`의 다른 Route만 관리합니다.
`web-dev`, `user-service-dev`의 Deployment와 Service는 그대로 둡니다.
`FailOnSharedResource=true`로 다른 앱의 관리 대상과 겹치면 동기화를 중단합니다.
`prune: false`로 자동 삭제를 막습니다. 공용 `eg-test`는 `envoy-test/test-gateway`도
사용하므로 별도로 `Prune=false,Delete=false`를 지정했습니다.
GatewayClass는 클러스터 공용 리소스라 namespace가 없습니다.

`gateway-dev`는 자동 동기화와 selfHeal이 켜져 있습니다. 팀원은
`deploy/manifests/gateway/dev/` 바로 아래에 HTTPRoute YAML을 추가해 PR로 main에
반영합니다. 같은 namespace의 Route는 `ideaconnection-dev`와
`parentRefs.name: hellocloud-gateway`를 사용합니다. 추가·수정은 Argo CD가 자동 반영하므로
별도 `kubectl apply`가 필요 없습니다. 삭제는 prune이 꺼져 있어 자동 반영하지 않습니다.

`argocd/platform/envoy-gateway-dev.yaml`은 공식 차트를 `v1.9.3`에 고정하고
기존 namespace `envoy-gateway-system`과 릴리스 이름 `eg`를 유지합니다.
실제 Helm 사용자 지정 값은 비어 있습니다. 공통 values는 이 기본값을 사용하고,
dev values는 기존 인증서 생성 Job, 관련 권한, topology webhook의 hook 7개를
`Skip`으로 제외합니다. 기존 인증서와 webhook을 재생성하거나 덮어쓰지 않습니다.
컨트롤러의 일반 리소스 12개와 CRD 21개가 이관 대상입니다.
이 설정은 **이미 설치된 dev의 이관용**입니다. 신규 클러스터의 인증서 초기 생성이나
갱신을 자동화하지 않으며, prod 값도 확인하지 않아 prod 앱과 values는 만들지 않았습니다.

컨트롤러 앱은 **수동 동기화**를 유지합니다. 큰 CRD는 `ServerSideApply=true`로
서버 측 적용을 사용하고, `ClientSideApplyMigration=false`로 클라이언트 측 적용을
거치는 중간 이관을 끕니다. 클라이언트 측 적용은 큰 CRD에서 annotation 크기 제한으로
실패할 수 있습니다.
Argo CD는 Helm을 템플릿 생성에만 사용하므로 기존 Helm 릴리스 기록은 갱신하지 않습니다.
이관 후 동일 리소스에 `helm upgrade/uninstall`을 병행하지 않습니다.

기존 dev에는 두 앱이 이미 등록돼 있으므로 다시 설치하거나 등록할 필요가 없습니다.
재등록 검증이 필요하면 먼저 Gateway 앱 사본의 `automated.enabled`, `prune`, `selfHeal`을
모두 false로 두고 승인 후 수동 상태로 등록합니다. main의 YAML은 등록 즉시 자동 동기화되므로
그대로 검증용 등록에 사용하지 않습니다. 상위 앱은 없습니다.

컨트롤러 변경은 실제 Argo CD Diff와 Helm 필드 소유권을 확인하고 승인 후 수동 Sync합니다.
UI나 CLI의 정상 동기화 요청을 사용합니다. Application의 `operation`을 직접 생성하는 경우
`spec.syncPolicy.syncOptions`를 `operation.sync.syncOptions`에도 반드시 전달해야 합니다.
`Synced/Healthy`만으로 완료를 판단하지 않고 동기화 작업의 `Succeeded`와 대상 리소스의
`argocd-controller` 필드 관리자도 확인합니다. Force, Replace, Prune은 사용하지 않습니다.
서버 측 적용에서 사용하는 `--force-conflicts`도 실제 충돌 필드 확인과 별도 승인 없이 사용하지 않습니다.

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
dry-run은 실제 리소스를 변경하지 않습니다. 실제 Sync의 강제 충돌 처리는 확인된 필드에 대한
승인을 먼저 받습니다.
앱 등록 후에는 `argocd app diff gateway-dev`, `argocd app diff envoy-gateway-dev`도 확인합니다.
미등록 상태에서는 해당 diff를 실행할 수 없습니다.

```bash
kubectl get applications -n argocd
kubectl get gateway hellocloud-gateway -n ideaconnection-dev -o yaml
kubectl get httproute web-route keycloak-route user-service-route -n ideaconnection-dev -o yaml
kubectl get referencegrant allow-hellocloud-gateway -n keycloak -o yaml
kubectl get gatewayclass eg-test -o yaml
kubectl rollout status deployment/envoy-gateway -n envoy-gateway-system
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://10.10.24.101/
curl --fail --silent http://10.10.24.101/realms/hellocloud/.well-known/openid-configuration
curl --silent --output /dev/null --write-out '%{http_code}\n' http://10.10.24.101/admin/
```

Gateway의 `Accepted`·`Programmed`, 세 Route의 `Accepted`·`ResolvedRefs`가
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

자원은 서비스마다 `values/<서비스>/values.yaml`의 `resources`에 둡니다. 2026-11-18 `kubectl top`으로 잰
평소 사용량(user 462Mi, file 385Mi)을 보고 정했습니다.

- requests(미리 맡아 두는 양): CPU 100m, 메모리 512Mi. HPA는 이 CPU 값 대비 몇 %를 쓰는지로 파드 수를 정합니다
- limits(상한): 메모리 1Gi. 넘으면 파드가 재시작됩니다. CPU 상한은 두지 않습니다. Java는 시작할 때 CPU를 많이 써서
  상한이 있으면 기동이 느려집니다
- `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=65`: Java는 메모리 상한이 있으면 기본으로 그 1/4만 heap(작업 공간)으로
  써서 금방 모자랍니다. 상한의 65%(약 665Mi)까지 쓰게 합니다. 나머지는 heap 밖에서 쓰는 메모리(클래스 정보,
  스레드 등) 몫입니다. 너무 높이면 합계가 상한을 넘어 쿠버네티스가 파드를 강제 종료(OOMKilled)합니다

HPA(요청이 몰리면 파드를 자동으로 늘리기)는 공통 차트에 있고 기본은 꺼져 있습니다. 지금은 dev user-service만
`values-dev.yaml`에서 켭니다(파드 1~3개, CPU가 requests 100m의 70%를 넘으면 늘림). 최대 3개는 워커 메모리 여유
(requests 합 2Gi, w1 여유 약 5Gi)를 보고 정했습니다. 켜면 Deployment의 `replicas`는 쓰지 않습니다. 파드 수는
HPA가 정하고, 적어 두면 Argo CD가 매번 원래 수로 되돌리기 때문입니다. 확인: `kubectl get hpa -n ideaconnection-dev`

user · file은 `autoscaling.behavior`로 늘리기 전 2분 동안 CPU가 계속 높은지 봅니다(`scaleUp.stabilizationWindowSeconds: 120`).
Java가 켜질 때 잠깐 CPU를 많이 써서, 이 설정이 없으면 재배포 때마다 파드가 3개로 늘었다가 줄어듭니다(#146).
대신 부하가 갑자기 늘면 파드가 늘기까지 2분쯤 늦어집니다. 차트 기본값은 비어 있어 다른 서비스에는 영향이 없습니다

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
- dev의 `OIDC_ISSUER_URI`는 `http://10.10.24.101/realms/hellocloud`입니다.
  user-service는 토큰의 발급자(`iss`)가 이 값과 정확히 같아야 받아들입니다. 브라우저가
  받은 토큰에는 외부 주소가 들어가므로, 클러스터 내부 주소(`*.svc.cluster.local`)를
  넣으면 모든 요청이 401이 됩니다. 파드에서도 이 외부 주소로 Keycloak에 접근할 수 있습니다.
- Keycloak에는 `KC_HOSTNAME=http://10.10.24.101`을 설정합니다. 없으면 Keycloak이
  요청이 들어온 주소로 발급자를 만들어서, `localhost` 터널로 로그인한 토큰도 401이 됩니다.
  Keycloak 배포는 이 저장소 밖에서 관리합니다.
- 최신 main의 서비스 설정은 8081 포트와 `/health/liveness`, `/health/readiness`로
  차트와 일치합니다. 실제 이미지에서도 해당 주소가 응답하는지 확인합니다.
- 저장소가 공개라서 Argo CD는 따로 등록하지 않아도 읽을 수 있습니다. Application을
  등록하는 상위 앱은 아직 없으므로 처음 등록은 [cluster/README.md](cluster/README.md#argo-cd-dev)의
  절차로 합니다.

실제 환경 변경은 승인 후 진행합니다. 배포 후에는 Argo CD의 `Synced`, `Healthy`,
Deployment의 준비된 파드 1개, 파드 이벤트와 로그의 DB·로그인 서버 연결 상태를
확인합니다.

## 모니터링 (dev)

`argocd/platform/monitoring-dev.yaml`이 공개 차트 kube-prometheus-stack(92.17.1)을
`monitoring` namespace에 설치합니다. Prometheus(지표 수집), Grafana(화면), Alertmanager(경보),
node-exporter(노드 지표), kube-state-metrics(쿠버네티스 상태 지표)가 들어 있습니다.
다른 플랫폼 앱처럼 자동 동기화는 켜지 않았습니다. 동기화는 확인받고 실행합니다.

- 배치: 컨트롤 플레인 노드에 `NoSchedule` taint가 있어 본체는 워커에만 뜹니다.
  node-exporter만 노드마다 하나씩 뜹니다. 2026-11-18 cp는 실제 사용 3.0/3.8Gi라 여유가 없습니다
- 메모리: 구성 요소마다 상한을 둡니다(`values/monitoring/values.yaml`). 합계 상한 약 2.6Gi
- 저장: Prometheus만 `local-path` 5Gi, 보관 3일 · 4GB. 크기를 나중에 못 늘려서 보관 기간과 용량을 함께 묶습니다
- 수집: `app.kubernetes.io/name: spring-service` 이름표가 붙은 Service의 `http` 포트 `/metrics`를 모읍니다(user, file).
  공용 차트는 고치지 않습니다
- DB VM: 클러스터 밖이라 `values/monitoring/values-dev.yaml`에 exporter 주소 4개를 직접 적습니다(`db-vm-node`, `db-vm-mysql`,
  `db-vm-mongodb`, `db-vm-redis`, 꼬리표 `vm=t4-db`). exporter 설치는 `cluster/README.md`의 "DB VM (dev exporter)"
- 끈 것: kubeadm은 controller-manager · scheduler · etcd · kube-proxy 지표를 127.0.0.1에만 열어서
  수집이 항상 실패하므로 끕니다
- Alertmanager: 켜 두지만 받는 곳(Discord)은 아직 없습니다
- 대시보드: Grafana는 저장 공간이 없어 화면에서 만든 대시보드가 재시작하면 사라집니다. 그래서 JSON 파일을
  `manifests/monitoring/dev/`에 두고, 차트의 사이드카(옆에서 같이 도는 도우미)가 `grafana_dashboard: "1"`
  이름표가 붙은 ConfigMap을 찾아 등록하게 합니다. 화면에서 고쳐도 저장되지 않으니 JSON을 고쳐 PR로 올립니다.
  미리 보려면 Dashboards → New → Import에 JSON을 올립니다. 지금은 "HelloCloud 부하 테스트"(#146) 하나입니다

### 처음 설치 순서

1. Grafana 관리자 Secret 만들기 (cp, 확인받고). 비밀번호는 cp 안에서 무작위로 만들어 화면에 띄우지 않습니다.

   ```bash
   kubectl create namespace monitoring
   kubectl create secret generic grafana-admin -n monitoring \
     --from-literal=admin-user=admin \
     --from-literal=admin-password="$(openssl rand -base64 18)"
   ```

2. 앱 등록 (cp, 확인받고): `kubectl apply -f deploy/argocd/platform/monitoring-dev.yaml`
3. Argo CD 화면에서 diff를 보고 동기화 (확인받고). 화면에 들어갈 수 없으면 cp에서 같은 동기화를 요청합니다.

   ```bash
   kubectl -n argocd patch application monitoring-dev --type merge \
     -p '{"operation":{"initiatedBy":{"username":"<본인 GitHub 아이디>"},"sync":{"syncOptions":["CreateNamespace=true","ServerSideApply=true"]}}}'
   ```

   처음 동기화는 몇 분 걸립니다. 준비 작업(Job)과 CRD(새 리소스 종류 정의)가 끝날 때까지
   `waiting for completion of hook`이 보이는 것은 정상입니다.
4. 확인: `kubectl get pods -n monitoring -o wide` (모두 Running, node-exporter 말고는 워커에만)

### 설치 결과 (2026-11-18)

- `monitoring-dev` Synced · Healthy, 파드 8개 Running (node-exporter 3개는 노드마다, 나머지는 워커)
- Prometheus 저장소(PVC) 5Gi Bound
- 수집 대상 모두 up: apiserver, coredns, kubelet, kube-state-metrics, node-exporter,
  Prometheus · Alertmanager · Grafana · operator 자신, user-service, file-service
- Grafana에서 user, file의 요청 수 · 에러율(5xx 0건) · 응답 시간 p95 확인(p95는 #124 배포 후).
  식은 [관측 설계](../docs/observability.md) 참고

### Grafana 보기

대문 경로는 열지 않습니다. 대문도 내부망이라 어차피 터널을 거쳐야 해서, 관리 화면을 하나 더 여는 부담에 비해
얻는 게 적습니다(팀 결정 2026-11-18). cp에서 port-forward를 열고 내 PC에서 SSH로 잇습니다.

```powershell
wsl ssh -L 3000:localhost:3000 t4-dev-cp "kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80"
```

브라우저에서 `http://127.0.0.1:3000`, 아이디 `admin`. 비밀번호는 cp에서
`kubectl get secret grafana-admin -n monitoring -o jsonpath='{.data.admin-password}' | base64 -d; echo`로
본인만 확인합니다(화면 공유 중에는 실행하지 않습니다).

### metrics-server (dev)

HPA(요청이 몰리면 파드를 자동으로 늘리기)와 `kubectl top`은 Prometheus가 아니라 metrics-server의
"지금 사용량"을 씁니다. 그래서 공개 차트 metrics-server(3.14.0)를 `kube-system`에 따로 설치합니다.

- `--kubelet-insecure-tls`: kubeadm의 kubelet은 스스로 만든 인증서를 써서 검사하면 연결이 실패합니다.
  kubelet 인증서를 정식 발급으로 바꾸려면 노드마다 설정을 손으로 바꿔야 해서, 클러스터 안 통신만
  검사를 건너뜁니다
- 메모리 상한 128Mi. 파드 1개가 워커에 뜹니다. values가 아니라 cp의 기본 `NoSchedule` taint 덕분이라, taint를 풀면 cp로 갈 수 있습니다

설치: cp에서 아래로 앱을 등록 → diff 확인 → 동기화 (모두 확인받고). cp의 공용 저장소 폴더는 건드리지 않고
main에 머지된 파일을 바로 씁니다.

```bash
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/platform/metrics-server-dev.yaml
```

확인: `kubectl top nodes`, `kubectl top pods -n ideaconnection-dev`

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
- 자원: requests CPU 10m · 메모리 32Mi, 메모리 상한 64Mi(`values/web/values.yaml`). nginx가 정적 파일만 내줘서 2026-11-19 실사용이 1m · 5Mi입니다
- dev는 파드 1개, prod는 2개로 설정합니다. prod Application과 최초 배포 조건은 아래 "prod 배포 준비"를 따릅니다.

`bash deploy/scripts/validate-helm.sh`는 user-service와 웹의 dev·prod 설정을
모두 검사합니다. 실제 이미지가 없어도 설정 검사는 가능하며 서버를 변경하지 않습니다.
검증용 이미지 주소는 실제 배포에 사용하지 않습니다.

웹 Application은 main의 웹 차트와 공통·dev values를 읽습니다.
실제 배포 전 Gateway 담당자와 웹 경로 및 `/api`의 백엔드 연결을 확인합니다.
웹 이미지에는 DB·Keycloak Secret을 주입하지 않습니다. 화면은 API(`/api`)와
Keycloak(`/realms`)을 지금 접속한 주소로 부르므로 빌드할 때 주소를 넣지 않습니다.
기본 realm은 `hellocloud`, client는 `hellocloud-web`입니다(`services/web/src/auth/keycloak.js`).
컨테이너 환경 변수만 추가한다고 이미 빌드된 화면의 설정이 바뀌지는 않습니다.
웹과 Gateway의 HTTP 응답은 확인했습니다. 실제 사용자 로그인과 인증된 API 연결은 별도 검증이 필요합니다.

### Keycloak 로그인 화면 테마

로그인 · 회원가입 화면이 웹과 같은 서비스로 보이도록 `ideaconnection` 테마를 씁니다.
Keycloak 기본 화면(`keycloak.v2`)의 배치는 그대로 두고 색, 모서리, 글꼴, 로고만 바꿉니다.
파일은 `services/keycloak/themes/ideaconnection/login/`에 있고, 색 값은 웹 `tokens.css`와 맞춥니다.
로고는 웹 아이콘(`services/web/src/brand/brandIcon.js`)과 같은 그림이고, 웹 테스트가 둘이 같은지 확인합니다.

- 로컬: `services/compose.yaml`이 테마 폴더를 붙이고, 로컬 realm 파일이 테마 · 표시 이름 `IdeaConnection` · 기본 언어 한국어를 켭니다
- dev · prod: 아직 적용하지 않았습니다. 두 방법 중 하나를 Keycloak 담당자와 정합니다
  - Keycloak 이미지(`keycloak:26.8.2`)에 테마를 복사한 이미지를 CI로 만들기. **포기하는 점:** 테마를 고칠 때마다 이미지를 다시 만들고 Keycloak을 다시 띄웁니다
  - 테마 폴더를 Keycloak 파드에 볼륨으로 붙이기. **포기하는 점:** 폴더 안의 하위 폴더 구조를 ConfigMap만으로는 담기 어려워 붙이는 방법을 따로 정해야 합니다
- 적용한 뒤 realm 설정 세 가지(로그인 테마 `ideaconnection`, 표시 이름 `IdeaConnection`, 다국어 켜기 · 기본 언어 `ko`)는 Keycloak 관리 화면의 Realm settings에서 바꿉니다

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

dev 이미지 태그는 채워져 있고 GHCR 이미지는 공개입니다. 기존 web·user-service 앱의
`Synced/Healthy`와 Gateway HTTP 응답을 확인했으며, 인증·API 전체 흐름은 아직 검증하지 않았습니다.
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

## prod 배포 준비 (미등록 초안)

관련 이슈: [#137 운영 외부 공개·HTTPS·Keycloak·SeaweedFS](https://github.com/ktcloud-cloudnative-2026/team03-HelloCloud/issues/137).
강사의 [11/19 도메인 선행 작업 안내](https://docs.google.com/document/d/1aVdRTmqnm5zpszbMRa7uHwan-cNoIp0rTYsIZ8kPR_s/edit)에 따라
운영 공개 주소는 `https://ideaconnection.jpexstudio.com`입니다. 강사가 Cloudflare 터널·도메인·외부 HTTPS를
처리하고, 팀은 prod Gateway의 HTTP 80·HTTPRoute·서비스 응답을 준비합니다.
팀이 Gateway 인증서나 cloudflared를 별도로 설치하지 않습니다. #137의 공개 방식 비교는 이전 검토 내용입니다.
#137의 DB VM 회신 대기는 과거 상태이며, 현재 설치 근거는 #142·#150과 `cluster/README.md`입니다.

`argocd/services/`의 web·user-service·file-service·chat-service `*-prod.yaml`은
**운영 클러스터의 Argo CD**에서 사용할 앱입니다. main의 기존 차트와 공통 values,
각 `values-prod.yaml`을 읽어 `ideaconnection-prod`에 배포합니다.
앱 파일을 dev 클러스터에 등록하면 그곳에 운영 이름의 namespace가 생기므로 등록하지 않습니다.
현재는 로컬 초안·검사 단계이며 운영 앱 등록·Secret 생성·실제 배포는 하지 않았습니다.

### 이미지와 배포 전 조건

- 팀 규칙대로 dev에서 확인한 이미지의 동일한 SHA 태그를 prod values에 PR로 반영합니다.
  최신 dev 태그나 CI 성공만으로 운영 검증 완료라고 판단하지 않습니다.
- 현재 web의 `75583e7`은 이전 dev에서 확인한 이미지로, 최초 Gateway IP·웹 HTTP 응답 확인에만 사용합니다.
  최신 채팅·권한·화면 기능의 최종 운영 버전이 아닙니다. 전체 기능 배포 전 dev 검증이 끝난 최신 SHA를
  별도 검토해 prod values에 반영하고 기능을 다시 확인합니다.
- user·file·chat prod 이미지 태그는 아직 비어 있습니다. 검사용 `0000000`은
  명령행에서만 사용하고 prod values에 저장하거나 실제 배포하지 않습니다.
- 네 앱 모두 prod 파드 2개로 렌더링합니다. HPA·metrics-server·모니터링의 prod 도입은
  이 초안에 포함하지 않습니다. dev의 HPA·부하 테스트 설정은 변경하지 않습니다.
- 앱은 기존 dev와 같은 자동 동기화·prune·selfHeal 설정입니다. 앱 최초 등록 시
  바로 배포될 수 있으므로 아래 선행 조건과 diff를 확인하고 팀 확인 후 등록합니다.
  web은 아래 최초 웹 응답 확인 범위가 검토·승인된 뒤에만 등록합니다. 백엔드 앱은 아직 등록하지 않습니다.
- user·file 첫 기동은 Flyway DB 마이그레이션을 포함합니다. 백업·스키마·계정 권한과
  첫 기동 범위를 확인한 뒤 진행합니다. 이미지 롤백만으로 DB 변경이 되돌아가지는 않습니다.

### Gateway 고정 IP와 최초 등록

prod GatewayClass `eg-prod`는 `ideaconnection-prod/prod-proxy-config` EnvoyProxy를 참조합니다.
EnvoyProxy가 생성할 Service에 `metallb.io/loadBalancerIPs: "10.10.24.200"`을 지정해
강사 터널의 연결 IP를 고정합니다. EnvoyProxy는 sync wave -1로 먼저 준비합니다.
운영 `dev-pool`의 범위가 10.10.24.200~223이고 기존 LoadBalancer Service가 없는 것을
11/20에 읽기 전용으로 확인했습니다. 이름만 dev-pool이며 풀 이름·컨트롤러는 변경하지 않습니다.
이 요청은 아직 IP를 할당받았다는 뜻이 아닙니다. 등록 직전 다른 Service의 할당 여부를 다시 보고,
할당 실패 시 Service 이벤트를 확인하며 강사에게 전달할 IP는 실제 Gateway ADDRESS와 대조합니다.

[Envoy Gateway 1.9 설정 방법](https://gateway.envoyproxy.io/v1.9/tasks/operations/customize-envoyproxy/)과
[MetalLB IP 지정](https://metallb.io/usage/#requesting-specific-ips)을 따릅니다.
현재 v1.9.3 컨트롤러는 운영 서버에 이미 설치돼 있습니다. 해당 컨트롤러의 Argo CD 관리권 이관은
후속 작업이며, 기존 Helm values·인증서·Webhook·CRD의 소유권을 확인한 뒤 진행합니다.
dev 이관용 설정을 복사해 컨트롤러를 재설치하거나 덮어쓰지 않습니다.

다음 명령은 PR 머지와 배포 범위 확인 후 **prod cp에서** 파일별로 실행합니다.
실제 배포를 시작하는 명령이며, `services/` 또는 `platform/` 폴더 전체를 적용하지 않습니다.

```bash
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/platform/gateway-prod.yaml
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/services/web-prod.yaml
```

앱 등록 후 Gateway `Accepted/Programmed`, web-route `Accepted/ResolvedRefs`, 웹 파드 2개 Ready,
Argo 동기화 Succeeded를 확인합니다. Gateway ADDRESS가 `10.10.24.200`인지 확인한 다음
bastion에서 `curl -i http://10.10.24.200/`의 경로·상태 코드를 기록해 팀장님께 공유합니다.
이 단계는 웹 응답 확인이며 로그인·API·파일·chat 전체 기능의 운영 완료가 아닙니다.

### 서비스별 운영 연결 준비표

다음은 Secret **이름·키와 공개 연결 값**만 정리한 것입니다. 실제 비밀번호·인증키를
이 표·Git·PR에 넣지 않습니다. Secret 값은 운영 DB VM에서 운영 클러스터로 안전하게 전달하며,
dev Secret이나 dev DB 자격증명을 복사하지 않습니다.

| 서비스 | 준비된 연결 | 운영 Secret 키 / 남은 결정 |
| --- | --- | --- |
| web | 내부 Service `web:80`, 컨테이너 80 | DB·로그인 Secret 없음. 접속 주소 기준 `/api`, `/realms` 호출. realm `hellocloud`, client `hellocloud-web` 유지 |
| user | `jdbc:mysql://10.10.24.20:3306/user_service`, 사용자 `user_service` | `user-service-env`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OIDC_ISSUER_URI`, `INVITE_BASE_URL`, `REDIS_URL`, `REDIS_PASSWORD` |
| file | `jdbc:mysql://10.10.24.20:3306/file_service`, 사용자 `file_service`, 내부 user 주소 `http://user-service` | `file-service-env`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OIDC_ISSUER_URI`, `USER_SERVICE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| chat | `mongodb://10.10.24.20:27017/chat_service?authSource=chat_service`, 사용자 `chat_service`, 내부 user 주소 `http://user-service` | `chat-service-env`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_URL`, `REDIS_PASSWORD`, `OIDC_ISSUER_URI`. `USER_SERVICE_URL`은 공통 values에 있음 |

user·chat은 같은 운영 Redis `redis://10.10.24.20:6379`를 사용합니다. user의 Redis 키는
차트에서 optional이지만, 누락하면 `MEMBER_REMOVED`가 전달되지 않아 권한 회수 검증을
완료할 수 없습니다. `INVITE_BASE_URL`도 optional이나 운영에서 생략하면 localhost 초대 링크가
만들어지므로 실제 웹 주소를 넣습니다. 두 항목 모두 운영 배포 준비에서는 필수로 확인합니다.

- 공개 주소: `https://ideaconnection.jpexstudio.com` (접속 개통 여부는 별도 확인)
- 위 주소에 맞춰 구성: Keycloak issuer `https://ideaconnection.jpexstudio.com/realms/hellocloud`,
  웹 redirect URI·허용 origin, `INVITE_BASE_URL=https://ideaconnection.jpexstudio.com`
- SeaweedFS는 #137에 따라 주소 확정 전에도 배치·복제본·PVC·버전 등 사전 준비가 가능합니다.
  기존 dev 저장소를 재설치하거나 PVC를 옮기지 않고 운영 구성을 따로 준비합니다. 확정할 값은 내부/브라우저 S3 주소,
  region·bucket과 파일 서비스 전용 권한, 웹 origin의 CORS
- OIDC issuer는 브라우저 토큰의 발급자와 정확히 같아야 하고 파드에서도 접근 가능해야 합니다.
  file의 브라우저 S3 요청에는 로그인 토큰을 보내지 않습니다.
- 공개 Gateway·HTTPS·JWT 검사와 Istio mTLS/호출 허용은 담당 작업과 맞춰 확인합니다.
  dev 이관용 Envoy hook Skip 설정이나 HTTP·관리 화면 노출을 prod에 그대로 복사하지 않습니다.
- MySQL 원본 제한, Docker 포트에 유효한 방화벽 규칙, Redis ACL, 백업·복구와
  운영 모니터링은 DB 설치 기록의 후속 항목을 따릅니다. 아직 적용·검증 완료가 아닙니다.

### 지금 할 수 있는 로컬 검사

```bash
bash deploy/scripts/validate-helm.sh
```

user·file·chat·web의 dev·prod 총 8개 조합을 검사용 이미지로 검사합니다.
실제 이미지·DB·Secret·인증서·클러스터 CRD의 존재나 서비스 동작을 검증하지 않습니다.
prod의 빈 이미지 태그를 임시로 채워 서버에 적용하는 명령은 아닙니다.

### 확정 후 한 번에 진행할 순서

1. HTTP 80 Gateway와 web 경로·이미지를 검토하고 prod Argo CD에서 준비합니다.
   bastion에서 `curl -i http://<prod Gateway IP>/`로 웹 응답을 확인해 IP·상태 코드·경로를 강사에게 전달합니다.
   `hostnames`는 강사 안내대로 web 경로에서 생략해 IP 직접 검사도 가능합니다.
   Gateway 재생성으로 IP가 바뀌면 터널 연결도 끊길 수 있으므로 임의로 지우지 않고 변경 시 강사에게 알립니다.
   외부 개통 전 관리자 경로·시험 계정·기본 비밀번호 노출을 점검하고 dev는 공개하지 않습니다.
   현재 prod 경로 초안은 web만 포함하며 `/admin`이나 Keycloak·API·S3 경로는 연결하지 않았습니다.
   HTTPS 개통 후 Keycloak 운영 모드(`start`)·proxy 설정·issuer를 공개 주소와 맞추고,
   realm·client는 기존 이름, 표시 이름은 `IdeaConnection`을 사용합니다.
   SeaweedFS 배치·저장소 준비와 운영 endpoint·CORS 연결은 별도로 검증합니다.
2. 각 서비스의 dev 검증 근거·배포 SHA를 확인하고 prod values에 반영합니다.
3. 운영 namespace·서비스별 Secret을 준비하고 DB 접속·권한·백업 준비 상태를 확인합니다.
4. 팀 검토 후 운영 Argo CD에 앱을 등록합니다. DB·인증·저장소가 준비된 순서로
   user → file·chat을 확인하며 web과 Gateway 경로를 연결합니다.
5. Synced/Healthy뿐 아니라 동기화 Succeeded·파드 2개 Ready·상태 확인 응답을 확인합니다.
6. 실제 로그인 → 조직·초대 → 파일 업로드·미리보기·다운로드 원본 비교·삭제를 확인합니다.
7. 조직 간 접근 차단과 멤버 제거 후 HTTP·실시간 연결 권한 회수를 측정합니다.
   기존 임시 파일 URL의 유효기간은 새 URL 발급 차단과 별도 검증 항목으로 구분합니다.
8. chat은 서로 다른 파드의 전달과 재연결 복구를 검증하고, 결과·이미지 SHA·측정 범위를 기록합니다.

이 문서의 검사 통과는 실제 운영 배포 완료나 전체 보안 요구사항 충족을 뜻하지 않습니다.

## 운영 Keycloak 준비

prod DB `10.10.24.20:3306/keycloak`의 전용 계정 `keycloak`을 사용합니다.
기존 dev Keycloak과 같은 `quay.io/keycloak/keycloak:26.4.0`을 고정하고,
운영 모드 `start --import-realm`으로 기동합니다. 메모리 요청 512Mi·상한 1Gi,
초기 파드 1개이며 데이터는 외부 MySQL에 저장됩니다. 단일 로그인 파드이므로 재시작 중
로그인이 잠시 중단되는 한계가 있습니다. 다중 파드·캐시 구성은 별도 검증 전 임의로 늘리지 않습니다.

- Keycloak 자원: `deploy/manifests/keycloak/prod/`, 앱: `keycloak-prod`
- 같은 namespace의 Service `keycloak:8080`, 상태 확인은 관리 포트 9000의
  `/health/started`, `/health/live`, `/health/ready`를 사용합니다. 관리 포트는 외부 Service에 내지 않습니다
- 공개 주소·issuer: `https://ideaconnection.jpexstudio.com`, `/realms/hellocloud`
- realm `hellocloud`, 표시 이름 `IdeaConnection`, public client `hellocloud-web`
- 웹 client는 Authorization Code + PKCE S256, redirect URI와 origin은 운영 도메인만 허용하며
  password grant(Direct Access Grants)·implicit flow는 끕니다. dev 계정·테스트 클라이언트를 복사하지 않습니다
- `/realms/hellocloud`·`/resources`만 운영 Gateway에서 Keycloak으로 보냅니다. master realm 경로는 공개하지 않습니다. `/admin` 경로는 추가하지 않습니다
- Cloudflare 외부 HTTPS와 Gateway 내부 HTTP를 구분하기 위해 해당 Route가
  `X-Forwarded-Proto: https`, `X-Forwarded-Port: 443`을 덮어씁니다.
  Keycloak은 고정 HTTPS hostname·HTTP 수신·xforwarded 헤더를 사용합니다
- ConfigMap import는 첫 realm 생성용입니다. 기존 realm이 있으면 자동 덮어쓰기하지 않으므로
  이후 설정 변경은 관리자 절차와 함께 확인합니다

[Keycloak hostname](https://www.keycloak.org/server/hostname)·
[reverse proxy](https://www.keycloak.org/server/reverseproxy)·
[health](https://www.keycloak.org/observability/health)를 기준으로 구성했습니다.

### DB·Secret 선행 준비 (운영 전용)

운영 DB VM의 `/opt/mysql/keycloak.env`에 `KEYCLOAK_DB_PASSWORD`를 생성하고,
MySQL의 `keycloak` DB·전용 계정에만 권한을 부여했습니다. VM 안에서 해당 계정으로
DB 로그인을 확인했습니다. 실제 비밀번호와 파일은 Git에 넣지 않습니다.
접속 원본은 초기 `keycloak@%`이며 다른 운영 MySQL 계정과 함께 제한할 후속 항목입니다.

현재 필요한 Secret은 `ideaconnection-prod/keycloak-db-env`의 `KC_DB_PASSWORD`,
`keycloak-bootstrap-admin`의 `username`, `password`입니다.
다음은 내 PC WSL에서 실행하는 최초 생성 예시로, 기존 Secret이 있으면 덮어쓰지 않습니다.
비밀번호를 화면·로컬 파일·명령 기록에 쓰지 않고 VM에서 cp의 kubectl로 전달합니다.

```bash
ssh t3-prod-db 'sed "s/^KEYCLOAK_DB_PASSWORD=/KC_DB_PASSWORD=/" /opt/mysql/keycloak.env' \
  | ssh t3-prod-cp 'kubectl create secret generic keycloak-db-env -n ideaconnection-prod --from-env-file=/dev/stdin'
ssh t3-prod-cp 'kubectl create secret generic keycloak-bootstrap-admin -n ideaconnection-prod --from-literal=username=admin --from-literal=password="$(openssl rand -hex 24)"'
```

SSH 별칭은 본인 PC에 맞추며 Secret 전체나 비밀번호 파일을 출력하지 않습니다.
운영 namespace는 선행 gateway-prod/web-prod 등록으로 생성된 상태여야 합니다.

### 배포와 확인

PR 검토·머지 후, prod cp에서 아래 **Keycloak 앱 파일만** 등록합니다.
Gateway 앱은 이미 등록돼 있으므로 같은 PR의 keycloak-route 추가는 자동 반영됩니다.

```bash
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/platform/keycloak-prod.yaml
kubectl get applications -n argocd
kubectl get pods -n ideaconnection-prod
```

Cloudflare 연결 개통 후 realm 공개 설정의 issuer가 운영 HTTPS 주소와 같은지 확인하고,
실제 회원가입·로그인, user API 연결을 별도로 검증합니다. 건강 응답만으로 로그인 성공을 판단하지 않습니다.
관리자는 외부 `/admin` 공개 대신 승인된 SSH·port-forward 경로로 관리하고,
정식 관리자 생성·로그인 확인 후 임시 bootstrap 관리자를 삭제하고 Deployment의 bootstrap 참조와
해당 Secret을 정리합니다. Secret만 먼저 지우면 재기동 시 필수 참조가 없어 실패하므로 순서를 지킵니다.

서버 dry-run 통과는 실제 MySQL 스키마 초기화·Keycloak 기동·HTTPS 로그인 성공을 뜻하지 않습니다.
이번 구성의 첫 기동은 전용 DB에 Keycloak 스키마를 생성하는 작업을 포함합니다.

## 운영 저장소와 서비스 연결 준비

운영 SeaweedFS는 dev와 동일한 차트 4.53.0·이미지 4.53을 사용합니다.
`seaweedfs-prod` 앱은 **운영 클러스터**의 `seaweedfs` namespace에 설치하며,
dev 클러스터의 Secret·PVC·파일을 복사하거나 수정하지 않습니다.
공통 values의 local-path PVC(master 1Gi, filer 1Gi, volume 10Gi)를 새로 생성합니다.
초기 단일 복제본과 노드 로컬 저장소이므로 노드 장애 시 자동 복구·백업을 보장하지 않습니다.
PVC 삭제·앱 prune은 하지 않으며, 백업·복구와 다중 노드 저장 구성은 별도 검증 항목입니다.

- 먼저 운영 `seaweedfs/seaweedfs-s3-auth` Secret을 준비합니다.
  고정 차트 렌더링에서 인증 파일 키 `seaweedfs_s3_config`를 확인했습니다.
- 파일 서비스 전용 S3 계정은 `chat-attachments` 버킷에 필요한 권한만 부여합니다.
  dev 관리자 인증을 재사용하지 않습니다. 실제 인증값은 Git에 넣지 않습니다.
- 운영 버킷 생성과 브라우저 업로드에 필요한 CORS 확인이 끝나기 전에는
  저장소 준비 완료로 판단하지 않습니다.
- 내부 S3 주소는 `http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333`,
  외부 S3 주소는 `https://ideaconnection.jpexstudio.com`입니다.
  `/chat-attachments` 경로와 ReferenceGrant로 namespace 간 Service 참조를 허용합니다.

운영 Gateway에 `/api/users`·`/api/orgs`·`/api/invitations`는 user-service,
`/api/files`는 file-service, `/api/chat`은 chat-service로 연결합니다.
각 운영 이미지 태그는 이 작업 시점의 dev values에 지정된 버전을 고정했습니다.
이는 운영에서 로그인·WebSocket·파일 기능을 검증했다는 뜻은 아닙니다.

서비스 앱 등록 전 `ideaconnection-prod`에 각 전용 Secret을 준비합니다.
필수 키는 각 서비스 공통 values의 secretKeyRef와 일치해야 합니다.
user-service의 선택 키인 INVITE_BASE_URL·REDIS_URL·REDIS_PASSWORD도 운영에서는
설정하여 초대 링크가 localhost로 만들어지거나 멤버 제거 알림이 빠지지 않게 합니다.
issuer는 `https://ideaconnection.jpexstudio.com/realms/hellocloud`로 통일합니다.

등록 순서는 Keycloak → SeaweedFS → user-service → file-service → chat-service입니다.
각 단계의 준비 상태·인증 연결을 확인한 뒤 다음 앱을 등록합니다.
SeaweedFS 앱은 dev와 같이 수동 동기화로 두므로 등록 후 diff를 검토하고 동기화합니다.
폴더 전체를 apply하지 않고 아래 파일을 운영 cp에서 하나씩 등록합니다.

```bash
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/platform/seaweedfs-prod.yaml
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/services/user-service-prod.yaml
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/services/file-service-prod.yaml
kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/services/chat-service-prod.yaml
```

이 명령은 선행 조건이 충족된 단계에서만 실행합니다. 현재 Secret·버킷 초기화,
실제 서비스 기동과 외부 HTTPS 연결 검증은 진행 중입니다.

운영 저장소 인증은 `deploy/cluster/scripts/prepare-prod-storage-secret.py`로 준비합니다.
`--check`는 구조만 검사하며 서버를 바꾸지 않습니다. 실제 실행 시 운영 노드 3개의
InternalIP를 검사하고 기존 Secret이 있으면 덮어쓰지 않고 중단합니다.
키는 메모리에서 무작위 생성하고 kubectl 표준 입력으로만 전달합니다.
관리 계정과 `chat-attachments` 버킷으로 권한을 제한한 파일 서비스 계정을 분리합니다.
운영 namespace 준비와 Secret 생성은 담당자가 명령을 확인한 뒤 직접 실행합니다.
관리용 키는 버킷 초기화·CORS 설정용이며 file-service에는 전달하지 않습니다.
인증 형식 근거: [SeaweedFS 4.53 예제](https://github.com/seaweedfs/seaweedfs/blob/4.53/docker/compose/s3.json),
[버킷별 권한 검사](https://github.com/seaweedfs/seaweedfs/blob/4.53/weed/s3api/auth_credentials.go).

서비스 Secret 준비 스크립트는 `deploy/cluster/scripts/prepare-prod-service-secrets.py`입니다.
`--check`로 키 구조를 검사합니다. `export-db`는 운영 DB VM의 기존 비밀번호를
읽어 표준 출력으로 전달하므로 **단독 실행하거나 tee·파일 저장·화면 출력하지 않습니다**.
내 PC WSL에서 아래처럼 반드시 `register` 입력으로 연결합니다.
두 SSH 사이에서 전달되는 내용에는 비밀값이 있으므로 디버그 출력·쉘 추적을 켜지 않습니다.

```bash
scp deploy/cluster/scripts/prepare-prod-service-secrets.py t3-prod-db:/tmp/prepare-prod-service-secrets.py
scp deploy/cluster/scripts/prepare-prod-service-secrets.py t3-prod-cp:/tmp/prepare-prod-service-secrets.py
set -o pipefail
ssh -T t3-prod-db 'python3 /tmp/prepare-prod-service-secrets.py export-db' \
  | ssh -T t3-prod-cp 'python3 /tmp/prepare-prod-service-secrets.py register'
```

`register`는 운영 노드 IP를 검사하고 세 서비스 Secret이 모두 없는지 확인한 뒤 생성합니다.
기존 Secret은 수정하지 않습니다. 생성 도중 오류가 나면 일부만 생성됐을 수 있으므로
이름과 키 개수만 확인하고, 임의 삭제·재실행 대신 원인을 확인합니다.
파일 서비스에는 관리용 S3 키 대신 전용 버킷 계정만 전달합니다.
Secret 생성은 DB 로그인·Flyway·외부 issuer 접근 성공을 의미하지 않습니다.

운영 SeaweedFS 동기화 후 `PostSync` Job이 관리자 키를 Secret에서 읽어
`chat-attachments` 버킷과 CORS를 준비합니다. 기존 버킷은 삭제하지 않습니다.
CORS는 기존 파일 서비스 스크립트와 같은 메서드·헤더를 사용하되 origin은
`https://ideaconnection.jpexstudio.com` 하나만 허용합니다.
Job 도구는 AWS CLI 2.32.4로 고정하며 Secret이나 임시 URL을 로그로 출력하지 않습니다.
성공 Job은 정리하고 실패 Job은 남겨 원인을 확인합니다.
실패 시 SeaweedFS 준비 완료로 판단하지 않고 저장소 상태와 Job 로그부터 확인합니다.

### 이번 변경의 검사 기록 (2026-11-20)

- user·file·chat·web의 dev/prod 총 8조합 Helm lint·template 통과
- 운영 Gateway·Keycloak·SeaweedFS manifest와 Argo CD 앱 총 21개 리소스의
  prod cp server dry-run 통과. 실제 적용은 하지 않음
- Secret 준비 스크립트 구조, 서비스 필수 키 일치, 잘못된 클러스터 실행 거부와
  기존 Secret 덮어쓰기 방지를 로컬 검사로 확인
- 담당자가 운영 저장소 인증과 user·file·chat Secret 생성 성공 확인
- 실제 로그인·DB 마이그레이션·S3 초기화·서비스 연결·공개 HTTPS 동작은
  머지 후 앱을 순서대로 등록·동기화하며 확인할 항목

운영 web·chat 이미지는 후속 main 변경 #174·#175를 확인하여
dev values에 지정된 `e0f3224`로 함께 맞췄습니다.
고정 메시지 해제 API는 기존 `/api/chat` 경로에 포함되므로 Gateway 경로 추가는 필요하지 않습니다.
아직 머지되지 않은 #144 로그인 테마는 포함하지 않습니다.

### PR #176 리뷰 보완

공개 경로를 앱 realm `/realms/hellocloud`로 제한하고, 첫 import JSON에
`bruteForceProtected: true`를 설정했습니다. 이미 만들어진 realm에는 import가
덮어쓰지 않으므로, 해당 경우 관리자 접속 경로에서 로그인 실패 잠금도 함께 확인합니다.

Keycloak과 외부 도메인 연결 후 **user-service 앱 등록 전에**, 운영 파드에서
공개 issuer 접근을 확인합니다. 다음 임시 파드 생성·정리는 담당자가 확인 후 실행합니다.
출력은 HTTP 상태 코드뿐이며 비밀값을 출력하지 않습니다.

```bash
kubectl run oidc-check -n ideaconnection-prod --rm -i --restart=Never --image=curlimages/curl:8.11.1 -- \
  curl -sS --max-time 20 -o /dev/null -w '%{http_code}\n' https://ideaconnection.jpexstudio.com/realms/hellocloud/.well-known/openid-configuration
```

200 응답과 discovery의 issuer·JWKS 주소가 맞는지 확인한 뒤 서비스 등록을 이어갑니다.
실패하면 DNS·터널·외부 HTTPS 경로부터 확인하며, 토큰 issuer를 임의로 내부 주소로 바꾸지 않습니다.
내부 JWKS 경로로 분리할 경우 chat과 Spring 서비스의 설정 지원 여부를 따로 검토합니다.
머지 직후 Gateway 경로가 먼저 반영되므로 서비스가 준비될 때까지 로그인·API 요청이
500/503으로 실패할 수 있습니다. 공개 완료 안내는 기능 검증 이후에 합니다.
