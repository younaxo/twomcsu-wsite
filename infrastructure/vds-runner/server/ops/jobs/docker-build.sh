#!/usr/bin/env bash
# Задание docker-build: сборка образов api и web из снимка кода (тег twomcr-<id>-*; после сборки образы удаляются).
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
rc=0
for app in api web; do
  echo "##### docker-build $app"
  nice -n 15 docker build --cpu-shares "$CPU_SHARES" --memory "$WEB_BUILD_MEM" --memory-swap "$WEB_BUILD_MEM" \
    -f "$src/infrastructure/$app.Dockerfile" -t "twomcr-$id-$app" --label "twomc-runner-job=$id" "$src" || rc=1
  docker image inspect "twomcr-$id-$app" --format "image-$app: {{.Size}} bytes" 2>/dev/null || true
  docker rmi -f "twomcr-$id-$app" >/dev/null 2>&1 || true
done
exit $rc
