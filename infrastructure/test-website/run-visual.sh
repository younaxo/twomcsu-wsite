#!/usr/bin/env bash
# ЛОКАЛЬНО: визуальная проверка стенда одним SSH-сеансом (под общей блокировкой VDS). Скрипты едут по stdin.
#   infrastructure/test-website/run-visual.sh [ПАПКА_НА_СЕРВЕРЕ]   (по умолчанию /srv/twomc-stand/qa/visual-<дата сервера>)
# Результаты (скриншоты и results.json) остаются на сервере; забрать локально: run-visual.sh --fetch <ПАПКА_НА_СЕРВЕРЕ> <локальный-каталог>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
if [[ "${1:-}" == "--fetch" ]]; then
  remote="${2:?удалённая папка}"; dest="${3:?локальный каталог}"
  [[ "$remote" =~ ^/srv/twomc-stand/qa/[A-Za-z0-9][A-Za-z0-9._-]*$ && "$remote" != *..* ]] || { echo "Папка только /srv/twomc-stand/qa/<имя>" >&2; exit 2; }
  ( umask 077; mkdir -p "$dest" )
  printf '%s\n' "set -euo pipefail; tar -C '$remote' -cf - ." > "$STAGE_TMP/fetch.sh"
  vds_ssh_script "$STAGE_TMP/fetch.sh" | tar -C "$dest" --no-same-owner --no-same-permissions -xf -
  exit 0
fi
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  if [[ -n "${1:-}" ]]; then
    [[ "$1" =~ ^/srv/twomc-stand/qa/[A-Za-z0-9][A-Za-z0-9._-]*$ && "$1" != *..* ]] || { echo "Папка только /srv/twomc-stand/qa/<имя>" >&2; exit 2; }
    echo "export OUT_DIR='$1'"
  fi
  echo "cat > \"\$d/mask.mjs\" <<'MASK_MJS_EOF'"
  cat "$HERE/mask.mjs"
  echo 'MASK_MJS_EOF'
  echo "cat > \"\$d/visual-check.mjs\" <<'VISUAL_MJS_EOF'"
  cat "$HERE/visual-check.mjs"
  echo 'VISUAL_MJS_EOF'
  echo "cat > \"\$d/visual-check.sh\" <<'VISUAL_SH_EOF'"
  cat "$HERE/visual-check.sh"
  echo 'VISUAL_SH_EOF'
  echo 'VISUAL_MJS="$d/visual-check.mjs" bash "$d/visual-check.sh"'
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh"
