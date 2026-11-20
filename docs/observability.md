# 관측 설계

[← README](../README.md)

> 시작용 예시입니다. 팀에서 정한 내용으로 고치거나, 필요 없으면 지워도 됩니다.
>
> 외부 도구로 써도 됩니다(추천: [Notion](https://www.notion.so)). 그 경우 이 파일에는 링크와 한 줄 요약만 남깁니다.

## 1. 공통 지표 (모든 서비스) — 골든 시그널: 지연 · 트래픽 · 에러 · 포화

dev에서는 Grafana의 Explore(질문을 바로 넣어 보는 화면)에서 봅니다. 여는 법은
[deploy/README.md](../deploy/README.md#grafana-보기)에 있습니다. 아래 식은 user, file(Spring)
기준입니다. Prometheus가 숫자를 가져가는 `/metrics` 요청과 쿠버네티스가 몇 초마다 보내는
건강 확인(`/health/liveness`, `/health/readiness`) 요청은 빼고 셉니다. 사용자가 없어도 숫자가 생기고,
아주 빠른 요청이라 응답 시간이 실제보다 낮게 나와 부하 테스트 전후 비교가 흐려지기 때문입니다.

| 지표 | 이름(Prometheus) | 대시보드 |
|---|---|---|
| 요청 수 | `sum by (job)(rate(http_server_requests_seconds_count{uri!="/metrics", uri!~"/health.*"}[5m]))` | Explore |
| 에러율 | 위 식에 `status=~"5.."`를 더한 값 ÷ 위 식. 5xx가 없으면 No data | Explore |
| 응답 시간(p95) | `histogram_quantile(0.95, sum by (job, le)(rate(http_server_requests_seconds_bucket{uri!="/metrics", uri!~"/health.*"}[5m])))` (아래) | Explore |
| CPU · 메모리 · 재시작 수 | CPU: `sum by (pod)(rate(container_cpu_usage_seconds_total{namespace="ideaconnection-dev", container!=""}[5m]))` (누적값이라 `rate()`로 초당 사용량을 봅니다). 메모리: `container_memory_working_set_bytes`. 재시작: `kube_pod_container_status_restarts_total` | 기본 대시보드 Kubernetes / Compute Resources / Namespace (Pods) |

- p95: Spring은 기본으로 응답 시간을 구간별로 세지 않아 `_bucket`이 없습니다. 그래서 user, file의
  `application.yaml`에 `management.metrics.distribution.percentiles-histogram`을 켰습니다(#124).
  사람이 보낸 요청이 없으면 선이 비고, 파드가 새로 뜬 직후 첫 요청들은 준비 과정 때문에 느려서
  p95가 크게 나옵니다. 부하 테스트는 몇 분 워밍업한 뒤 잽니다.
- chat(NestJS)은 배포 후 지표 이름을 따로 정합니다.

## 2. 업무 지표 (서비스별) — [성공 기준](plan.md#5-성공-기준-숫자로)에서
| 서비스 | 지표 | 왜 |
|---|---|---|
| | | |

## 3. 로그 형식 (모든 서비스 같게)
```json
{"time":"2026-11-04T09:00:00+09:00","level":"info","service":"<서비스>","request_id":"<id>","message":"<내용>"}
```

- dev 로그는 Loki에 모읍니다([deploy/README.md](../deploy/README.md#로그-dev)). Grafana Explore에서 Loki를 고르고
  `{namespace="ideaconnection-dev", app="user-service"} | json | request_id="<id>"`로 한 요청의 로그를 찾습니다.
- user · file은 공통 `JsonLogFormatter`로 이 형식을 씁니다. chat(NestJS)은 아직 기본 형식입니다.

## 4. 알림 기준
| 조건 | 받는 사람 | 대응 문서(런북) |
|---|---|---|
| <에러율 5%가 5분 넘음> | | |

## 5. 코드에 처음부터 넣을 것
- [x] `/metrics` 엔드포인트 (user, file. chat은 배포 후)
- [ ] 요청 ID 헤더를 받아서 다음 서비스로 전달

## 6. 부하 테스트 (dev, #146)

k6(가상 사용자를 만들어 요청을 계속 보내는 도구)로 user · file의 읽기 API 3개
(`GET /api/users/me`, `GET /api/orgs`, `GET /api/files?orgId=`)를 반복해서 부릅니다.
같은 시나리오를 HPA를 끈 상태와 켠 상태로 한 번씩 돌려 비교합니다.

- 합격선: 사용자 수가 일정한 5분 구간에서 p95 500ms 이하([요구사항](requirements.md)), 에러율 1% 이하.
  워밍업 2분과 마무리 1분은 숫자가 흔들려서 판정에서 뺍니다.
- k6는 클러스터 안 `loadtest` 네임스페이스에서 Job으로 한 번 돌고 끝납니다. 실제 사용자와 같은
  입구(dev Gateway)를 지나고, cp와 CPU를 나눠 쓰지 않기 위해서입니다. 한 번 쓰고 지우는 도구라
  Argo CD 밖에서 손으로 올립니다(팀장 승인). 파일은 [deploy/loadtest/](../deploy/loadtest/)에 있습니다.
- k6 파드는 CPU를 0.5~1개로 제한하고, 테스트 대상 파드와 되도록 다른 노드에 뜹니다. 같은 노드면
  CPU를 나눠 써서 결과가 흔들립니다. 워커가 2대라 항상 피하지는 못하니 실행 후 노드를 확인합니다.

### 준비 (한 번)

- dev Keycloak에 테스트 전용 클라이언트 `k6-loadtest`: Direct Access Grants(아이디 · 비밀번호로 바로
  토큰 받기) 켜기, access token 수명 15분. 8분 시나리오 중에 토큰이 끊기면 401이 에러율에 섞이기 때문입니다.
  수명은 realm 전체가 아니라 이 클라이언트 설정(Advanced)에만 겁니다. 웹 클라이언트 `hellocloud-web`은
  로그인 화면을 거치므로 켜지 않습니다(dev는 꺼져 있음).
- 테스트 계정: 테스트 조직에 속하고, 그 조직에 파일이 몇 개 있어야 합니다. 조직 번호는 `run.env`의 `ORG_ID`에
  적습니다. 계정이 그 조직에 없으면 k6가 시작하자마자 멈춥니다.
- `loadtest` namespace와 테스트 계정 Secret `k6-loadtest-credentials`(키 `username`, `password`)는 Keycloak 담당이
  손으로 만듭니다(시크릿 생성 예외). 비밀번호는 채팅 · 문서에 쓰지 않고 Secret에만 둡니다.
- 로그인은 가상 사용자마다 처음 한 번만 합니다. 매번 하면 user · file이 아니라 Keycloak을 재게 됩니다.

### 실행 (cp)

팀 공용 저장소 폴더는 건드리지 않고, 파일을 임시 폴더에 내려받아 씁니다.

```bash
mkdir -p /tmp/k6-loadtest && cd /tmp/k6-loadtest
for f in kustomization.yaml job.yaml read-apis.js run.env; do
  curl -fsSLO "https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/loadtest/$f"
done

# 1. 테스트 계정 Secret이 있는지 이름만 확인한다 (값은 출력하지 않는다)
kubectl -n loadtest get secret k6-loadtest-credentials

# 2. smoke: 1명, 30초. 토큰 · 주소 · 이미지가 맞는지만 본다 (run.env 기본값)
kubectl apply -k .
kubectl -n loadtest get pods -o wide
kubectl -n loadtest logs -f job/k6-read-apis

# 3. 본 실행: Job은 고칠 수 없어 지우고 다시 만든다. VUS는 10 → 30 → 50으로 올려 본다
kubectl -n loadtest delete job k6-read-apis
printf 'MODE=full\nVUS=30\nORG_ID=7\n' > run.env
kubectl apply -k .
kubectl -n loadtest logs -f job/k6-read-apis
```

- 로그 끝의 요약에서 `http_req_duration{scenario:load,type:api}`의 p(95)와
  `http_req_failed{scenario:load,type:api}`를 봅니다. 합격선을 넘으면 ✗가 붙습니다.
- 같은 시간대의 Grafana 화면(요청 수, 에러율, p95, CPU, 파드 수)을 캡처합니다.

### HPA 끄고 켜기

dev Argo 앱은 손으로 바꾼 것을 되돌리므로(`selfHeal`), 1차 · 2차 전환은 user · file의
`deploy/values/<서비스>/values-dev.yaml`에서 `autoscaling.enabled`를 바꾸는 PR로 합니다.
1차 PR에서 둘 다 `false`, 2차 PR에서 둘 다 `true`로 PR 하나에서 같이 바꿉니다. 파일 목록 API가 user의 소속
확인도 부르므로 한쪽만 늘리면 비교가 맞지 않습니다. 머지 후 `kubectl -n ideaconnection-dev get hpa`로 상태를 확인하고 실행합니다.

HPA를 켜면 user · file이 각각 최대 3개라 메모리 requests 합이 6 × 512Mi = 3Gi입니다. 실행 전
`kubectl describe nodes`의 Allocated resources로 워커 여유를 봅니다(k6 파드 · chat 포함).

### 정리

```bash
cd /tmp/k6-loadtest && kubectl delete -k .   # Job과 설정(ConfigMap)만 지운다. namespace · Secret은 남는다
cd / && rm -rf /tmp/k6-loadtest
```

### 결과

| 회차 | 날짜 | HPA | 가상 사용자 | p95 | 에러율 | 최대 파드 수 |
|---|---|---|---|---|---|---|
| | | | | | | |
