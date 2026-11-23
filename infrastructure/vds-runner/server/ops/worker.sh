#!/usr/bin/env bash
# Рабочий процесс очереди (на СЕРВЕРЕ). Один экземпляр (flock). Берёт самое старое задание из queue/, выполняет, кладёт в done/.
# Запускается из enqueue.sh в фоне (setsid nohup, nice/ionice). Завершается, когда очередь пуста.
set -uo pipefail
RUNNER_ROOT="${RUNNER_ROOT:-/srv/twomc-runner}"
LOCK="$RUNNER_ROOT/worker.lock"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RUNNER_ROOT" || exit 1

run_job() {
  local id="$1" dir="$RUNNER_ROOT/running/$1" start end rc
  mv "$RUNNER_ROOT/queue/$id" "$dir"
  # shellcheck disable=SC1091
  source "$dir/meta.env"            # JOB, REF_DESC, OPS_HASH, CREATED
  local ops="$RUNNER_ROOT/ops/$OPS_HASH"
  mkdir -p "$dir/src"
  tar -xzf "$dir/code.tar.gz" -C "$dir/src"
  : > "$dir/job.log"
  start="$(date +%s)"
  (
    echo "== job=$JOB id=$id ref=$REF_DESC started=$(date -u +%FT%TZ)"
    # shellcheck disable=SC1091
    source "$ops/lib.sh"
    echo "== limits: cpus=$JOB_CPUS mem=$JOB_MEM cpu-shares=$CPU_SHARES nice=15 timeout=${JOB_TIMEOUT_SEC}s"
    export RUNNER_ROOT
    jrc=0
    timeout --kill-after=30 "$JOB_TIMEOUT_SEC" bash "$ops/jobs/$JOB.sh" "$id" "$dir/src" "$dir" || jrc=$?
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

while true; do
  exec 9>"$LOCK"
  flock -n 9 || exit 0               # другой worker уже работает
  while :; do
    next="$(ls -1 "$RUNNER_ROOT/queue" 2>/dev/null | grep -E '^[0-9]{8}T[0-9]{6}Z-' | sort | head -1)"
    [[ -n "$next" ]] || break
    run_job "$next"
  done
  # Освободить блокировку и перепроверить очередь (гонка с enqueue, чей worker не смог взять flock).
  flock -u 9; exec 9>&-
  if ls -1 "$RUNNER_ROOT/queue" 2>/dev/null | grep -qE '^[0-9]{8}T[0-9]{6}Z-'; then continue; fi
  bash "$HERE/cleanup.sh" || true
  exit 0
done
