#!/usr/bin/env bash
# Повторяемая выкладка стенда ОДНОЙ командой (ЛОКАЛЬНО):
#   infrastructure/test-website/release.sh [ref] [--seed]
# ref по умолчанию origin/main. Шаги: git fetch+archive -> выгрузка -> на сервере deploy-stand.sh (build, migrate deploy на БД
# стенда, api+web, health) -> [seed-demo.sh при --seed] -> verify.sh, всё в ОДНОМ SSH-сеансе. Docker локально не нужен.
# Переменные: STAND_HOST, STAND_USER, STAND_SSH_KEY, STAND_ROOT (см. push-release.sh).
set -euo pipefail
REF="origin/main"; SEED=0
for a in "$@"; do
  case "$a" in
    --seed) SEED=1 ;;
    -*) echo "Неизвестный флаг: $a" >&2; exit 2 ;;
    *) REF="$a" ;;
  esac
done
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$SEED" == 1 ]]; then export STAND_ACTIONS="deploy,seed,verify"; else export STAND_ACTIONS="deploy,verify"; fi
exec "$HERE/push-release.sh" "$REF"
