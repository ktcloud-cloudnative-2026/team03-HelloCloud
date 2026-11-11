# 기술 스택

[← 아키텍처](architecture.md) · [README](../README.md) · 다음: [API 명세](api/)

> 팀이 지금 함께 알아야 할 큰 선택만 적습니다. 세부 도구는 담당자가 구현하면서 정합니다.

## 지금 정한 것

| 영역 | 선택 | 하는 일 |
|---|---|---|
| 서비스 구조 | 기능별 서비스 8개(MSA) | 기능마다 따로 만들고 따로 배포합니다 |
| user | Spring Boot + MySQL | 프로필, 조직, 초대, 권한을 관리합니다 |
| chat | Node.js(NestJS) + MongoDB | 실시간 대화와 메시지 복구를 처리합니다 |
| file | Spring Boot + MySQL | 파일 정보를 관리합니다 |
| calendar | Spring Boot + PostgreSQL | 일정과 회의실 예약을 관리합니다 |
| notification | Spring Boot + MySQL | 예약 · 즉시 알림과 장애 알림을 보냅니다 |
| board | Spring Boot + MySQL | 칸반 보드, 카드, 타임라인을 관리합니다 |
| meeting | FastAPI + PostgreSQL | 회의방과 음성 변환을 처리합니다 |
| document | Node.js(Hocuspocus) + MongoDB | 문서와 드로잉 공동 편집을 처리합니다 |
| 프론트 | React + JavaScript | 웹 화면을 만듭니다 |
| 로그인 | Keycloak | 가입과 로그인을 대신 처리합니다 |
| 실시간 전달 | Redis | 채팅 같은 변경 사항을 서버끼리 바로 전달합니다 |
| 메시지 큐 | Redis Streams | Google Calendar 반영과 음성 변환 작업을 쌓아 두고 처리합니다. 학습을 위해 이 두 곳에만 씁니다 |
| 파일 저장소 | SeaweedFS | 업로드한 파일을 보관합니다 |
| 화상 회의 | LiveKit, LiveKit Egress | 영상, 음성, 화면 공유를 처리하고, 음성 변환에 쓸 음성을 파일로 내보냅니다 |
| 음성 변환 | Whisper | 회의 음성을 글로 바꿉니다 |
| 외부 연동 | Google Calendar, Gmail | 회의실 예약을 일정에 반영하고 이메일 알림을 보냅니다 |
| 입구 | Envoy Gateway | 외부 요청을 받아 알맞은 서비스로 보냅니다 |
| 서비스 사이 보안 | Istio | 서비스끼리의 통신을 암호화하고 허용된 호출만 통과시킵니다 |
| 서버 환경 | Kubernetes(kubeadm), dev · prod | 서비스를 실행하고 관리합니다 |
| 코드 검사와 빌드 | GitHub Actions | PR을 검사하고 배포할 이미지를 만듭니다. GitHub이 빌려주는 서버에서 돌아 따로 관리할 서버가 없습니다 |
| 이미지 저장소 | GHCR | 만든 이미지를 보관합니다 |
| 배포 | Argo CD | GitHub 내용대로 서버에 자동 배포합니다 |
| 모니터링 | Prometheus, Grafana, Loki | 상태와 로그를 모아 화면에서 보고 장애를 알립니다 |

## 정한 버전

큰 버전까지만 정합니다. 패치 번호는 설치하는 PR에서 고정합니다.

| 도구 | 버전 | 쓰는 곳 |
|---|---|---|
| Java | 17 | user, file, calendar, notification, board |
| Spring Boot | 4.1 | user, file, calendar, notification, board |
| Node.js | 24 LTS | chat, document |
| Python | 3.13 | meeting |
| React | 19 | 웹 화면 |
| MySQL | 8.4 LTS | user, file, notification, board |
| PostgreSQL | 18 | calendar, meeting |
| MongoDB | 8.0 | chat, document |

## 구현하면서 정하는 것

아래는 필요해질 때 담당자가 조사해 정하고, 추가한 이유를 PR에 적습니다. 팀 전체에 영향을 주는 선택은 먼저 팀에 공유합니다.

- 프론트: 개발 도구, 칸반 · 캘린더 · 간트 화면 라이브러리
- 백엔드: 코드 검사와 테스트 도구, DB 구조 변경 방법, 지표 수집 방법
- 문서 · 드로잉: 편집기
- 로그인: 세부 인증 방식
- 서버 환경: 네트워크, 저장 공간, 인증서 도구
- 공통: 정확한 버전(설치하는 PR에서 고정, `latest` 금지)
