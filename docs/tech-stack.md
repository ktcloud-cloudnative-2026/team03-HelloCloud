# 기술 스택

[← 아키텍처](architecture.md) · [README](../README.md) · 다음: [API 명세](api/)

> 팀이 지금 함께 알아야 할 큰 선택만 적습니다. 세부 도구는 담당자가 구현하면서 정합니다.

## 지금 정한 것

| 영역 | 선택 | 하는 일 |
|---|---|---|
| 서비스 구조 | 기능별 서비스 3개(MSA) | 기능마다 따로 만들고 따로 배포합니다 |
| user | Spring Boot + MySQL | 프로필, 조직, 초대, 권한을 관리합니다 |
| chat | Node.js(NestJS) + MongoDB | 실시간 대화와 메시지 복구를 처리합니다 |
| file | Spring Boot + MySQL | 파일 정보를 관리합니다 |
| 프론트 | React + JavaScript | 웹 화면을 만듭니다 |
| 로그인 | Keycloak | 가입과 로그인을 대신 처리합니다 |
| 실시간 전달 | Redis | 새 채팅 메시지와 멤버 제거 소식을 서버끼리 바로 전달합니다 |
| 파일 저장소 | SeaweedFS | 업로드한 파일을 보관합니다 |
| 입구 | Envoy Gateway | 외부 요청을 받아 알맞은 서비스로 보냅니다 |
| 서비스 사이 보안 | Istio | 서비스끼리의 통신을 암호화하고 허용된 호출만 통과시킵니다 |
| 서버 환경 | Kubernetes(kubeadm), dev · prod | 서비스를 실행하고 관리합니다 |
| 코드 검사와 빌드 | Jenkins | PR을 검사하고 배포할 이미지를 만듭니다 |
| 이미지 저장소 | GHCR | 만든 이미지를 보관합니다 |
| 배포 | Argo CD | GitHub 내용대로 서버에 자동 배포합니다 |
| 모니터링 | Prometheus, Grafana, Loki, AlertManager | 상태와 로그를 모아 화면에서 보고, 장애를 Discord로 알립니다 |

## 정한 버전

큰 버전까지만 정합니다. 패치 번호는 설치하는 PR에서 고정합니다.

| 도구 | 버전 | 쓰는 곳 |
|---|---|---|
| Java | 17 | user, file |
| Spring Boot | 4.1 | user, file |
| Node.js | 24 LTS | chat |
| React | 19 | 웹 화면 |
| MySQL | 8.4 LTS | user, file |
| MongoDB | 8.0 | chat |

## 구현하면서 정하는 것

아래는 필요해질 때 담당자가 조사해 정하고, 추가한 이유를 PR에 적습니다. 팀 전체에 영향을 주는 선택은 먼저 팀에 공유합니다.

- 프론트: 개발 도구, 화면 라이브러리
- 백엔드: 코드 검사와 테스트 도구, DB 구조 변경 방법, 지표 수집 방법
- 로그인: 세부 인증 방식
- 서버 환경: 네트워크, 저장 공간, 인증서 도구
- 공통: 정확한 버전(설치하는 PR에서 고정, `latest` 금지)
