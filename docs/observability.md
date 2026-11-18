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

## 4. 알림 기준
| 조건 | 받는 사람 | 대응 문서(런북) |
|---|---|---|
| <에러율 5%가 5분 넘음> | | |

## 5. 코드에 처음부터 넣을 것
- [x] `/metrics` 엔드포인트 (user, file. chat은 배포 후)
- [ ] 요청 ID 헤더를 받아서 다음 서비스로 전달
