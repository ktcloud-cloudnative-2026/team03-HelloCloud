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

## 주의

- `admin.conf`, `~/.kube/config`, join 토큰은 저장소·채팅에 올리지 않습니다
- `ssh t4-...`는 내 PC(PowerShell)에서 실행합니다. 노드 안에서는 다른 노드 이름을 모릅니다