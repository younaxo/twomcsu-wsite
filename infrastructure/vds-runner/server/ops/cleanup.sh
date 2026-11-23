#!/usr/bin/env bash
# Очистка раннера (на СЕРВЕРЕ): done/ и failed/ - не старше RUNNER_KEEP_DAYS (3) и не больше RUNNER_KEEP_COUNT (30);
# ops/ - старше 14 дней, кроме трёх свежих; контейнеры/сети раннера старше 2 ч (зависшие);
# pnpm store при размере > 15 ГБ сбрасывается целиком (восстановится при следующем install).
# Выполняется под flock worker.lock: из worker.sh (RUNNER_LOCK_HELD=1, блокировка уже у worker-а) или отдельно (берёт блокировку сам; занято - выходит).
set -uo pipefail
RUNNER_ROOT="${RUNNER_ROOT:-/srv/twomc-runner}"
KEEP_DAYS="${RUNNER_KEEP_DAYS:-3}"; KEEP_COUNT="${RUNNER_KEEP_COUNT:-30}"
cd "$RUNNER_ROOT" || exit 0
if [[ "${RUNNER_LOCK_HELD:-}" != 1 ]]; then
  exec 9>"$RUNNER_ROOT/worker.lock"
  flock -n 9 || { echo "cleanup: worker занят, очистка пропущена"; exit 0; }
fi
for dd in done failed; do
  find "$dd" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null
  ls -1 "$dd" 2>/dev/null | sort | head -n -"$KEEP_COUNT" | while read -r d; do rm -rf "${dd:?}/$d"; done
done
ls -1dt ops/*/ 2>/dev/null | tail -n +4 | while read -r d; do find "$d" -maxdepth 0 -mtime +14 -exec rm -rf {} +; done
# Зависшие контейнеры раннера (метка twomc-runner-job) старше 2 часов
docker ps -a --filter "label=twomc-runner-job" --format '{{.ID}} {{.CreatedAt}}' 2>/dev/null | while read -r cid rest; do
  ts="$(date -d "${rest% *}" +%s 2>/dev/null || echo 0)"
  if (( $(date +%s) - ts > 7200 )); then docker rm -f "$cid" >/dev/null 2>&1; fi
done
if [[ -z "$(docker ps -q --filter label=twomc-runner-job 2>/dev/null)" ]]; then
  docker network ls -q --filter "label=twomc-runner-job" 2>/dev/null | xargs -r docker network rm >/dev/null 2>&1
fi
if [[ -d cache/pnpm-store ]] && (( $(du -sm cache/pnpm-store 2>/dev/null | cut -f1) > 15360 )); then rm -rf cache/pnpm-store; fi
find "$RUNNER_ROOT" -maxdepth 1 -name 'worker.log' -size +5M -exec truncate -s 0 {} +
exit 0
