#!/usr/bin/env bash
# Задание docker-build: сборка образов api и web из снимка кода (тег twomcr-<id в нижнем регистре>-*; после сборки образы удаляются).
# docker требует нижний регистр в имени образа, а id содержит заглавные T и Z (<UTC>T...Z-...): тег строится из ${id,,}.
# Образы помечены меткой twomc-runner-job=<id>: если задание убито по таймауту, worker удаляет их по метке (docker_cleanup_job).
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
lid="${id,,}"
rc=0
for app in api web; do
  tag="twomcr-$lid-$app"
  echo "##### docker-build $app (тег $tag)"
  nice -n 15 docker build --cpu-shares "$CPU_SHARES" --memory "$WEB_BUILD_MEM" --memory-swap "$WEB_BUILD_MEM" \
    -f "$src/infrastructure/$app.Dockerfile" -t "$tag" --label "twomc-runner-job=$id" "$src" || rc=1
  docker image inspect "$tag" --format "image-$app: {{.Size}} bytes" 2>/dev/null || true
  docker rmi -f "$tag" >/dev/null 2>&1 || true
done
exit $rc
