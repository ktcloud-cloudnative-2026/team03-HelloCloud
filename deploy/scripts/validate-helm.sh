#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART="$DEPLOY_DIR/charts/spring-service"

# 실제 이미지 없이도 CI 종류에 관계없이 배포 설정을 검사합니다.
for environment in dev prod; do
  args=(
    --namespace "ideaconnection-$environment"
    -f "$DEPLOY_DIR/values/user-service/values.yaml"
    -f "$DEPLOY_DIR/values/user-service/values-$environment.yaml"
    --set-string image.repository=example.invalid/hellocloud/user-service
    --set-string image.tag=0000000
  )
  helm lint "$CHART" --strict "${args[@]}"
  helm template user-service "$CHART" "${args[@]}"
done

if helm template user-service "$CHART" >/dev/null 2>&1; then
  echo '오류: 이미지 주소·태그 없이 렌더링되었습니다.' >&2
  exit 1
fi

if helm template user-service "$CHART" \
  -f "$DEPLOY_DIR/values/user-service/values.yaml" \
  -f "$DEPLOY_DIR/values/user-service/values-dev.yaml" >/dev/null 2>&1; then
  echo '오류: 배포 이미지 태그 없이 렌더링되었습니다.' >&2
  exit 1
fi
