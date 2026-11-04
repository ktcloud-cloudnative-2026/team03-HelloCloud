# ideaconnection 규칙

협업 툴 ideaconnection의 모노리포다. 사람과 AI 에이전트 모두 이 문서를 따른다.

## 구조

*   `deploy/`: k8s 클러스터 구성, Helm 차트와 values, Argo CD 앱, CI 서버(`deploy/ci/`)
*   `services/`: 백엔드 서비스, 웹 프론트, 테스트, Dockerfile, 로컬 개발 환경
*   `docs/`: 기획, 설계, 협업, 운영 문서(목록은 `README.md`)
*   `Jenkinsfile`: CI 파이프라인

## 공통

*   문서는 적고 최신으로 유지한다. 낡은 문서는 지운다. 코드와 문서는 같은
    커밋에서 고친다.
*   주석은 "왜"가 필요한 곳에만 단다.
*   이미지/차트/패키지 버전은 고정한다. `latest` 금지.
*   시크릿, 키, 토큰, kubeconfig는 커밋하지 않는다. 예시(`*.example`)만 둔다.

## Git

브랜치, 커밋, PR 규칙은 `docs/conventions.md`를 따른다.

## deploy/

*   이름은 `kebab-case`, YAML 들여쓰기 2칸, k8s 리소스는 `namespace`를
    명시한다.
*   환경은 `dev`와 `prod` 클러스터 두 개를 둔다. 앱마다 공통 `values.yaml`을
    두고, 환경별 차이만 `values-dev.yaml`, `values-prod.yaml`에 쓴다.
*   공개 Helm 차트를 우선 쓰고, 없거나 맞지 않으면 자체 차트를 만든다.
*   Argo CD로 배포한다. `main`이 곧 클러스터 상태이고, 롤백은 `git revert`다.
    공개 차트 버전은 `targetRevision`에 고정한다.
*   클러스터를 손으로 바꾸지 않는다. 예외는 kubeadm, CNI, Argo CD 설치와
    시크릿 생성이며 절차는 `deploy/cluster/`에 둔다.
*   PR 확인 방법: `helm template` 또는 `argocd app diff` 결과. 머지하면 바로
    배포된다.

## services/

*   언어별 포매터와 린터를 따른다. 새 기능과 버그 수정에는 테스트를 함께
    쓴다.
*   lock 파일(`gradle.lockfile`, `package-lock.json`)을 커밋한다.
*   설정은 환경 변수로 주입하고, 예시는 `.env.example`에 둔다.
*   이미지 태그는 커밋 SHA를 쓴다.
*   PR 확인 방법: 테스트 방법.

## AI 에이전트

*   작업 전에 `docs/`의 관련 문서를 읽는다.
*   사용자가 요청하기 전에는 커밋, 푸시, PR 생성을 하지 않는다.
*   실제 환경을 바꾸는 명령은 실행 전에 확인받는다: `helm install/upgrade/
    uninstall`, `kubectl apply/delete`, `argocd app sync/delete`, DB
    마이그레이션, 데이터 삭제.
*   자유롭게 실행: 테스트, 린트, `helm template`, `argocd app diff`,
    `--dry-run`.
*   시크릿을 출력하거나 파일에 쓰지 않는다.
*   요청 범위를 넘는 리팩터링과 파일 추가를 하지 않는다.
*   규칙을 바꿀 때는 이 파일이나 `docs/conventions.md`를 고치는 PR로 제안한다.
