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
# Allowlist build-arg для web (ТОЛЬКО публичные тестовые значения, не секреты; web.Dockerfile требует NEXT_PUBLIC_TURNSTILE_SITE_KEY).
# Значение можно переопределить переменной окружения worker-а с тем же именем (строгая проверка формата); неизвестные имена не передаются.
# Аргумент передаётся, только если он объявлен в Dockerfile (ARG), иначе docker печатает предупреждение о неиспользованном build-arg.
webargs=()
for kv in \
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA" \
  "NEXT_PUBLIC_API_URL=https://runner-build.invalid/api" \
  "NEXT_PUBLIC_SITE_URL=https://runner-build.invalid"; do
  k="${kv%%=*}"; v="${!k:-${kv#*=}}"
  [[ "$v" =~ ^[A-Za-z0-9._:/@+-]{1,200}$ ]] || { echo "docker-build: недопустимое значение build-arg $k" >&2; exit 2; }
  grep -qE "^ARG $k(=|$)" "$src/infrastructure/web.Dockerfile" && webargs+=(--build-arg "$k=$v")
done
for app in api web; do
  tag="twomcr-$lid-$app"
  echo "##### docker-build $app (тег $tag)"
  extra=(); [[ "$app" == web ]] && extra=("${webargs[@]}")
  nice -n 15 docker build ${extra[@]+"${extra[@]}"} --cpu-shares "$CPU_SHARES" --memory "$WEB_BUILD_MEM" --memory-swap "$WEB_BUILD_MEM" \
    -f "$src/infrastructure/$app.Dockerfile" -t "$tag" --label "twomc-runner-job=$id" "$src" || rc=1
  docker image inspect "$tag" --format "image-$app: {{.Size}} bytes" 2>/dev/null || true
  docker rmi -f "$tag" >/dev/null 2>&1 || true
done
exit $rc
