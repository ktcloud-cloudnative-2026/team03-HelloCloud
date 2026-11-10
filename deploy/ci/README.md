# CI (Jenkins)

PR과 `main`을 2분마다 스캔해 `Jenkinsfile`을 실행하고, 결과를 PR 상태 체크로 남깁니다. 설정은 모두 이 폴더의 파일(JCasC)로 관리하며 화면에서 바꾸지 않습니다.

| 파일 | 역할 |
| --- | --- |
| `compose.yaml` | 컨트롤러와 SSH 에이전트 실행 |
| `Dockerfile.controller`, `plugins.txt` | Jenkins 2.580.2 LTS와 플러그인(버전 고정) |
| `Dockerfile.agent` | 검사 도구: git, yamllint, helm, kubeconform(버전 고정) |
| `jenkins.yaml` | JCasC: 관리자, 자격 증명, 에이전트, `ideaconnection` 작업 |
| `.env.example` | 시크릿 양식 (`.env`는 커밋하지 않음) |

## 준비 (처음 한 번)

1. GitHub 토큰(classic) 발급: 권한 `repo:status`만
2. `.env` 작성 (저장소 루트에서)

```bash
cp deploy/ci/.env.example deploy/ci/.env
ssh-keygen -t ed25519 -N "" -C idcn-jenkins-agent -f /tmp/agent_key -q
# .env에 값 채우기: AGENT_SSH_PUBLIC_KEY는 /tmp/agent_key.pub 한 줄,
# AGENT_SSH_PRIVATE_KEY는 /tmp/agent_key 전체를 큰따옴표로 감싸서
chmod 600 deploy/ci/.env
rm /tmp/agent_key /tmp/agent_key.pub
```

## 실행

```bash
docker compose -f deploy/ci/compose.yaml up -d --build
```

- 화면: `http://<CI VM>:8080`, 아이디 `admin`
- 확인: 에이전트 `agent` 온라인, `ideaconnection` 작업 존재

## 설정 바꾸기

`jenkins.yaml`을 고쳐 PR로 머지한 뒤 컨트롤러를 다시 만듭니다.

```bash
docker compose -f deploy/ci/compose.yaml up -d --force-recreate controller
```

## 막혔을 때

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 로그인 대신 "Create First Admin User" 화면 | `.env`의 비밀번호가 빈 값(특수문자 `$`, `#`) | 비밀번호를 작은따옴표로 감싸고 `--force-recreate controller` |