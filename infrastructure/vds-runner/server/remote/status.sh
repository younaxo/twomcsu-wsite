#!/usr/bin/env bash
# СЕРВЕР (через `ssh ... 'bash -s -- <id>' < status.sh`): состояние задания. Вывод: STATE=<queued|running|done|orphaned|missing> и детали.
# Если очередь не пуста, а worker не работает (сбой/перезагрузка) - перезапускает worker; зависшее running помечает failed (exit 99).
set -uo pipefail
ID="${1:?id}"
[[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "STATE=invalid"; exit 2; }
ROOT=/srv/twomc-runner
worker_alive() { ! flock -n "$ROOT/worker.lock" true 2>/dev/null; }   # flock не взялся -> worker держит блокировку

if [[ -d "$ROOT/done/$ID" ]]; then
  echo "STATE=done"; cat "$ROOT/done/$ID/result.env"
elif [[ -d "$ROOT/running/$ID" ]]; then
  if worker_alive; then
    echo "STATE=running"; echo "LOG_LINES=$(wc -l < "$ROOT/running/$ID/job.log")"
    echo "LAST=$(tail -n 1 "$ROOT/running/$ID/job.log" | cut -c1-200)"
  else
    echo "STATE=orphaned"
    d="$ROOT/running/$ID"
    { echo "ID=$ID"; echo "JOB=unknown"; echo "REF=unknown"; echo "EXIT=99"; echo "DURATION_SEC=0"; } > "$d/result.env"
    echo "job lost: worker not running (id=$ID exit=99)" > "$d/summary.txt"; echo "== exit=99 (worker потерян)" >> "$d/job.log"
    rm -rf "$d/src"; mv "$d" "$ROOT/done/$ID"
  fi
elif [[ -d "$ROOT/queue/$ID" ]]; then
  pos="$(ls -1 "$ROOT/queue" | grep -E '^[0-9]{8}T[0-9]{6}Z-' | sort | grep -nx "$ID" | cut -d: -f1)"
  echo "STATE=queued"; echo "POSITION=$pos"
  if ! worker_alive; then
    h="$(ls -1t "$ROOT/ops" | head -1)"
    setsid nohup nice -n 15 ionice -c3 bash "$ROOT/ops/$h/worker.sh" >> "$ROOT/worker.log" 2>&1 < /dev/null &
    disown || true
    echo "NOTE=worker перезапущен"
  fi
else
  echo "STATE=missing"
fi
