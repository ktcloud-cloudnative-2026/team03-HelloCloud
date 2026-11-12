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

## 주의

- `admin.conf`, `~/.kube/config`, join 토큰, Argo CD 비밀번호는 저장소·채팅에 올리지 않습니다
- `ssh t4-...`는 내 PC(PowerShell)에서 실행합니다. 노드 안에서는 다른 노드 이름을 모릅니다