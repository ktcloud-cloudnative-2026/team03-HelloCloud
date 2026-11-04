#!/usr/bin/env bash
# 인프라 설정 검사: yamllint → Helm 차트 → argocd/, manifests/ 스키마 검사
# 사용법: deploy/scripts/validate.sh [deploy_dir]   (기본값: 이 스크립트 기준 상위 deploy/)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
YAMLLINT_CONFIG="$(dirname "$SCRIPT_DIR")/.yamllint.yaml"
KUBECONFORM=(kubeconform -strict -ignore-missing-schemas -summary)

echo "== 검사 대상: $DEPLOY_DIR"

# 1) yamllint: *.yaml, *.yml 전체 (Helm templates/ 제외)
mapfile -t yaml_files < <(find "$DEPLOY_DIR" -type f \( -name '*.yaml' -o -name '*.yml' \) -not -path '*/templates/*' | sort)
if (( ${#yaml_files[@]} > 0 )); then
  echo "== yamllint: ${#yaml_files[@]}개"
  yamllint -c "$YAMLLINT_CONFIG" "${yaml_files[@]}"
else
  echo "== yamllint: 대상 없음, 건너뜀"
fi

# 2) Helm 차트: charts/*/ 마다 helm lint, helm template | kubeconform
if [[ -d "$DEPLOY_DIR/charts" ]]; then
  for chart in "$DEPLOY_DIR"/charts/*/; do
    [[ -f "$chart/Chart.yaml" ]] || continue
    echo "== helm: $chart"
    helm lint "$chart"
    helm template "$chart" | "${KUBECONFORM[@]}"
  done
else
  echo "== helm: charts/ 없음, 건너뜀"
fi

# 3) argocd/, manifests/: kubeconform
for dir in argocd manifests; do
  if [[ -d "$DEPLOY_DIR/$dir" ]] && find "$DEPLOY_DIR/$dir" -type f \( -name '*.yaml' -o -name '*.yml' \) | grep -q .; then
    echo "== kubeconform: $dir/"
    "${KUBECONFORM[@]}" "$DEPLOY_DIR/$dir"
  else
    echo "== kubeconform: $dir/ 없음, 건너뜀"
  fi
done

echo "== 검사 통과"
