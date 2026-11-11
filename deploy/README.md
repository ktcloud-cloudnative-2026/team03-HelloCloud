# deploy

Helm 차트와 values, Argo CD 앱, 배포 검증 스크립트.
Argo CD에 등록된 앱은 `main`의 배포 설정 변경을 감지해 배포합니다.

```
deploy/
  cluster/           손 작업 절차: kubeadm, Calico, Argo CD
  argocd/            Application (root.yaml, platform/, data/, services/)
  charts/            자체 차트: spring-service(서비스 공용), mysql
  values/<앱>/       values.yaml, values-dev.yaml, values-prod.yaml
  manifests/         Gateway, Certificate, MetalLB IP 풀 등
  scripts/           validate-helm.sh: 공통 Spring 차트 검증
```

## 공통 Spring 차트 로컬 검증

현재 `charts/spring-service/`에는 Deployment와 내부 접속용 Service가 있으며,
`values/user-service/values.yaml`에는 포트와 Secret 참조가 있습니다.
공통 이미지 주소는 CI 작업 브랜치의
`ghcr.io/ktcloud-cloudnative-2026/idcn-user-service`에 맞췄습니다.
환경별 커밋 SHA는 `values-dev.yaml`, `values-prod.yaml`에 넣습니다.
실제 업로드된 태그는 확인되지 않아 비워 두었습니다. dev는 파드 1개,
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
  CI 작업 브랜치는 접두사 없이 커밋 SHA 앞 7자리를 태그로 사용합니다. 비공개 이미지라면
  대상 namespace에 이미지 다운로드용 Secret을 준비하고 `imagePullSecrets`에 참조합니다.
- 대상 namespace에 `user-service-env` Secret을 준비합니다. 필요한 키는
  `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OIDC_ISSUER_URI`입니다.
- 최신 main의 서비스 설정은 8081 포트와 `/health/liveness`, `/health/readiness`로
  차트와 일치합니다. 실제 이미지에서도 해당 주소가 응답하는지 확인합니다.
- Argo CD가 이 Git 저장소를 읽을 수 있는지 확인합니다. Application을 등록하는
  상위 앱은 아직 없으므로 최초 등록은 별도로 진행해야 합니다.

실제 환경 변경은 승인 후 진행합니다. 배포 후에는 Argo CD의 `Synced`, `Healthy`,
Deployment의 준비된 파드 1개, 파드 이벤트와 로그의 DB·로그인 서버 연결 상태를
확인합니다. 현재는 이미지와 연결 정보가 없어 실제 배포 검증을 진행하지 않았습니다.

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
- 이미지: `ghcr.io/ktcloud-cloudnative-2026/idcn-web` (태그는 실제 SHA 확인 후 입력)
- dev Application: `deploy/argocd/services/web-dev.yaml`
- Gateway 연결 대상: `ideaconnection-dev` namespace의 `web:80`
- dev는 파드 1개, prod는 2개로 설정합니다. prod Application은 아직 작성하지 않았습니다.

`bash deploy/scripts/validate-helm.sh`는 user-service와 웹의 dev·prod 설정을
모두 검사합니다. 실제 이미지가 없어도 설정 검사는 가능하며 서버를 변경하지 않습니다.
검증용 이미지 주소는 실제 배포에 사용하지 않습니다.

웹 Application은 main의 웹 차트와 공통·dev values를 읽습니다.
실제 배포 전 이미지 태그와 비공개 이미지의 다운로드 권한을 준비하고,
Gateway 담당자와 웹 경로 및 `/api`의 백엔드 연결을 확인합니다.
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

현재는 실제 이미지 태그가 비어 있어 배포할 수 없습니다. 클러스터 배포는 검증하지 않았습니다.
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
