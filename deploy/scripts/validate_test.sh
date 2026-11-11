#!/usr/bin/env bash
# validate.sh 테스트: 임시 폴더에 입력을 만들고 종료 코드를 확인한다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE="$SCRIPT_DIR/validate.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILED=0

# 사용법: check <케이스 이름> <기대: zero|nonzero>
check() {
  local name="$1" expect="$2" code
  bash "$VALIDATE" "$TMP/$name" > "$TMP/$name.log" 2>&1
  code=$?
  if { [[ "$expect" == zero && $code -eq 0 ]] || [[ "$expect" == nonzero && $code -ne 0 ]]; }; then
    echo "PASS $name"
  else
    echo "FAIL $name (종료 코드 $code, 기대 $expect)"
    sed 's/^/    /' "$TMP/$name.log"
    FAILED=1
  fi
}

# 1. 빈 폴더 → 통과
mkdir -p "$TMP/empty_deploy_passes"

# 2. 문법이 깨진 a.yaml → 실패
mkdir -p "$TMP/broken_yaml_fails"
printf 'a: [1, 2\n' > "$TMP/broken_yaml_fails/a.yaml"

# 3. 문법이 깨진 a.yml → 실패
mkdir -p "$TMP/broken_yml_extension_fails"
printf 'a: [1, 2\n' > "$TMP/broken_yml_extension_fails/a.yml"

# 4. manifests/에 replicas가 문자열인 Deployment → 실패
mkdir -p "$TMP/invalid_deployment_fails/manifests"
cat > "$TMP/invalid_deployment_fails/manifests/deploy.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: x
  namespace: x
spec:
  replicas: "many"
  selector:
    matchLabels:
      app: x
  template:
    metadata:
      labels:
        app: x
    spec:
      containers:
        - name: x
          image: nginx:1.29
EOF

# 5. charts/x/에 템플릿 문법 오류 → 실패
mkdir -p "$TMP/broken_chart_fails/charts/x/templates"
cat > "$TMP/broken_chart_fails/charts/x/Chart.yaml" <<'EOF'
apiVersion: v2
name: x
version: 0.1.0
EOF
printf 'value: {{ .Values.foo \n' > "$TMP/broken_chart_fails/charts/x/templates/cm.yaml"

# 6. argocd/에 정상 Application → 통과
mkdir -p "$TMP/argocd_application_passes/argocd"
cat > "$TMP/argocd_application_passes/argocd/app.yaml" <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: smoke-test
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/ktcloud-cloudnative-2026/team03-HelloCloud
    targetRevision: main
    path: deploy/manifests/smoke-test
  destination:
    server: https://kubernetes.default.svc
    namespace: smoke-test
EOF

check empty_deploy_passes zero
check broken_yaml_fails nonzero
check broken_yml_extension_fails nonzero
check invalid_deployment_fails nonzero
check broken_chart_fails nonzero
check argocd_application_passes zero

exit $FAILED
