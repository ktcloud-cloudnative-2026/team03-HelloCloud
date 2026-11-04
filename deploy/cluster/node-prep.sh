#!/usr/bin/env bash
# kubeadm 노드 준비 — control plane, 워커 전부에서 실행 (kubeadm 구축 가이드 3단계)
# 사용법: bash node-prep.sh
set -euo pipefail

echo "[1/5] swap 끄기"
sudo swapoff -a
sudo sed -i '/\sswap\s/s/^/#/' /etc/fstab

echo "[2/5] 커널 모듈"
printf 'overlay\nbr_netfilter\n' | sudo tee /etc/modules-load.d/k8s.conf
sudo modprobe overlay
sudo modprobe br_netfilter

echo "[3/5] 커널 설정 (ip_forward)"
printf 'net.bridge.bridge-nf-call-iptables=1\nnet.bridge.bridge-nf-call-ip6tables=1\nnet.ipv4.ip_forward=1\n' | sudo tee /etc/sysctl.d/k8s.conf
sudo sysctl --system

echo "[4/5] containerd 설치 + SystemdCgroup"
sudo apt-get update
sudo apt-get install -y containerd apt-transport-https ca-certificates curl gpg
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml > /dev/null
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd

echo "[5/5] kubelet · kubeadm · kubectl v1.37"
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.37/deb/Release.key | sudo gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.37/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

echo "=== 확인 ==="
grep SystemdCgroup /etc/containerd/config.toml   # SystemdCgroup = true 여야 함
containerd --version
kubeadm version -o short