# File 서비스 (#106)

Spring Boot 파일 API입니다. 실제 파일은 SeaweedFS, 파일 정보는 파일 서비스 전용 MySQL DB에 저장합니다.

## 구현 상태

- 목록·업로드 시작·완료·다운로드 URL·미리보기 URL·삭제 API 구현.
- 공통 JWT 검증 사용. 매 요청마다 user의 내부 소속 API에 토큰과 요청 ID 전달.
- 소속 확인 캐시는 사용하지 않습니다. 회수 직후 차단을 우선하고 user 호출량 증가를 받아들입니다.
- 파일 크기 상한 100,000,000바이트, 업로드 상태 검증, 업로더/OWNER 삭제 권한 검사.
- 완료·삭제 요청은 DB 행 잠금으로 직렬화. 저장소 삭제 실패 시 메타데이터 삭제 안 함.
- 임시 URL은 5분간 유효. 이미 발급된 URL은 소속 회수 후에도 만료까지 사용 가능합니다.
- 브라우저 호출 함수는 `services/web/src/api/files.js`.
- PR #102의 `FileList.jsx`가 쓰는 목록 경로와 `items/page/size/total`, `id/name` 형식에 맞춤.

## 로컬 실행

Java 17, 파일 서비스 전용 MySQL DB/계정, SeaweedFS S3, 실행 중인 user 서비스가 필요합니다.
`.env.example`은 형식 예시이며 실제 값은 Git에 넣지 않습니다. Spring은 .env 파일을 자동으로 읽지 않으므로 환경 변수로 주입합니다.

```bash
cd services
./gradlew :file-service:bootRun
```

포트 8082. 상태 확인 `/health/liveness`, `/health/readiness`.
최초 실행 시 Flyway가 파일 전용 DB에 `files` 테이블을 생성하므로 실제 DB에서 실행하기 전 승인이 필요합니다.
user DB를 공유하지 않으며 다른 서비스의 테이블에 직접 접근하지 않습니다.

## 자동 검증

```bash
cd services
./gradlew :file-service:check :file-service:bootJar
```

서비스 로직, HTTP/JWT 및 H2 기반 메타데이터 저장·롤백·조직 필터, user HTTP 호출,
S3 서명 URL의 주소·유효기간·서명 헤더를 검사합니다.
일반 자동 테스트는 H2를 사용하고, `FileStorageIntegrationTest`는 `FILE_LIVE_TESTS=true`일 때만 실제 MySQL과 SeaweedFS를 사용합니다.
실환경 테스트는 `seaweedtest`에서 Flyway를 실행하고 자신이 만든 행·객체만 삭제합니다.
테스트 프로세스의 `S3_ENDPOINT`와 `S3_PUBLIC_ENDPOINT`는 해당 프로세스에서 접근 가능한 같은 S3 주소로 설정합니다.
Secret 값은 환경 변수로 메모리에만 주입하고 출력하거나 파일로 저장하지 않습니다.
SDK 추가 이유: SeaweedFS의 S3 API에 표준 AWS SDK로 연결하고 임시 URL 서명을 직접 구현하지 않기 위함입니다.
Dockerfile의 test 단계는 Docker 없이 실행 가능한 위 테스트를 모두 수행합니다.

## 개발 배포 준비

1. 테스트는 생성 완료된 `seaweedtest` DB·계정을 사용합니다. Secret 등록 절차와 현재 접속 제약은
   `deploy/cluster/README.md`의 파일 테스트 DB 준비 항목에 있습니다. 운영 DB는 별도 계정으로 분리합니다.
2. `ideaconnection-dev`의 `file-service-env` Secret에 `.env.example`의 모든 변수를 등록합니다.
   실제 값은 출력하거나 파일로 저장하지 않습니다. S3 인증 정보는 기존 스토리지 담당자가 안전하게 주입합니다.
   `USER_SERVICE_URL=http://user-service`,
   `S3_ENDPOINT=http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333`,
   `S3_PUBLIC_ENDPOINT=http://10.10.24.101`은 현재 내부망 dev 연결 예입니다.
   issuer는 발급된 JWT와 동일하고 Pod에서도 접근 가능해야 합니다.
3. PR 머지 후 CI가 이미지를 빌드하고 `deploy/values/file-service/values-dev.yaml`에 커밋 SHA를 기록합니다.
   초기 태그는 비어 있어 이미지가 준비되기 전 배포가 실패하도록 했습니다.
4. Argo CD 담당자가 `deploy/argocd/services/file-service-dev.yaml`을 등록합니다.
   DB 마이그레이션을 포함한 첫 기동 승인을 받고 배포합니다.
5. Gateway는 `/api/files`를 file-service로, `/chat-attachments`를 SeaweedFS로 전달합니다.
   S3 경로는 재작성하지 않습니다. 경로/호스트를 바꾸면 서명이 깨집니다.
   cross-namespace 허용은 `deploy/manifests/seaweedfs/dev/reference-grant.yaml`에 있습니다.
6. `deploy/argocd/platform/seaweedfs-dev.yaml`은 기존 수동 Helm 설치를 GitOps로 옮기기 위한 설정입니다.
   chart 4.53.0과 release/namespace/PVC 설정을 유지하며 자동 sync는 끈 상태입니다.
   기존 `seaweedfs-s3-auth` Secret이 필요합니다. 리소스 차이와 PVC 유지 확인 후 수동 sync합니다.
7. 프론트 origin 확정 후 `S3_ALLOWED_ORIGINS=http://10.10.24.101,http://localhost:5173`처럼 지정하고,
   S3 환경 변수를 안전하게 주입한 환경에서 `python3 services/file-service/configure-cors.py`를 실행합니다.
   boto3가 필요하며 실제 버킷 설정을 변경하므로 배포 승인 후에만 실행합니다.
8. 현재 Gateway는 HTTP만 제공합니다. HTTPS 운영 주소·인증서가 정해지면 listener와 서명용 외부 주소를 함께 변경합니다.
   업로드한 문서는 실행 권한이 없는 별도 파일 origin에서 제공하는 구성을 운영에서 권장합니다.

API/배포 Secret과 앱 이미지가 준비되기 전에는 프론트에 '호출 가능'으로 안내하지 않습니다.

## 이번 로컬 검증 결과

- `:file-service:check :file-service:bootJar` 통과: 31개 테스트, 실패 0.
- 파일 서비스 Spotless·Checkstyle 통과.
- 웹 `npm test` 통과: ESLint와 Vite 빌드.
- `deploy/scripts/validate.sh` 통과: YAML lint와 user/file/web dev·prod Helm 렌더링.
  Gateway/Argo CRD는 검사기의 스키마가 없어 건너뛰므로 서버측 검증은 배포 전에 별도 수행합니다.
- SeaweedFS chart 4.53.0과 저장소 values로 Helm 렌더링 및 표준 리소스 스키마 13개 검사 통과.
- 2026-11-18 실제 MySQL(`seaweedtest`)·SeaweedFS 통합 테스트 1개 통과.
  Flyway V1 성공, `files`·`flyway_schema_history` 생성 확인.
  임시 URL PUT → 완료 → 목록 → 다운로드/미리보기 원본 일치 → 삭제 검증.
  미완료 파일 숨김·비인증 S3 GET 거부·권한 거부 검증. 테스트 행/객체 정리 확인.
- 위 실환경 테스트의 JWT 서명키와 조직 소속 응답은 테스트용 대체 구성을 사용합니다.
  실제 Keycloak 로그인·user 멤버십 연동 성공이나 브라우저 검증을 의미하지 않습니다.
- 실제 애플리케이션 JAR를 127.0.0.1:8082에서 기동해 liveness/readiness 200, 무토큰 API 401 확인 후 종료.
- Docker 이미지 빌드, Kubernetes 파일 서비스 배포와 브라우저 검증은 아직 수행하지 않았습니다.

## 실제 환경에서 남은 검증

- MySQL Flyway V1과 애플리케이션 재기동은 검증 완료. 운영 데이터의 백업·복구는 별도 검증.
- 로그인 → 업로드 시작 → 브라우저 PUT → 완료 → 목록 → 다운로드/미리보기 → 삭제.
- 내려받은 원본 일치, 비회원 접근 차단, 미완료 파일 숨김, 크기 불일치 오류.
- CORS preflight, URL 만료·서명 변조 거부, 비인증 객체 GET 거부.
- 임시 PUT URL은 유효기간 동안 재사용할 수 있습니다. 일회용 URL이 아닙니다.
- 파일 삭제 후에도 아직 유효한 PUT URL로 객체를 다시 올릴 수 있으므로 이 위험을 없애려면
  임시 키에서 최종 키로 복사하는 완료 처리 또는 객체 버전 고정이 후속으로 필요합니다.
- 스토리지 삭제 성공 후 DB 커밋이 실패하면 메타데이터가 남을 수 있습니다. 같은 삭제 요청 재시도로 정리합니다.

PR #114에서 `seaweedtest` DB·계정 생성과 로그인을 확인했습니다.
사용자가 로컬 PC의 키 인증으로 DB VM → PC → cp 파이프를 실행해 `file-service-env` 등록을 완료했습니다.
Secret 등록, 테스트 DB Flyway V1과 실환경 파일 생성·삭제 테스트까지 완료했습니다.
파일 서비스 Kubernetes 배포·Gateway 변경과 커밋·푸시·PR 생성은 아직 수행하지 않았습니다.

## 기존 SeaweedFS 설치

Master·Volume·Filer·S3 4개 Pod, 1Gi/10Gi/1Gi PVC, 비공개 `chat-attachments` 버킷과 인증 설정 완료.
직접 S3 업로드·다운로드 원본 일치·목록·삭제·비인증 접근 거부를 설치 당시 검증했습니다.
원본 설치 자료는 서버의 `/home/lab/seaweedfs/`에 있습니다. 인증 정보는 저장소에 복사하지 않습니다.
개발용 단일 복제본이며 local-path PVC는 노드 장애 시 자동 복구나 용량의 강제 상한을 보장하지 않습니다.
