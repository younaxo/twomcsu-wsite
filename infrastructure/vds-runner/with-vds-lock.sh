#!/usr/bin/env bash
# Запуск ЛЮБОЙ команды под общей локальной блокировкой SSH к VDS (для сторонних скриптов):
#   infrastructure/vds-runner/with-vds-lock.sh infrastructure/test-website/release.sh origin/main --seed
# Внутри команды VDS_LOCK_HELD=1, так что скрипты на хелпере lib/vds-lock.sh повторно блокировку не берут.
# Предупреждение: блокировка держится на всё время команды; для долгих сценариев предпочтительнее источать
# lib/vds-lock.sh и оборачивать только отдельные ssh/scp через vds_locked.
set -euo pipefail
[[ $# -ge 1 ]] || { echo "Использование: with-vds-lock.sh <команда> [аргументы...]" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vds-lock.sh
source "$HERE/lib/vds-lock.sh"
trap vds_lock_release EXIT
vds_locked "$@"
