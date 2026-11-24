# 관측 설계

[← README](../README.md)

> 시작용 예시입니다. 팀에서 정한 내용으로 고치거나, 필요 없으면 지워도 됩니다.
>
> 외부 도구로 써도 됩니다(추천: [Notion](https://www.notion.so)). 그 경우 이 파일에는 링크와 한 줄 요약만 남깁니다.

## 1. 공통 지표 (모든 서비스) — 골든 시그널: 지연 · 트래픽 · 에러 · 포화

dev에서는 Grafana의 Explore(질문을 바로 넣어 보는 화면)에서 봅니다. 여는 법은
[deploy/README.md](../deploy/README.md#grafana-보기)에 있습니다. 아래 식은 user, file(Spring)과
chat(NestJS) 모두 같은 이름으로 씁니다. Prometheus가 숫자를 가져가는 `/metrics` 요청과 쿠버네티스가 몇 초마다 보내는
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
- chat(NestJS)은 prom-client로 같은 이름(`http_server_requests_seconds`)과 구간을 직접 만듭니다(#199).
  WebSocket 연결 수는 `chat_websocket_connections`(파드별)로 봅니다.

## 2. 업무 지표 (서비스별) — [성공 기준](plan.md#5-성공-기준-숫자로)에서
| 서비스 | 지표 | 왜 |
|---|---|---|
| user · file · chat | 멤버 제거 후 첫 403까지 걸린 시간 (5초 이내) | US-04 권한 회수 |
| user · file · chat | 다른 조직 데이터 요청의 응답 코드 (모두 403 또는 404) | US-05 조직 간 격리 |

### 권한 측정 (dev, #173)

k6 스크립트 하나로 두 가지를 잽니다. 파일은 [deploy/loadtest/access/](../deploy/loadtest/access/)에 있고, 부하 테스트처럼
`loadtest` namespace에서 Job으로 한 번 돌고 지웁니다(AGENTS.md 예외). 계정 셋은 Keycloak 담당이 Secret으로 만듭니다:
`k6-loadtest-credentials`(조직 7 OWNER), `k6-access-member-credentials`(조직 7 MEMBER, 제거 대상),
`k6-access-owner-credentials`(다른 조직 OWNER).

- `MODE=revoke` (권한 회수): 멤버가 실시간 연결(WebSocket)을 열고 채널을 구독한 뒤, OWNER가 멤버를 제거합니다.
  제거 응답부터 0.5초마다 user(멤버 목록) · file(파일 목록) · chat(메시지 조회)을 불러 서비스마다 처음 403이 나온
  시간과 WebSocket이 닫힌 시간을 적습니다. 15초까지 기다리고, 한 번 막힌 뒤 다시 열리지 않는지도 봅니다.
  회차가 끝나면 OWNER가 초대 링크를 만들고 멤버가 수락해 다시 넣습니다(기본 3회차). 0.5초 간격이라 시간은 ±0.5초입니다
- `MODE=isolation` (조직 간 차단): 조직 7 OWNER가 다른 조직의, 다른 조직 OWNER가 조직 7의 user 멤버 목록,
  file 목록 · 다운로드 주소 · 미리보기 주소 · 삭제, chat 채널 목록 · 메시지 조회 · 보내기 · 결정 로그를 부르고
  응답 코드를 한 줄씩 남깁니다. 403 · 404가 아니면 `← 막히지 않음`이 붙고 기준(`isolation_not_blocked` 0건)에 걸립니다.
  삭제는 막히지 않으면 남의 파일이 지워지므로 맨 마지막에 부릅니다
- 측정에 쓸 채널 · 메시지 · 파일이 없으면 시작하자마자 멈춥니다. `CREATE_MISSING=1`이면 그 조직 OWNER로 만듭니다(데이터가 바뀜)
- 실행 · 정리는 6장의 부하 테스트와 같고 폴더만 `deploy/loadtest/access/`, Job 이름은 `k6-access-check`입니다.
  `run.env`의 `MODE`를 `revoke`나 `isolation`으로 바꿉니다. 멤버 제거는 데이터 변경이라 실행 전에 확인받습니다

| 날짜 | 측정 | user | file | chat | WebSocket 닫힘 | 판정 |
|---|---|---|---|---|---|---|
| | 권한 회수 (최대) | | | | | |
| | 조직 간 차단 (403 · 404 아닌 것) | | | | - | |

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
| HTTP 5xx 에러율 5% 초과가 5분 지속 | Discord #alertmanager-관리 | [HTTP 5xx 경보 대응](runbook.md#http-5xx-에러율-경보-대응) |

### HTTP 5xx 에러율 경보 (#132)

- 경보 이름: `IdeaConnectionHighErrorRate`
- 대상: `ideaconnection-dev` 네임스페이스
- 조건: 최근 5분간 HTTP 5xx 에러율 5% 초과
- 지속 시간: `for: 5m`
- 집계 단위: `namespace`, `job`
- 제외 경로: `/metrics`, `/health/.*`
- 경보 규칙: `deploy/manifests/monitoring/dev/ideaconnection-error-rate.yaml`
- 알림 채널: Discord `#alertmanager-관리`
- 알림 상태: `FIRING`, `RESOLVED`

### Alertmanager → Discord 연동

- 설정 파일: `deploy/manifests/monitoring/dev/ideaconnection-discord.yaml`
- Alertmanager 네임스페이스: `monitoring`
- 알림 대상 네임스페이스: `monitoring`, `ideaconnection-dev`
- Discord 웹후크 이름: `IdeaConnection-Alertmanager`
- 웹후크 Secret: `monitoring/ideaconnection-discord-webhook`
- Secret 키: `webhook-url`
- 경보 해제 알림: `sendResolved: true`
- 네임스페이스 전략: `OnNamespaceExceptForAlertmanagerNamespace`
- Helm 설정: `deploy/values/monitoring/values.yaml`

Discord 웹후크 URL은 Git에 저장하지 않는다.
새 클러스터에서는 웹후크 Secret을 별도로 생성해야 한다.
설정 변경 후 Argo CD 동기화 및 실제 Alertmanager 라우팅을 확인한다.

### 검증 결과 (2026-11-23)

- 테스트 환경: `ideaconnection-dev`
- 테스트 서비스: `ideaconnection-alert-test`
- HTTP 500 요청을 반복 발생시켜 5xx 에러율 5% 초과
- Prometheus에서 `IdeaConnectionHighErrorRate`의 `firing` 상태 확인
- Discord에서 `FIRING - IdeaConnection` 수신 성공
- 요청 중단 후 Prometheus 활성 경보 해제 확인
- Discord에서 `RESOLVED - IdeaConnection` 수신 성공
- 테스트용 Deployment, Service, ConfigMap 삭제 완료

**결과: 경보 발생부터 해제 알림까지 전체 흐름 검증 성공.**

## 5. 코드에 처음부터 넣을 것
- [x] `/metrics` 엔드포인트 (user, file, chat)
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
- k6 파드는 CPU를 0.5~2개로 제한하고, 테스트 대상 파드와 되도록 다른 노드에 뜹니다. 같은 노드면
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

# 3. 병목 찾기: 2분마다 10 → 30 → 50 → 100 → 200명. HPA를 끈 뒤(파드 1개의 한계를 본다) 채널에 시간대를 알리고 시작한다
kubectl -n loadtest delete job k6-read-apis
printf 'MODE=step\nORG_ID=7\n' > run.env
kubectl apply -k .
kubectl -n loadtest logs -f job/k6-read-apis

# 4. 본 실행: Job은 고칠 수 없어 지우고 다시 만든다. VUS는 3에서 찾은 병목 칸의 사람 수
#    11/23 값: 200명 · 쉬는 시간 0.2초(STEPS=100,200,300 · THINK_SECONDS=0.2로 찾음). Istio 전후 비교도 이 값으로 돌린다
kubectl -n loadtest delete job k6-read-apis
printf 'MODE=full\nVUS=200\nTHINK_SECONDS=0.2\nORG_ID=7\n' > run.env
kubectl apply -k .
kubectl -n loadtest logs -f job/k6-read-apis
```

- 병목 찾기(`MODE=step`): 사람 수를 칸마다 30초에 걸쳐 늘리고(한꺼번에 늘리면 새 가상 사용자 로그인으로 Keycloak CPU가 튐)
  나머지 90초는 그대로 둡니다. 요약에 칸(`step:10`, `step:30` …)마다 p95 · 에러율이 따로 나오고, 로그에
  `step 30명 시작 <시각>`이 칸마다 한 줄 찍힙니다. 꺾이는 지점은 이 시각으로 Grafana 시간대별 p95 · 요청 수를 보고 찾습니다
- 그 칸에서 먼저 한계에 닿는 것(user · file CPU, DB 연결, 메모리)이 병목입니다. k6 자신과 Keycloak의 CPU도 같이 봅니다.
  k6가 먼저 지치면 서비스가 아니라 측정 도구의 한계입니다. file 목록 API는 user의 소속 확인을 부르므로 file p95에는 user
  시간이 섞입니다. 병목이 DB나 소속 확인 호출이면 HPA만으로는 나아지지 않으니 인덱스나 캐시를 두 번째 개선으로 잡습니다
- 어느 칸이든 에러가 5%를 넘으면(30초 지켜본 뒤) dev를 지키려고 k6가 스스로 멈춥니다. 칸은 `STEPS`(예: `STEPS=10,30,50`),
  칸 길이는 `STEP_SECONDS`(기본 120)로 바꿉니다. Job은 15분이 지나면 강제로 끝나니 칸 수 × 칸 길이 + 30초가 15분을 넘지 않게 합니다
- 가상 사용자 한 명은 API 3개를 부르고 `THINK_SECONDS`(기본 1초)만큼 쉽니다. 사람 수를 더 늘리기 어려우면 이 값을 줄여(예: `0.2`)
  같은 사람 수로 요청을 더 많이 보냅니다. 결과에는 사람 수와 함께 이 값을 적습니다
- 로그 끝의 요약에서 `http_req_duration{scenario:load,type:api}`의 p(95)와
  `http_req_failed{scenario:load,type:api}`를 봅니다. 합격선을 넘으면 ✗가 붙습니다.
- 같은 시간대의 Grafana 화면(요청 수, 에러율, p95, CPU, 파드 수)을 캡처합니다. 전후 비교 그래프는 시간 범위 길이를 같게
  맞춥니다. 2차(HPA 켬)는 파드 수 패널을 꼭 캡처합니다(P4 심화 (3) "Pod 수 · 응답 시간 그래프")
- Istio 전후 비교는 requests · HPA 상태를 같게 두고, 사이드카 CPU · 메모리도 같이 적습니다

### HPA 끄고 켜기

dev Argo 앱은 손으로 바꾼 것을 되돌리므로(`selfHeal`), 1차 · 2차 전환은 user · file의
`deploy/values/<서비스>/values-dev.yaml`에서 `autoscaling.enabled`를 바꾸는 PR로 합니다.
2026-11-23에는 병목인 user만 바꿨습니다(1차 `false`, 2차 `true`). file까지 켜면 둘 다 바로 3개가 돼 워커가 빠듯하고,
원인 → 조치 → 효과를 나눠 보기 어렵기 때문입니다(팀장 결정). 머지 후 `kubectl -n ideaconnection-dev get hpa`로 상태를 확인하고 실행합니다.

HPA는 CPU requests 대비 사용률로 늘리고, 스케줄러는 requests로 노드 자리를 봅니다. requests가 실사용보다 작으면 새 파드가
한 노드에 몰립니다(2차-1: user requests 100m, 새 파드 2개가 file과 같은 w1에 떠 w1 CPU 100%). file도 requests가 100m라 file이 있는 노드가
한가해 보였습니다. 그래서 dev user · file 모두 CPU requests를 실사용(파드당 약 1코어)에 맞추고, user는 노드에 나눠 띄웁니다(#207). 실행 전 `kubectl describe nodes`의 Allocated resources로
워커 여유를 봅니다(k6 파드 · chat 포함).

### 정리

```bash
cd /tmp/k6-loadtest && kubectl delete -k .   # Job과 설정(ConfigMap)만 지운다. namespace · Secret은 남는다
cd / && rm -rf /tmp/k6-loadtest
```

### 결과

에러율은 k6 `http_req_failed`(4xx도 실패로 셈)를 씁니다. 대시보드 에러율 패널은 5xx만 셉니다.

| 회차 | 날짜 | HPA · CPU requests | 가상 사용자 | p95 | 처리량(초당 요청) | 에러율 | 최대 파드 수 |
|---|---|---|---|---|---|---|---|
| 병목 찾기 (쉬는 시간 1초) | 11/23 | 끔 · 100m | 10 → 400명 | 7 → 11ms | 약 26 → 1,140 | 0% | 1 |
| 병목 찾기 (쉬는 시간 0.2초) | 11/23 | 끔 · 100m | 100 → 200 → 300명 | 11 → 111 → 232ms | 약 1,210 → 1,920 → 1,990 | 0% | 1 |
| 1차 | 11/23 | 끔 · 100m | 200명 (0.2초) | 114ms | 약 1,980 | 0% | 1 |
| 2차-1 | 11/23 | 켬(1~3) · 100m | 200명 (0.2초) | 227ms | 약 1,730 | 0.0002% (1건) | 3 |
| 2차-2 | 11/23 | 켬(1~3) · 1000m, 노드에 나눔 | 200명 (0.2초) | 94ms | 약 2,100 | 0.0003% (2건) | 3 |

- 쉬는 시간 1초로는 400명까지 꺾이는 칸이 없어, 쉬는 시간을 0.2초로 줄여 200명에서 병목을 찾았습니다. 본 실행(1 · 2차)은 이 칸으로 돌립니다
- 병목은 user-service입니다. 파드 1개가 약 2.1코어에서 처리량이 평평해집니다(파드 3개로 나누면 파드당 약 1코어). file은 요청마다 user에 소속을 물어 더 느립니다
  (파드가 다 뜬 뒤 서버 쪽 p95: 1차 file 152ms · user 52ms → 2차-2 file 61ms · user 8ms)
- 같은 측정 동안 DB VM CPU는 약 55%, DB 연결 수는 파드 수만큼만 늘어 DB는 병목이 아니었습니다
- 표의 p95 · 처리량은 k6 판정 구간 5분 전체입니다. 2차-1 · 2차-2는 HPA가 파드를 늘리는 동안(새 파드의 첫 요청은 느림)도
  들어 있습니다. 파드가 다 뜬 뒤만 본 값은 위의 서버 쪽 p95입니다(판정 구간 안에 남은 시간이라 2차-1 2분 30초 · 2차-2 1분)
- k6는 매번 측정 대상과 같은 워커(w2)에서 돌았습니다. 1차 · 2차-1은 user와, 2차-2는 file · user 1개와 같은 노드입니다.
  k6 CPU는 1차 약 0.85코어, 2차-1 약 0.6코어, 2차-2 약 0.7코어라 그 노드 CPU에 이만큼이 섞여 있습니다.
  다음 측정은 k6를 측정 대상이 없는 노드에 두거나, 그럴 수 없으면 k6 CPU를 함께 적습니다
- 자세한 기록과 그래프는 #146 · #204 댓글에 있습니다

### 최적화 보고서

P4 기본 (3)의 결과물입니다. 병목마다 아래 세 칸으로 적습니다.

| 문제 (무엇이 먼저 한계에 닿았나) | 조치 (무엇을 바꿨나, PR) | 효과 (전후 p95 · 처리량) |
|---|---|---|
| user 파드 1개가 약 2.1코어에서 막힘(1차 p95 114ms, 약 1,980/초에서 평평) | user HPA 켬: 파드 1~3개, CPU 70% (#205) | 나빠짐: p95 227ms, 약 1,730/초(파드가 늘어나는 동안 포함). 새 파드 2개가 file과 같은 w1에 몰려 w1 CPU 100% |
| CPU requests가 100m로 실사용(파드 1개일 때 약 2.1코어, 3개로 나누면 파드당 약 1코어)보다 작아, 스케줄러가 새 파드를 한 노드에 몰아 넣음 | user · file CPU requests 1000m, user 파드를 노드에 나눠 띄움(`topologySpreadConstraints`) (#207). HPA 목표 70%라 user는 파드당 0.7코어부터 늘기 시작(파드 1개가 막히는 2.1코어보다 낮음). 나눠 띄우기는 user끼리만 세므로, 2차-2에서 user 2개가 file과 다른 노드에 뜬 것은 배치 결과(Istio 후 측정에서는 겹침) | 이 변경만(2차-1 → 2차-2): p95 227 → 94ms, 약 1,730 → 2,100/초. HPA와 합친 효과(1차 → 2차-2): p95 114 → 94ms(약 18% 감소), 약 1,980 → 2,100/초(약 6% 증가). 파드가 다 뜬 뒤 file p95 152 → 61ms |
| (잠정) 워커 CPU 총량(2차-2에서 두 노드 모두 약 95%). 단 w2에는 k6(약 0.7코어)가 같이 돌아 그 몫이 섞여 있음 | k6를 측정 대상이 없는 노드에 두고 다시 잰 뒤 확정. 확정되면 다음 후보: file의 소속 확인 캐시(권한 회수 5초 안에서), 노드 추가. 팀에서 정함 | |
