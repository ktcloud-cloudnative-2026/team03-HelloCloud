# deploy

Helm 차트와 values, Argo CD 앱, CI 서버. `main`에 머지하면 Argo CD가 배포합니다.

```
deploy/
  cluster/           손 작업 절차: kubeadm, Calico, Argo CD
  argocd/            Application (root.yaml, platform/, data/, services/)
  charts/            자체 차트: spring-service(서비스 공용), mysql
  values/<앱>/       values.yaml, values-dev.yaml, values-prod.yaml
  manifests/         Gateway, Certificate, MetalLB IP 풀 등
  ci/                Jenkins VM: docker-compose, JCasC
  scripts/           validate.sh
```
