# 요구사항

[← 기획서](plan.md) · [README](../README.md) · 다음: [아키텍처](architecture.md)

> 팀 논의 전 초안입니다. 기능 범위와 기술 선택은 확정이 아니며, 팀 논의 결과로 바꿉니다.

## 1. 기능 요구사항

구현 순서대로 적었습니다. ID는 이슈 · PR · API 명세에서 씁니다. 초대는 OWNER만 하고, 나머지 기능은 OWNER와 MEMBER가 같습니다.

| ID | 기능 | 수용 기준 | 서비스 | API |
|---|---|---|---|---|
| USER-1 | 로그인 | Keycloak으로 가입과 로그인을 하고, 첫 로그인 때 프로필이 생긴다 | user | `GET /api/users/me` |
| USER-2 | 조직 | 조직을 만든 사람이 OWNER가 된다 | user | `/api/orgs` |
| USER-3 | 초대 | OWNER가 만든 링크로 수락하면 MEMBER가 된다. 링크는 한 번만 쓴다 | user | `/api/invitations/{token}/accept` |
| USER-4 | 접근 제한 | 속하지 않은 조직의 데이터는 볼 수 없다(403) | 전체 | 조직 API 전체 |
| BOARD-1 | 칸반 | 보드 → 컬럼 → 카드 구조이고, 카드에 담당자, 시작일, 마감일이 있다 | board | `/api/boards?orgId=`, `/api/boards/{id}/cards` |
| BOARD-2 | 카드 이동 | 끌어서 옮긴 위치가 새로고침 후에도 유지된다 | board | `/api/boards/{id}/cards` |
| FILE-1 | 파일 | 조직 파일함에 올리고 내려받고 지운다. 업로드가 끝난 파일만 보인다 | file | `/api/files?orgId=`, `/api/files/{id}/complete`, `/api/files/{id}/download-url` |
| CHAT-1 | 메신저 | 채널에서 새로고침 없이 메시지를 주고받는다 | chat | `/api/chat/channels?orgId=`, WS `/api/chat/ws` |
| CHAT-2 | 재연결 | 끊겼다 돌아오면 놓친 메시지가 순서대로 보인다 | chat | `/api/chat/channels/{id}/messages?after=` |
| MEET-1 | 화상 통화 | 여러 명이 한 회의방에서 영상과 음성을 주고받는다 | meeting | `/api/meetings?orgId=`, `/api/meetings/{id}/token` |
| GANTT-1 | 간트 | 기간이 있는 카드가 타임라인 막대로 보인다 | board | `/api/boards/{id}/timeline` |

## 2. 비기능 요구사항

| 항목 | 요구 |
|---|---|
| 가용성 | Valkey 장애 시 메시지는 저장되고 실시간 전달만 빠진다 |
| 확장 | 채팅 파드가 여러 개여도 모든 사용자에게 메시지가 전달된다 |
| 보안 | Gateway와 서비스가 모두 JWT를 검증하고, 서비스 간 통신은 mTLS를 쓴다. 멤버십을 확인할 수 없으면 접근을 막는다 |
| 관측 | 모든 서비스의 메트릭과 JSON 로그를 Grafana에서 본다 |
| 비용 | 유료 라이선스와 유료 클라우드 리소스를 쓰지 않는다(Route 53 제외) |
