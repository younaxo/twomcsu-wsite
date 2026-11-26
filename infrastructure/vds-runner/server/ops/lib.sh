#!/usr/bin/env bash
# Общие функции раннера (на СЕРВЕРЕ). Подключается через source из worker.sh и jobs/*.sh.
RUNNER_ROOT="${RUNNER_ROOT:-/srv/twomc-runner}"
# Образы: зеркало ECR (как в CI) для node/redis; postgres:16-alpine уже есть на хосте (стенд).
NODE_IMAGE="${RUNNER_NODE_IMAGE:-public.ecr.aws/docker/library/node:20-bookworm}"
PG_IMAGE="${RUNNER_PG_IMAGE:-postgres:16-alpine}"
REDIS_IMAGE="${RUNNER_REDIS_IMAGE:-public.ecr.aws/docker/library/redis:7-alpine}"
# Лимиты: стенд (web+api+pg+redis) занимает ~2.8 ГБ и почти не грузит CPU; раннеру оставляем часть ядер и память.
JOB_CPUS="${RUNNER_JOB_CPUS:-4}"          # --cpus для контейнера node
JOB_MEM="${RUNNER_JOB_MEM:-7g}"           # --memory для контейнера node
WEB_BUILD_MEM="${RUNNER_WEB_BUILD_MEM:-8g}"
PG_MEM="${RUNNER_PG_MEM:-1g}"
REDIS_MEM="${RUNNER_REDIS_MEM:-256m}"
CPU_SHARES="${RUNNER_CPU_SHARES:-256}"    # вес CPU ниже стандартного 1024: при конкуренции стенд приоритетнее
JOB_TIMEOUT_SEC="${RUNNER_JOB_TIMEOUT_SEC:-2700}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Контейнеры/сеть задания помечаются меткой twomc-runner-job=<id>; уборка по метке.
docker_cleanup_job() {
  local id="$1" c
  c="$(docker ps -aq --filter "label=twomc-runner-job=$id" 2>/dev/null || true)"
  # shellcheck disable=SC2086
  [[ -z "$c" ]] || docker rm -f $c >/dev/null 2>&1 || true
  docker network ls -q --filter "label=twomc-runner-job=$id" 2>/dev/null | xargs -r docker network rm >/dev/null 2>&1 || true
}

# run_node <id> <src> <memory> <script-file> [docker-args...]  - выполняет script в контейнере node как uid хоста.
# Рабочий каталог /work (bind src); кеш pnpm store и corepack - в каталогах cache/ на хосте (общие для заданий).
run_node() {
  local id="$1" src="$2" mem="$3" script="$4"; shift 4
  mkdir -p "$RUNNER_ROOT/cache/pnpm-store" "$RUNNER_ROOT/cache/home" "$RUNNER_ROOT/cache/corepack"
  local netargs=()
  [[ -z "${JOB_NET:-}" ]] || netargs=(--network "$JOB_NET")
  docker run --rm --init \
    --name "twomcr-$id-node" --label "twomc-runner-job=$id" \
    --cpus "$JOB_CPUS" --memory "$mem" --memory-swap "$mem" --cpu-shares "$CPU_SHARES" --pids-limit 4096 \
    --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" "${netargs[@]}" \
    -e HOME=/home/runner -e COREPACK_HOME=/cache/corepack -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e CI=true -e NEXT_TELEMETRY_DISABLED=1 \
    -e npm_config_store_dir=/cache/pnpm-store -e PATH=/home/runner/bin:/usr/local/bin:/usr/bin:/bin \
    -v "$src:/work" -v "$RUNNER_ROOT/cache/pnpm-store:/cache/pnpm-store" -v "$RUNNER_ROOT/cache/home:/home/runner" \
    -v "$RUNNER_ROOT/cache/corepack:/cache/corepack" \
    -v "$script:/job.sh:ro" -w /work "$@" "$NODE_IMAGE" bash /job.sh
}

# Общая «шапка» внутри контейнера: pnpm через corepack (версия берётся из packageManager).
node_prelude() {
  cat <<'PRE'
set -uo pipefail
mkdir -p /home/runner/bin
corepack enable --install-directory /home/runner/bin
echo "pnpm $(pnpm --version) node $(node --version)"
PRE
}

# Извлечение статистики тестов из лога в сводку.
summarize_log() {
  local log="$1"
  grep -E '^(Test Suites|Tests|Snapshots|Time):|^ +(Test Files|Tests|Duration) +[0-9]|^##### ' "$log" || true
}
