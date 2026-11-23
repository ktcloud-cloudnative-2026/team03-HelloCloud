# 런북

[← README](../README.md)

> 시작용 예시입니다. 팀에서 정한 내용으로 고치거나, 필요 없으면 지워도 됩니다.
>
> 외부 도구로 써도 됩니다(추천: [Notion](https://www.notion.so)). 그 경우 이 파일에는 링크와 한 줄 요약만 남깁니다.

장애가 났을 때 처음 보는 팀원도 그대로 따라 할 수 있게 씁니다. 해결한 [트러블슈팅 이슈](../../../issues?q=label%3Abug) 중 반복될 것을 여기로 옮깁니다.

## 공통 확인 순서
1. 어느 서비스 · 환경인가 — 대시보드에서 에러율이 오른 서비스 확인
2. `kubectl get pods -n <네임스페이스>` — 상태 · 재시작 수
3. `kubectl describe pod <파드> -n <네임스페이스>` — Events
4. `kubectl logs <파드> -n <네임스페이스> --previous` — 직전에 죽은 컨테이너 로그
5. 최근 배포 확인 — Argo CD 이력, 최근 merge된 PR

## 장애별 대응

### <증상 — 예: 파드가 CrashLoopBackOff>
| 항목 | 내용 |
|---|---|
| 확인할 명령 | |
| 흔한 원인 | |
| 조치 | |
| 되돌리기 | <예: Argo CD에서 이전 버전으로 Sync> |
| 관련 이슈 | # |

### HTTP 5xx 에러율 경보 대응

| 항목 | 내용 |
|---|---|
| 경보 이름 | `IdeaConnectionHighErrorRate` |
| 발생 조건 | 최근 5분간 HTTP 5xx 에러율 5% 초과가 5분 지속 |
| 알림 채널 | Discord `#alertmanager-관리` |
| 대상 환경 | `ideaconnection-dev` |
| 관련 이슈 | #132 |

#### 1. 경보 발생 확인

Discord에서 `FIRING - IdeaConnection` 알림을 확인한다.

```bash
kubectl -n monitoring get prometheusrule ideaconnection-error-rate
kubectl -n monitoring get alertmanagerconfig ideaconnection-discord
```

#### 2. 서비스 상태 확인

```bash
kubectl -n ideaconnection-dev get pods
kubectl -n ideaconnection-dev get deployments
kubectl -n ideaconnection-dev get events --sort-by=.lastTimestamp
```

#### 3. 로그 및 원인 분석

```bash
kubectl -n ideaconnection-dev logs deploy/<서비스명> --tail=100
kubectl -n ideaconnection-dev describe deploy <서비스명>
```

주요 확인 사항:

- 최근 배포 또는 설정 변경
- DB 연결 실패
- 외부 API 또는 서비스 간 통신 오류
- Pod 재시작, 메모리 부족
- HTTP 500 응답이 발생한 API 경로

#### 4. 복구 및 경보 해제 확인

원인을 해결한 뒤 정상 API 요청이 처리되는지 확인한다.

Prometheus에서 `IdeaConnectionHighErrorRate` 경보가 해제됐는지 확인한다.

Discord에 `RESOLVED - IdeaConnection` 알림이 도착하면 경보 해제를 확인한다.

경보 해제만으로 장애 복구가 보장되는 것은 아니므로 정상 API 응답과 서비스 상태도 함께 점검한다.

#### 5. 재발 방지

- 장애 발생 시간과 영향받은 서비스를 기록한다.
- 원인 및 조치 내용을 GitHub Issue에 남긴다.
- 필요한 경우 경보 규칙과 대시보드를 개선한다.
- 설정 변경은 Git PR 및 Argo CD 동기화로 반영한다.
