#!/usr/bin/env bash
# ЛОКАЛЬНО: создать (если нет) мастер-секрет Bridge стенда и записать его в stand.env одним SSH-сеансом (под общей блокировкой VDS). Скрипт едет по stdin.
#   infrastructure/test-website/run-stand-bridge-secret.sh [--dry-run|--apply]     (по умолчанию --dry-run)
# Запись на сервер и пересоздание api происходят только с --apply (владелец/Platform, после слияния и релиза). Секреты не печатаются.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:---dry-run}"
[[ "$mode" == "--dry-run" || "$mode" == "--apply" ]] || { echo "Использование: run-stand-bridge-secret.sh [--dry-run|--apply]" >&2; exit 2; }
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/stand-bridge-secret.sh\" <<'STAND_BRIDGE_SECRET_SH_EOF'"
  cat "$HERE/stand-bridge-secret.sh"
  echo 'STAND_BRIDGE_SECRET_SH_EOF'
  echo 'bash "$d/stand-bridge-secret.sh" "$@"'
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh" "$mode"
