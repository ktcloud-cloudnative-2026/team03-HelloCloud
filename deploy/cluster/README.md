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
| 이미지 접근 | GHCR 패키지 `idcn-user-service`, `idcn-web`은 공개라 pull Secret 없음 |

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

## DB VM (dev MySQL)

dev의 MySQL은 클러스터 밖 DB 전용 VM에서 Docker로 띄웁니다(2026-11-12 팀 회의). VM 하나를 DB에만 쓰고, prod용 DB VM은 따로 받습니다. 로컬 `services/compose.yaml`과 같은 이미지·DB 이름을 씁니다.

| 항목 | dev |
| --- | --- |
| VM | `t4-db`, 10.10.24.10 (VM 안 hostname은 `t3-db`) |
| MySQL | `mysql:8.4.13`, Docker 29.1 + compose 2.40 (Ubuntu 패키지) |
| 열린 주소 | `10.10.24.10:3306`만 |
| DB / 계정 | `user_service` / `user_service` |
| 파일 | `/opt/mysql/compose.yaml`, `/opt/mysql/.env`(권한 600, 비밀번호) |

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
4. **클러스터에서 접속 확인 (cp에서)** — `timeout 3 bash -c '</dev/tcp/10.10.24.10/3306' && echo OK`

user-service의 `user-service-env` Secret(`ideaconnection-dev`)에는 이 DB를 씁니다. `DB_URL`은 `jdbc:mysql://10.10.24.10:3306/user_service`, `DB_USERNAME`은 `user_service`, `DB_PASSWORD`는 `.env`의 `MYSQL_PASSWORD`입니다.

- Docker가 연 포트에는 `ufw` 규칙이 적용되지 않으므로 내부 주소에만 엽니다
- dev라서 계정의 접속 IP는 제한하지 않았습니다. prod DB VM에서는 함께 정합니다

## SSH 접속

내 PC에서 bastion을 거쳐 각 VM에 접속합니다. 설정은 [ssh_config.example](ssh_config.example)을 `~/.ssh/config`에 붙여 넣고 `<...>`를 채웁니다. bastion 주소·포트는 팀 채널에서 받습니다.

처음 접속하거나 `REMOTE HOST IDENTIFICATION HAS CHANGED` 경고가 나오면 화면의 지문을 아래 표와 비교합니다. 지문은 비밀값이 아닙니다.

| 이름 | IP | ED25519 지문 (2026-11-12 확인) |
| --- | --- | --- |
| `t4-bastion` | 팀 채널 | `SHA256:Zic8ySmi6IAyqpp3qXbUYFVY19Om5spP+o2xVpIUW2A` |
| `t4-db` | 10.10.24.10 | `SHA256:oj1qDJIqdYRQ3J2JCY8NbnCwwowGySLIyUdNubMXeng` |
| `t4-dev-cp` | 10.10.24.11 | `SHA256:O0I5yeIiTYBBwdhM6bCvuS9Kqx0t1mA+7zsyqvxdZt8` |
| `t4-dev-w1` | 10.10.24.12 | `SHA256:u/t9EDyEN6eWcdmdoh6lQ/NMpk8YqirW+Z0HfoeoAR0` |
| `t4-dev-w2` | 10.10.24.13 | `SHA256:iJ9pvTjQeDldYKkzTs7NE+FfIkbaLFwylM3R0/vEWM4` |
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