#!/usr/bin/env bash
# Рабочий процесс очереди (на СЕРВЕРЕ). Один экземпляр (flock). Берёт самое старое задание из queue/, выполняет, кладёт в done/.
# Запускается из enqueue.sh в фоне (setsid nohup, nice/ionice). Завершается, когда очередь пуста. cleanup.sh выполняется под тем же flock.
# Сбойное задание (не удалось запустить/разобрать) уходит в failed/ и больше не повторяется: worker не зацикливается.
set -uo pipefail
RUNNER_ROOT="${RUNNER_ROOT:-/srv/twomc-runner}"
LOCK="$RUNNER_ROOT/worker.lock"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RUNNER_ROOT" || exit 1
mkdir -p "$RUNNER_ROOT/failed"

run_job() {
  local id="$1" dir="$RUNNER_ROOT/running/$1" start end rc
  mv "$RUNNER_ROOT/queue/$id" "$dir" || return 1
  # shellcheck disable=SC1091
  source "$dir/meta.env"            # JOB, REF_DESC, OPS_HASH, CREATED
  [[ "${JOB:-}" =~ ^(unit|api-e2e|web-build|docker-build)$ && "${OPS_HASH:-}" =~ ^[0-9a-f]{12}$ ]] || { echo "worker: недопустимые JOB/OPS_HASH в $id" >&2; return 2; }
  local ops="$RUNNER_ROOT/ops/$OPS_HASH"
  [[ -f "$ops/jobs/$JOB.sh" && -f "$ops/lib.sh" ]] || { echo "worker: нет скриптов ops/$OPS_HASH для $id" >&2; return 3; }
  mkdir -p "$dir/src"
  tar -xzf "$dir/code.tar.gz" -C "$dir/src" || { echo "worker: не удалось распаковать code.tar.gz ($id)" >&2; return 4; }
  : > "$dir/job.log"
  start="$(date +%s)"
  (
    echo "== job=$JOB id=$id ref=$REF_DESC started=$(date -u +%FT%TZ)"
    # shellcheck disable=SC1091
    source "$ops/lib.sh"
    echo "== limits: cpus=$JOB_CPUS mem=$JOB_MEM cpu-shares=$CPU_SHARES nice=15 timeout=${JOB_TIMEOUT_SEC}s"
    export RUNNER_ROOT
    jrc=0
    # 9>&-: дочерние процессы (docker и др.) не наследуют flock worker-а
    timeout --kill-after=30 "$JOB_TIMEOUT_SEC" bash "$ops/jobs/$JOB.sh" "$id" "$dir/src" "$dir" 9>&- || jrc=$?
    docker_cleanup_job "$id"
    echo "== exit=$jrc"
  ) >> "$dir/job.log" 2>&1
  rc="$(grep -E '^== exit=' "$dir/job.log" | tail -1 | sed 's/^== exit=//')"; rc="${rc:-99}"
  end="$(date +%s)"
  {
    echo "ID=$id"; echo "JOB=$JOB"; echo "REF=$REF_DESC"; echo "EXIT=$rc"
    echo "STARTED=$start"; echo "FINISHED=$end"; echo "DURATION_SEC=$(( end - start ))"
  } > "$dir/result.env"
  {
    echo "job=$JOB id=$id ref=$REF_DESC exit=$rc duration=$(( end - start ))s"
    # shellcheck disable=SC1091
    source "$ops/lib.sh"; summarize_log "$dir/job.log"
  } > "$dir/summary.txt"
  rm -rf "$dir/src" "$dir/code.tar.gz" "$dir/inner.sh"    # исходники после прогона не храним
  mv "$dir" "$RUNNER_ROOT/done/$id"
}

# Сбой запуска: завершить задание как failed (exit 97) в done/ (клиент увидит итог), либо убрать из queue/ в failed/. Исходники удаляются.
fail_job() {
  local id="$1" why="$2" d
  if [[ -d "$RUNNER_ROOT/running/$id" ]]; then
    d="$RUNNER_ROOT/running/$id"
    { echo "ID=$id"; echo "JOB=unknown"; echo "REF=unknown"; echo "EXIT=97"; echo "DURATION_SEC=0"; } > "$d/result.env"
    echo "job failed to start: $why (id=$id exit=97)" > "$d/summary.txt"; echo "== exit=97 ($why)" >> "$d/job.log"
    rm -rf "$d/src" "$d/code.tar.gz"
    mv "$d" "$RUNNER_ROOT/done/$id" && return 0
  fi
  if [[ -d "$RUNNER_ROOT/queue/$id" ]]; then mv "$RUNNER_ROOT/queue/$id" "$RUNNER_ROOT/failed/$id" && return 0; fi
  [[ ! -d "$RUNNER_ROOT/queue/$id" ]]
}

while true; do
  exec 9>"$LOCK"
  flock -n 9 || exit 0               # другой worker уже работает
  while :; do
    next="$(ls -1 "$RUNNER_ROOT/queue" 2>/dev/null | grep -E '^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$' | sort | head -1)"
    [[ -n "$next" ]] || break
    ( run_job "$next" ); jrc=$?        # подоболочка: сбой/set -u внутри не убивает worker
    if (( jrc != 0 )); then
      fail_job "$next" "код $jrc" || { echo "worker: не удалось убрать сбойное задание $next, остановка" >&2; exit 1; }
    elif [[ -d "$RUNNER_ROOT/queue/$next" ]]; then
      fail_job "$next" "осталось в queue" || exit 1
    fi
  done
  # cleanup под flock: новый worker, запущенный enqueue во время очистки, сразу выйдет, поэтому очередь перепроверяется после освобождения.
  RUNNER_LOCK_HELD=1 bash "$HERE/cleanup.sh" || true
  flock -u 9; exec 9>&-
  if ls -1 "$RUNNER_ROOT/queue" 2>/dev/null | grep -qE '^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$'; then continue; fi
  exit 0
done
