# 클러스터 구축 (kubeadm)

강사 「kubeadm 구축 가이드」를 4팀 값으로 실행한 기록입니다. dev를 먼저, 같은 절차로 prod를 만듭니다.

## 4팀 값

| 항목 | dev | prod |
| --- | --- | --- |
| control plane | 10.10.24.11 | 10.10.24.21 |
| 워커 | 10.10.24.12, .13 | 10.10.24.22, .23 |
| MetalLB 대역 | 10.10.24.100-127 | 10.10.24.200-223 |
| 파드 대역 | 10.244.0.0/16 | 10.244.0.0/16 |

## 순서

1. **노드 준비 (3대 모두)** — `bash node-prep.sh`
   - 확인: `SystemdCgroup = true`, containerd 2.2.1, kubeadm v1.37.2
2. **control plane (cp에서)**
   ```bash
   sudo kubeadm init --pod-network-cidr=10.244.0.0/16 --apiserver-advertise-address=10.10.24.11
   mkdir -p ~/.kube && sudo cp /etc/kubernetes/admin.conf ~/.kube/config && sudo chown lab:lab ~/.kube/config
   ```
3. **워커 join (w1, w2에서)** — init 출력의 `kubeadm join ...` 앞에 `sudo`
   - 토큰을 잃어버리면 cp에서 `kubeadm token create --print-join-command`
4. **Calico (cp에서)** — `custom-resources.yaml`에서 두 줄을 꼭 바꿈
   - `cidr: 10.244.0.0/16`
   - `encapsulation: VXLAN` (CrossSubnet이면 다른 노드 파드 통신 실패)
5. **확인** — 노드 3대 Ready, 다른 노드 파드 간 wget OK

## dev 결과 (2026-11-04)

- 노드 3대 Ready (v1.37.2)
- web 파드 4개(w1 2개, w2 2개) 간 통신 4/4 OK

## Argo CD (dev)

Argo CD(Git 내용대로 클러스터에 배포하는 도구)는 손으로 한 번 설치합니다. prod도 같은 버전, 같은 절차로 설치합니다.

| 항목 | 값 |
| --- | --- |
| 버전 | v3.6.1 (2026-11-12 dev 설치) |
| namespace | `argocd` |
| 저장소 접근 | 공개 저장소라 등록하지 않음 |
| 이미지 접근 | GHCR 패키지 `idcn-user-service`, `idcn-file-service`, `idcn-chat-service`, `idcn-web`은 공개라 pull Secret 없음 |

1. **설치 (cp에서)** — 이미 설치돼 있으면 건너뜀(`kubectl get ns argocd`)
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd --server-side --force-conflicts \
     -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.6.1/manifests/install.yaml
   kubectl -n argocd rollout status deploy/argocd-server --timeout=300s
   ```
   - 확인: `kubectl get pods -n argocd` 7개 모두 `Running`
   - CRD가 커서 일반 `apply`는 크기 제한에 걸리므로 `--server-side`로 적용
2. **화면 접속 (내 PC에서)** — 켜 둔 채로 https://localhost:8080, 아이디 `admin`
   ```powershell
   ssh -L 8080:localhost:8080 t4-dev-cp "kubectl -n argocd port-forward svc/argocd-server 8080:443"
   ```
   - 처음 비밀번호: `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`
   - 로그인 후 비밀번호를 바꾸고 `argocd-initial-admin-secret`을 지움
3. **앱 처음 등록 (cp에서)** — 상위 앱이 생기기 전까지 손으로 등록
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/ktcloud-cloudnative-2026/team03-HelloCloud/main/deploy/argocd/services/web-dev.yaml
   ```
   - 확인: `kubectl get applications -n argocd`에서 `Synced`, `Healthy`
   - `user-service-dev.yaml`은 `ideaconnection-dev`에 `user-service-env` Secret과 DB를 준비한 뒤 등록
   - `chat-service-dev.yaml`은 [chat Secret](#db-vm-dev-mongodb--redis)을 만든 뒤 등록

## DB VM (dev MySQL)

dev의 MySQL은 클러스터 밖 DB 전용 VM에서 Docker로 띄웁니다(2026-11-12 팀 회의). dev와 prod는 DB VM을 분리합니다. prod DB VM은 2026-11-19에 추가됐으며 아래 운영 MySQL 절에 기록합니다. 로컬 `services/compose.yaml`과 같은 이미지·DB 이름을 씁니다.

| 항목 | dev |
| --- | --- |
| VM | `t4-db`, 10.10.24.10 (VM 안 hostname은 `t3-db`) |
| MySQL | `mysql:8.4.13`, Docker 29.1 + compose 2.40 (Ubuntu 패키지) |
| 열린 주소 | `10.10.24.10:3306`만 |
| 메모리 | buffer pool 256MB, 컨테이너 1GB (2026-11-19부터) |
| DB / 계정 | `user_service` / `user_service`, 파일 서비스 테스트용 `seaweedtest` / `seaweedtest` |
| 파일 | `/opt/mysql/compose.yaml`, `/opt/mysql/.env`(권한 600, 비밀번호), `/opt/mysql/seaweedtest.env`(권한 600, `seaweedtest` 비밀번호) |

1. **Docker 설치 (DB VM에서)** — 설치 후 다시 접속해야 docker 그룹이 적용됨
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2
   sudo usermod -aG docker lab
   ```
2. **파일 준비** — `/opt/mysql`에 아래 두 파일
   ```bash
   sudo mkdir -p /opt/mysql && sudo chown lab:lab /opt/mysql && cd /opt/mysql
   cat > compose.yaml <<'EOF'
   name: dev-mysql

   services:
     mysql:
       image: mysql:8.4.13
       restart: unless-stopped
       command: ["--innodb-buffer-pool-size=256M"]
       mem_limit: 1g
       ports:
         - "10.10.24.10:3306:3306"
       env_file: .env
       volumes:
         - mysql-data:/var/lib/mysql
       healthcheck:
         test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u user_service --password=$$MYSQL_PASSWORD"]
         interval: 10s
         timeout: 5s
         retries: 30

   volumes:
     mysql-data:
   EOF
   umask 077
   cat > .env <<EOF
   MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
   MYSQL_DATABASE=user_service
   MYSQL_USER=user_service
   MYSQL_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
   EOF
   ```
   - 비밀번호는 VM 안에서 만들어 `.env`에만 둡니다. 화면에 띄우거나 옮겨 적지 않습니다
3. **실행** — `docker compose up -d`
   - 확인: `docker compose ps`가 `(healthy)`, `ss -tln | grep 3306`이 `10.10.24.10:3306`
   - 메모리: 상한은 2026-11-19 실사용량(489Mi: buffer pool 128MB 기본값 + 그 밖 약 360Mi, 최대 연결 31)을 보고 정했습니다. buffer pool은 256MB로 적어 두어 상한까지 약 1/3 여유를 둡니다. buffer pool을 상한 가까이 키우면 연결 · 내부 기록에 쓸 몫이 모자라 컨테이너가 강제 종료됩니다
   - 이미 떠 있는 MySQL에 적용할 때는 `compose.yaml`을 고친 뒤 `docker compose up -d`로 다시 만듭니다. 데이터는 볼륨에 남고, 수십 초 동안 user · file이 DB에 못 붙으니 팀 채널에 먼저 알립니다
   - 메모리 확인: `docker stats --no-stream dev-mysql-mysql-1`의 LIMIT가 `1GiB`, 아래 명령이 `256`

     ```bash
     docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "SELECT @@innodb_buffer_pool_size/1024/1024"'
     ```
4. **클러스터에서 접속 확인 (cp에서)** — `timeout 3 bash -c '</dev/tcp/10.10.24.10/3306' && echo OK`

user-service의 `user-service-env` Secret(`ideaconnection-dev`)에는 이 DB를 씁니다. `DB_URL`은 `jdbc:mysql://10.10.24.10:3306/user_service`, `DB_USERNAME`은 `user_service`, `DB_PASSWORD`는 `.env`의 `MYSQL_PASSWORD`입니다. 초대 링크 앞부분인 `INVITE_BASE_URL`은 웹 주소 `http://10.10.24.101`입니다.

파일 서비스 테스트용 `seaweedtest` DB와 계정은 실행 중인 MySQL에 따로 만들었습니다(2026-11-17). 계정은 `seaweedtest` DB 안에서만 모든 권한을 가집니다. `/opt/mysql`에서 한 줄씩 실행합니다. 여러 줄 입력(heredoc)은 붙여 넣다 끊기기 쉽습니다.

```bash
umask 077; printf 'SEAWEEDTEST_PASSWORD=%s\n' "$(openssl rand -base64 24 | tr -d '/+=')" > seaweedtest.env
P=$(cut -d= -f2- seaweedtest.env); printf "CREATE DATABASE seaweedtest CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\nCREATE USER 'seaweedtest'@'%%' IDENTIFIED BY '%s';\nGRANT ALL PRIVILEGES ON seaweedtest.* TO 'seaweedtest'@'%%';\n" "$P" | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot'; unset P
```

- 확인: `docker compose exec -T -e MYSQL_PWD="$(cut -d= -f2- seaweedtest.env)" mysql mysql -useaweedtest -h127.0.0.1 seaweedtest -e "SELECT CURRENT_USER();"`가 `seaweedtest@%`
- 접속 주소는 `jdbc:mysql://10.10.24.10:3306/seaweedtest`입니다

- Docker가 연 포트에는 `ufw` 규칙이 적용되지 않으므로 내부 주소에만 엽니다
- dev라서 계정의 접속 IP는 제한하지 않았습니다. prod DB VM에서는 함께 정합니다

## DB VM (prod MySQL)

2026-11-19 추가된 운영 DB VM에 MySQL을 설치했습니다. dev와 데이터·계정·볼륨을 공유하지 않습니다.
이 절은 설치 기록이며, 실제 서비스 배포 완료를 뜻하지 않습니다.

| 항목 | prod |
| --- | --- |
| VM | `t4-prod-db`, 10.10.24.20 (실제 hostname은 `t3-prod-db`) |
| 사양 | Ubuntu 24.04, 2코어 / 4GB / 40GB |
| 설치 확인 버전 | Docker 29.1.3, Compose 2.40.3, `mysql:8.4.13` |
| 열린 주소 | `10.10.24.20:3306` |
| 메모리 | buffer pool 256MB, 컨테이너 상한 1GiB (dev 설정을 기준으로 시작) |
| DB / 서비스 계정 | `user_service` / `user_service` |
| 파일 / 데이터 | `/opt/mysql/compose.yaml`, `/opt/mysql/.env`(권한 600), 볼륨 `prod-mysql_mysql-data` |

### 설치 방법 (운영 DB VM에서, 최초 한 번)

실제 변경은 팀 확인 후 진행합니다. 이미 설치된 서버에서는 아래 초기화 절차를 반복하지 않습니다.

1. 위 dev MySQL 절의 Docker 설치 명령을 실행하고 재접속합니다.
   `docker --version`, `docker compose version`, `docker ps`로 확인합니다.
2. 이미지를 받고 `/opt/mysql/compose.yaml`을 준비합니다.
   아래는 실제 운영 서버에 사용한 전체 설정입니다.

   ```bash
   docker pull mysql:8.4.13
   sudo mkdir -p /opt/mysql
   sudo chown lab:lab /opt/mysql
   cd /opt/mysql
   cat > compose.yaml <<'EOF'
   name: prod-mysql

   services:
     mysql:
       image: mysql:8.4.13
       restart: unless-stopped
       command: ["--innodb-buffer-pool-size=256M"]
       mem_limit: 1g
       ports:
         - "10.10.24.20:3306:3306"
       env_file: .env
       volumes:
         - mysql-data:/var/lib/mysql
       healthcheck:
         test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u user_service --password=$$MYSQL_PASSWORD"]
         interval: 10s
         timeout: 5s
         retries: 30

   volumes:
     mysql-data:
   EOF
   ```
3. `.env`는 운영 VM 안에서만 생성합니다. 관리자와 서비스 계정은 서로 다른
   무작위 비밀번호를 사용합니다. 아래 예시는 값을 출력하지 않고,
   기존 파일이 있으면 덮어쓰지 않고 실패합니다.

   ```bash
   cd /opt/mysql
   (
     umask 077
     set -o noclobber
     cat > .env <<EOF
   MYSQL_ROOT_PASSWORD=$(openssl rand -hex 24)
   MYSQL_DATABASE=user_service
   MYSQL_USER=user_service
   MYSQL_PASSWORD=$(openssl rand -hex 24)
   EOF
   )
   stat -c '%a %U %n' .env
   cut -d= -f1 .env
   docker compose config --quiet
   ```

   `600 lab .env`와 키 이름 4개를 확인합니다.
   `.env`를 출력·복사·커밋하지 않습니다. `docker compose config`는
   `--quiet`를 빼면 비밀번호가 출력될 수 있습니다.
4. `docker compose up -d`로 최초 실행 후 아래로 확인합니다.
   출력에는 비밀번호 대신 계정·DB 이름과 설정 숫자만 나옵니다.

   ```bash
   docker compose ps
   docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -h127.0.0.1 -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT CURRENT_USER(), DATABASE(), @@innodb_buffer_pool_size/1024/1024 AS buffer_pool_mb;"'
   docker stats --no-stream prod-mysql-mysql-1
   ss -ltn 'sport = :3306'
   ```

   초기 DB·계정 환경 변수는 빈 데이터 볼륨의 첫 실행에 적용됩니다.
   이후 `.env` 수정만으로 기존 DB 비밀번호가 바뀌지는 않습니다.
   볼륨을 삭제하거나 비밀번호 파일을 재생성해 초기화하지 않습니다.
5. prod cp에서 포트 도달 여부를 확인합니다.

   ```bash
   timeout 3 bash -c '</dev/tcp/10.10.24.20/3306' && echo OK
   ```

### 확인 결과와 남은 범위 (2026-11-19)

- 컨테이너 `healthy`, VM 안에서 서비스 계정으로 `user_service` DB 로그인 성공
- buffer pool 256MB, 컨테이너 메모리 상한 1GiB, `10.10.24.20:3306` 수신 확인
- prod cp에서 3306 TCP 연결 성공. 파드에서의 DB 인증과 서비스 동작을 확인한 것은 아닙니다
- user 운영 연결 주소는 `jdbc:mysql://10.10.24.20:3306/user_service`입니다.
  운영 Secret 등록·서비스 최초 기동(Flyway 포함)은 아직 진행하지 않았습니다
- 파일 서비스 전용 DB·계정, MongoDB·Redis는 이번 설치 범위에 포함하지 않았습니다
- 같은 VM에 MongoDB·Redis도 올린다면 dev 기준 MySQL 1GiB + MongoDB 1GiB + Redis 384MiB,
  exporter 4개 × 64MiB까지 포함해 상한 합계 약 2.6GiB입니다. prod 도입 범위·배분은 미확정이며,
  4GB VM의 OS 메모리 여유와 실제 사용량을 확인한 뒤 정합니다
- 운영 DB 백업 위치·주기·보관 기간과 복구 확인 절차는 아직 준비하지 않았습니다. 실제 데이터 운영 전에 팀에서 정합니다
- MySQL 이미지가 만든 서비스 계정은 현재 `user_service@%`입니다.
  접속 원본 제한은 운영 파드의 실제 원본 주소를 확인한 뒤 팀과 정해야 합니다.
  내부 IP에 바인딩한 것만으로 계정의 접속 원본 제한까지 완료한 것은 아닙니다
- 운영 외부/내부 접속 방식, HTTPS, Keycloak·SeaweedFS 구성과 실제 서비스 연결 검증은 별도 작업입니다

공개 SSH 예시는 `t4-prod-db`를 사용합니다. 강사 안내 및 기존 PC의 `t3-prod-db`도
같은 주소를 가리키며, bastion 별칭은 본인 설정에 맞춥니다.
아래 prod DB 지문은 최초 접속 화면과 기존 prod cp에서 조회한 값이 일치한 결과입니다.
강사가 별도로 제공한 지문과 대조한 것은 아닙니다.

## 파일 테스트 DB 연결 (`seaweedtest`)

PR #114에서 `seaweedtest` DB·전용 계정 생성과 로그인을 검증했습니다.
접속 주소는 `jdbc:mysql://10.10.24.10:3306/seaweedtest`이며 비밀번호는 DB VM의
`/opt/mysql/seaweedtest.env`에 있습니다. 기존 DB를 다시 만들거나 비밀번호를 변경하지 않습니다.

cp → DB VM SSH 인증이 없는 경우, DB VM 터미널에서 아래 한 줄을 실행하면 기존 비밀번호가
SSH로 cp의 메모리로만 전달됩니다. cp의 도구가 실제 DB 로그인을 확인하고 `file-service-env`를 생성합니다.
DB VM → cp SSH 인증이 필요합니다. 지문은 아래 표와 대조하고 호스트 키 검사를 끄지 않습니다.

```bash
cut -d= -f2- /opt/mysql/seaweedtest.env | ssh lab@10.10.24.11 '/tmp/file-validation-venv/bin/python /home/lab/team03-HelloCloud/deploy/cluster/scripts/register-file-test-secret.py'
```

- cp 도구는 PyMySQL 1.1.2와 MySQL 인증용 cryptography를 사용합니다.
- 비밀번호를 화면·파일·Git에 복사하지 않습니다. SSH 입력은 단일 비밀번호 줄입니다.
- Secret은 `ideaconnection-dev/file-service-env`이며 기존 User issuer와 SeaweedFS 인증 정보를 안전하게 조합합니다.
- 동일한 DB 비밀번호의 Secret이 이미 있으면 유지하고, 다른 설정이면 덮어쓰지 않고 중단합니다.
- 현재 테스트 S3 인증은 기존 관리자 인증을 재사용합니다. 운영 전에는 파일 서비스용 권한으로 분리합니다.
- DB VM → cp 인증이 없으면 두 서버에 접속 가능한 로컬 PowerShell에서 기존 SSH 별칭으로 중계합니다.

  ```powershell
  ssh t4-db "cut -d= -f2- /opt/mysql/seaweedtest.env" | ssh t4-dev-cp "/tmp/file-validation-venv/bin/python /home/lab/team03-HelloCloud/deploy/cluster/scripts/register-file-test-secret.py"
  ```

- 2026-11-18 위 PC 중계로 Secret 등록 성공. `seaweedtest` 로그인과 Flyway V1,
  실제 MySQL·SeaweedFS 업로드부터 삭제까지 통합 테스트를 확인했습니다.
- 파일 서비스 Kubernetes 배포와 실제 Keycloak 사용자/브라우저 연결은 남아 있습니다.

## DB VM (dev MongoDB · Redis)

chat이 쓰는 MongoDB(메시지 저장)와 Redis(서버끼리 실시간 전달)도 MySQL과 같은 DB VM에서 Docker로 띄웁니다(2026-11-16 팀 회의). Docker 설치는 위 MySQL 절차 1번과 같습니다.

| 항목 | MongoDB | Redis |
| --- | --- | --- |
| 이미지 | `mongo:8.0.34` | `redis:8.10.0` |
| 열린 주소 | `10.10.24.10:27017`만 | `10.10.24.10:6379`만 |
| 계정 | `chat_service` (`chat_service` DB만 읽기·쓰기) | 비밀번호 하나 |
| 메모리 | 캐시 0.5GB, 컨테이너 1GB | 데이터 256MB, 컨테이너 384MB |
| 파일 | `/opt/mongodb/compose.yaml`, `mongo-init.js`, `.env`(권한 600) | `/opt/redis/compose.yaml`, `.env`(권한 600) |

DB VM은 메모리가 3.8GB이고 swap이 없습니다. 세 DB가 메모리를 나눠 쓰므로, 하나가 메모리를 다 써서 나머지까지 멈추지 않도록 MySQL을 포함한 셋 모두 상한을 둡니다(MySQL 1GB + MongoDB 1GB + Redis 384MB, 앞으로 붙일 exporter까지 합쳐 약 2.6GB).

- Redis는 데이터 상한(`maxmemory` 256MB)이 컨테이너 상한(384MB)보다 작습니다. 그래서 꽉 차면 컨테이너가 강제 종료되기 전에 Redis가 먼저 에러를 냅니다

1. **MongoDB 파일 준비** — `/opt/mongodb`에 아래 세 파일
   ```bash
   sudo mkdir -p /opt/mongodb && sudo chown lab:lab /opt/mongodb && cd /opt/mongodb
   cat > compose.yaml <<'EOF'
   name: dev-mongodb

   services:
     mongodb:
       image: mongo:8.0.34
       restart: unless-stopped
       command: ["--wiredTigerCacheSizeGB", "0.5"]
       mem_limit: 1g
       ports:
         - "10.10.24.10:27017:27017"
       env_file: .env
       volumes:
         - mongodb-data:/data/db
         - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
       healthcheck:
         test: ["CMD", "mongosh", "--quiet", "--eval", "quit(db.adminCommand('ping').ok ? 0 : 1)"]
         interval: 10s
         timeout: 5s
         retries: 30

   volumes:
     mongodb-data:
   EOF
   cat > mongo-init.js <<'EOF'
   db = db.getSiblingDB(process.env.CHAT_DB);
   db.createUser({
     user: process.env.CHAT_USER,
     pwd: process.env.CHAT_PASSWORD,
     roles: [{ role: "readWrite", db: process.env.CHAT_DB }]
   });
   EOF
   umask 077
   cat > .env <<EOF
   MONGO_INITDB_ROOT_USERNAME=root
   MONGO_INITDB_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
   CHAT_DB=chat_service
   CHAT_USER=chat_service
   CHAT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
   EOF
   ```
   - `mongo-init.js`는 데이터 볼륨이 비어 있을 때 처음 한 번만 실행됩니다. 나중에 계정을 바꾸려면 이 파일이 아니라 `mongosh`로 바꿉니다
2. **Redis 파일 준비** — `/opt/redis`에 아래 두 파일
   ```bash
   sudo mkdir -p /opt/redis && sudo chown lab:lab /opt/redis && cd /opt/redis
   cat > compose.yaml <<'EOF'
   name: dev-redis

   services:
     redis:
       image: redis:8.10.0
       restart: unless-stopped
       command:
         - sh
         - -c
         - exec redis-server --requirepass "$$REDIS_PASSWORD" --maxmemory 256mb --maxmemory-policy noeviction --appendonly no --save ""
       mem_limit: 384m
       ports:
         - "10.10.24.10:6379:6379"
       env_file: .env
       healthcheck:
         test: ["CMD-SHELL", 'redis-cli -a "$$REDIS_PASSWORD" --no-auth-warning ping | grep -q PONG']
         interval: 10s
         timeout: 5s
         retries: 30
   EOF
   umask 077
   cat > .env <<EOF
   REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
   EOF
   ```
   - Redis는 메시지를 저장하지 않고 받는 서버에 바로 전달만 하므로 디스크 저장을 끕니다(`--appendonly no --save ""`). 재시작하면 Redis 안의 내용은 비지만, 채팅 메시지는 MongoDB에 남습니다
   - 메모리가 차도 지우지 않습니다(`noeviction`). 누가 Redis에 데이터를 쌓아 꽉 차면 몰래 지우는 대신 에러가 나서 바로 알 수 있습니다. **포기하는 점:** 나중에 Redis에 데이터를 저장하게 되면 디스크 저장을 다시 켜야 합니다
3. **실행** — 각 폴더에서 `docker compose up -d`
   - 확인: `docker compose ps`가 `(healthy)`, `ss -tln`에 `10.10.24.10:27017`, `10.10.24.10:6379`
   - MongoDB 계정 확인: `docker compose exec mongodb sh -c 'mongosh --quiet -u "$CHAT_USER" -p "$CHAT_PASSWORD" --authenticationDatabase "$CHAT_DB" "$CHAT_DB" --eval "db.runCommand({ping:1}).ok"'`가 `1`
   - Redis 비밀번호 확인: `docker compose exec redis redis-cli ping`이 `NOAUTH`, `docker compose exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'`이 `PONG`
4. **클러스터에서 접속 확인 (cp에서)** — `timeout 3 bash -c '</dev/tcp/10.10.24.10/27017' && echo OK`, 포트를 `6379`로 바꿔 한 번 더

chat의 `chat-service-env` Secret(`ideaconnection-dev`)에는 아래 값을 씁니다. 이름은 [공통 규칙](../../docs/conventions.md#3-설정과-비밀값)을 따릅니다.

| 키 | 값 |
| --- | --- |
| `DB_URL` | `mongodb://10.10.24.10:27017/chat_service?authSource=chat_service` |
| `DB_USERNAME` | `chat_service` |
| `DB_PASSWORD` | `/opt/mongodb/.env`의 `CHAT_PASSWORD` |
| `REDIS_URL` | `redis://10.10.24.10:6379` |
| `REDIS_PASSWORD` | `/opt/redis/.env`의 `REDIS_PASSWORD` |
| `OIDC_ISSUER_URI` | `http://10.10.24.101/realms/hellocloud` (비밀값은 아니지만 다른 서비스처럼 Secret에 둡니다. 없으면 chat이 시작하지 않습니다) |

- user-service도 멤버 제거를 chat에 알리려고(`MEMBER_REMOVED`) 같은 Redis를 씁니다. `user-service-env`에 `REDIS_URL`, `REDIS_PASSWORD`를 더합니다. 키가 없어도 user-service는 뜨지만 알림이 빠집니다

**user Secret에 Redis 더하기** — 내 PC(WSL)에서 실행합니다. 기존 키는 그대로 두고 두 키만 더합니다. 비밀번호는 화면에 나오지 않습니다.

```bash
ssh t4-db 'R=$(grep "^REDIS_PASSWORD=" /opt/redis/.env | cut -d= -f2-); printf "{\"stringData\":{\"REDIS_URL\":\"redis://10.10.24.10:6379\",\"REDIS_PASSWORD\":\"%s\"}}" "$R"' | ssh t4-dev-cp 'kubectl patch secret user-service-env -n ideaconnection-dev --type merge --patch-file=/dev/stdin'
```
- 확인 (cp에서): `kubectl get secret user-service-env -n ideaconnection-dev -o yaml | grep -oE "^  [A-Z_]+:"`에 `REDIS_URL`, `REDIS_PASSWORD`가 보이면 정상
- Secret을 바꿔도 이미 뜬 파드는 모릅니다. `kubectl rollout restart deployment/user-service -n ideaconnection-dev`로 다시 띄웁니다
- Redis 로그의 `Memory overcommit must be enabled` 경고는 디스크 저장 중 메모리가 모자랄 때의 이야기라, 저장을 끈 지금은 영향이 없습니다

**chat Secret 만들기** — chat을 dev에 처음 배포하기 전에 한 번 합니다. 내 PC(WSL)에서 실행합니다. 비밀번호는 DB VM의 `.env`에서 cp의 `kubectl`로 바로 넘어가므로 화면 · 파일 · 명령 기록에 남지 않습니다.

1. **확인 (클러스터를 바꾸지 않음)** — 키 이름 6개만 나오면 정상
   ```bash
   ssh t4-db 'M=$(grep "^CHAT_PASSWORD=" /opt/mongodb/.env | cut -d= -f2-); R=$(grep "^REDIS_PASSWORD=" /opt/redis/.env | cut -d= -f2-); printf "%s\n" "DB_URL=mongodb://10.10.24.10:27017/chat_service?authSource=chat_service" "DB_USERNAME=chat_service" "DB_PASSWORD=$M" "REDIS_URL=redis://10.10.24.10:6379" "REDIS_PASSWORD=$R" "OIDC_ISSUER_URI=http://10.10.24.101/realms/hellocloud"' | ssh t4-dev-cp 'kubectl create secret generic chat-service-env -n ideaconnection-dev --from-env-file=/dev/stdin --dry-run=client -o yaml | grep -oE "^  [A-Z_]+:"'
   ```
   - 값이 비어 있지 않은지는 위 명령의 `| ssh t4-dev-cp '…'` 부분을 `| awk -F= '{print $1, length($0)-length($1)-1}'`로 바꿔 글자 수로 확인합니다. 0이 있으면 `.env`의 이름이 다른 것입니다
2. **만들기** — 1번 명령의 마지막 `| grep -oE "^  [A-Z_]+:"`를 `| kubectl apply -f -`로 바꿔 실행합니다. 비밀번호를 바꾼 뒤 다시 실행하면 덮어씁니다
3. **확인 (cp에서)** — `kubectl get secret chat-service-env -n ideaconnection-dev -o yaml | grep -oE "^  [A-Z_]+:"`
   - `-o yaml`은 `grep` 없이 출력하지 않습니다. 값이 base64로 보이는데, base64는 암호가 아니라 누구나 되돌릴 수 있습니다

## DB VM (dev exporter)

부하 테스트에서 느려진 원인이 서비스인지 DB인지 보려고, DB VM에 exporter(상태를 Prometheus가 읽는 숫자로 바꿔 주는 작은 프로그램)를 띄웁니다(2026-11-19, #133). Prometheus는 클러스터 밖 주소를 이름표로 못 찾아서 `deploy/values/monitoring/values-dev.yaml`에 주소를 직접 적습니다.

| exporter | 이미지 | 주소 | 읽는 것 |
| --- | --- | --- | --- |
| node | `prom/node-exporter:v1.12.1` | `10.10.24.10:9100` | VM의 CPU · 메모리 · 디스크 |
| MySQL | `prom/mysqld-exporter:v0.21.0` | `10.10.24.10:9104` | 연결 수, 쿼리 수 |
| MongoDB | `percona/mongodb_exporter:0.54.0` | `10.10.24.10:9216` | 연결 수, 처리량 |
| Redis | `oliver006/redis_exporter:v1.97.0` | `10.10.24.10:9121` | 메모리, 명령 수 |

- 파일: `/opt/exporters/compose.yaml`, `/opt/exporters/.env`(권한 600, 비밀번호 3개)
- 메모리: 각각 상한 64MB. 2026-11-19 실사용 3~21MiB
- node-exporter v1.13.0은 2026-11-18에 막 나와서 부하 테스트 전까지 v1.12.1을 씁니다
- node-exporter는 컨테이너가 아니라 VM을 보게 `network_mode: host`, `pid: host`, VM 전체를 읽기 전용으로 붙입니다. host 모드는 포트 연결을 못 써서 프로그램이 `10.10.24.10:9100`에만 엽니다
- 계정은 상태를 읽는 권한만 줍니다. MySQL은 `'exporter'@'172.%'`(exporter 컨테이너는 MySQL에 Docker 게이트웨이 주소 `172.18.0.1`로 보임), 동시 연결 3개, `PROCESS, REPLICATION CLIENT, SELECT`. MongoDB는 `clusterMonitor`
- Redis는 새 계정 없이 기존 비밀번호를 씁니다. 전용 계정을 만들려면 Redis 설정(ACL)을 바꿔야 해서입니다. **포기하는 점:** exporter가 Redis 전체 권한 비밀번호를 압니다. prod에서는 전용 계정을 만듭니다
- MongoDB는 `--compatible-mode`만으로는 연결 수가 안 나와서 `--collector.diagnosticdata`를 켭니다. 그래서 응답이 약 1만 줄로 큽니다. 모든 정보(`--collect-all`)는 dev에는 과해서 켜지 않습니다

1. **비밀번호 파일 (DB VM에서)** — 비밀번호는 VM 안에서 만들고 화면에 띄우지 않습니다
   ```bash
   sudo mkdir -p /opt/exporters && sudo chown lab:lab /opt/exporters && cd /opt/exporters
   umask 077
   printf 'MYSQLD_EXPORTER_PASSWORD=%s\nMONGO_EXPORTER_PASSWORD=%s\n' "$(openssl rand -base64 24 | tr -d '/+=')" "$(openssl rand -base64 24 | tr -d '/+=')" > .env
   grep '^REDIS_PASSWORD=' /opt/redis/.env >> .env
   ```
   - 확인: `ls -l .env`가 `-rw-------`, `cut -d= -f1 .env`가 이름 3개
2. **DB 계정** — 한 줄씩 실행합니다
   ```bash
   cd /opt/mysql
   P=$(grep '^MYSQLD_EXPORTER_PASSWORD=' /opt/exporters/.env | cut -d= -f2-); printf "CREATE USER 'exporter'@'172.%%' IDENTIFIED BY '%s' WITH MAX_USER_CONNECTIONS 3;\nGRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'172.%%';\n" "$P" | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot'; unset P
   cd /opt/mongodb
   P=$(grep '^MONGO_EXPORTER_PASSWORD=' /opt/exporters/.env | cut -d= -f2-); docker compose exec -T -e P="$P" mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin admin --eval "db.createUser({user: \"exporter\", pwd: process.env.P, roles: [{role: \"clusterMonitor\", db: \"admin\"}]}).ok"'; unset P
   ```
   - MySQL 확인(exporter와 같은 조건): `docker run --rm --env-file /opt/exporters/.env mysql:8.4.13 sh -c 'MYSQL_PWD="$MYSQLD_EXPORTER_PASSWORD" mysql -h 10.10.24.10 -uexporter -e "SELECT CURRENT_USER();"'`가 `exporter@172.%`
   - MongoDB 확인: `docker run --rm --env-file /opt/exporters/.env mongo:8.0.34 sh -c 'mongosh --quiet "mongodb://10.10.24.10:27017/admin" -u exporter -p "$MONGO_EXPORTER_PASSWORD" --authenticationDatabase admin --eval "db.runCommand({serverStatus: 1}).ok"'`가 `1`
3. **compose.yaml** — 비밀번호는 `${}`로 `.env`에서 읽고, 컨테이너마다 자기 비밀번호만 받습니다
   ```bash
   cd /opt/exporters
   cat > compose.yaml <<'EOF'
   name: dev-exporters

   services:
     node-exporter:
       image: prom/node-exporter:v1.12.1
       restart: unless-stopped
       network_mode: host
       pid: host
       mem_limit: 64m
       volumes:
         - /:/host:ro,rslave
       command:
         - --path.rootfs=/host
         - --web.listen-address=10.10.24.10:9100

     mysqld-exporter:
       image: prom/mysqld-exporter:v0.21.0
       restart: unless-stopped
       mem_limit: 64m
       ports:
         - "10.10.24.10:9104:9104"
       environment:
         MYSQLD_EXPORTER_PASSWORD: ${MYSQLD_EXPORTER_PASSWORD}
       command:
         - --mysqld.address=10.10.24.10:3306
         - --mysqld.username=exporter

     mongodb-exporter:
       image: percona/mongodb_exporter:0.54.0
       restart: unless-stopped
       mem_limit: 64m
       ports:
         - "10.10.24.10:9216:9216"
       environment:
         MONGODB_URI: mongodb://exporter:${MONGO_EXPORTER_PASSWORD}@10.10.24.10:27017/admin
       command:
         - --compatible-mode
         - --collector.diagnosticdata

     redis-exporter:
       image: oliver006/redis_exporter:v1.97.0
       restart: unless-stopped
       mem_limit: 64m
       ports:
         - "10.10.24.10:9121:9121"
       environment:
         REDIS_ADDR: redis://10.10.24.10:6379
         REDIS_PASSWORD: ${REDIS_PASSWORD}
   EOF
   ```
   - 확인: `grep -c PASSWORD compose.yaml`이 `3`(값은 없음), `docker compose config --quiet`. `--quiet` 없이 치면 비밀번호가 화면에 나옵니다
4. **실행** — `docker compose up -d`. 기존 DB 컨테이너는 다른 묶음이라 건드리지 않습니다
   - 확인: `docker compose ps` 4개 Up, `docker stats --no-stream $(docker compose ps -q)`가 64MiB 안쪽
5. **클러스터에서 확인 (cp에서)** — 아래가 `mysql_up 1`, `mongodb_up{...} 1`, `redis_up 1`, 숫자 하나
   ```bash
   curl -s http://10.10.24.10:9104/metrics | grep '^mysql_up'
   curl -s http://10.10.24.10:9216/metrics | grep '^mongodb_up'
   curl -s http://10.10.24.10:9121/metrics | grep '^redis_up'
   curl -s http://10.10.24.10:9100/metrics | grep '^node_memory_MemAvailable_bytes'
   ```
6. **Prometheus 연결** — `deploy/values/monitoring/values-dev.yaml`의 `additionalScrapeConfigs` PR을 머지하고 monitoring-dev를 동기화합니다(확인받고). Prometheus 화면 Status → Targets에서 `db-vm-*` 4개가 UP

## SSH 접속

내 PC에서 bastion을 거쳐 각 VM에 접속합니다. 설정은 [ssh_config.example](ssh_config.example)을 `~/.ssh/config`에 붙여 넣고 `<...>`를 채웁니다. bastion 주소·포트는 팀 채널에서 받습니다.

처음 접속하거나 `REMOTE HOST IDENTIFICATION HAS CHANGED` 경고가 나오면 화면의 지문을 아래 표와 비교합니다. 지문은 비밀값이 아닙니다. prod DB 지문은 2026-11-19에 추가 확인했습니다.

| 이름 | IP | ED25519 지문 (2026-11-12 확인) |
| --- | --- | --- |
| `t4-bastion` | 팀 채널 | `SHA256:Zic8ySmi6IAyqpp3qXbUYFVY19Om5spP+o2xVpIUW2A` |
| `t4-db` | 10.10.24.10 | `SHA256:oj1qDJIqdYRQ3J2JCY8NbnCwwowGySLIyUdNubMXeng` |
| `t4-dev-cp` | 10.10.24.11 | `SHA256:O0I5yeIiTYBBwdhM6bCvuS9Kqx0t1mA+7zsyqvxdZt8` |
| `t4-dev-w1` | 10.10.24.12 | `SHA256:u/t9EDyEN6eWcdmdoh6lQ/NMpk8YqirW+Z0HfoeoAR0` |
| `t4-dev-w2` | 10.10.24.13 | `SHA256:iJ9pvTjQeDldYKkzTs7NE+FfIkbaLFwylM3R0/vEWM4` |
| `t4-prod-db` | 10.10.24.20 | `SHA256:X4Z+XlGEqpx6/d/50UwkjcDCqhrIMRtS5llxnlLGYqM` |
| `t4-prod-cp` | 10.10.24.21 | `SHA256:KrVEQlRsBfIKUBrUzq1BpERf4lp2cDDTc4EB/JkEOFc` |
| `t4-prod-w1` | 10.10.24.22 | `SHA256:JgYpn7p58RWgSnNjwgQBVOHoTlJyAozXIC7Q9iVMMrU` |
| `t4-prod-w2` | 10.10.24.23 | `SHA256:HpLY5G985iDlCBjTZcYBdlcVmv3NIK5FKoPgbeElVt0` |

- **같으면** 예전 기록을 지우고 다시 접속해 `yes`: `ssh-keygen -R <이름>` (예전 설정으로 저장했다면 `<IP>`, bastion은 `'[<주소>]:<포트>'`)
- **다르면** 접속하지 않고 팀 채널에 알립니다
- VM을 다시 만들면 키가 바뀝니다. 만든 사람이 팀 채널에 알리고 이 표를 고칩니다. 내부 VM 지문은 cp에서 `ssh-keyscan -t ed25519 <IP> | ssh-keygen -lf -`로 확인합니다
- `StrictHostKeyChecking no`로 경고를 끄지 않습니다

## 주의

- `admin.conf`, `~/.kube/config`, join 토큰, Argo CD 비밀번호, DB VM의 `.env`는 저장소·채팅에 올리지 않습니다
- `ssh t4-...`는 내 PC(PowerShell)에서 실행합니다. 노드 안에서는 다른 노드 이름을 모릅니다