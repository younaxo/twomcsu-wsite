#!/usr/bin/env bash
# ЛОКАЛЬНО: выставить флаги стенда (allowlist из stand-flags.defaults) одним SSH-сеансом (под общей блокировкой VDS). Скрипты едут по stdin.
#   infrastructure/test-website/run-stand-flags.sh [--dry-run|--apply]     (по умолчанию --dry-run)
# Запись на сервер и пересоздание api происходят только с --apply (владелец/Platform, после слияния и релиза). Секреты не печатаются.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:---dry-run}"
[[ "$mode" == "--dry-run" || "$mode" == "--apply" ]] || { echo "Использование: run-stand-flags.sh [--dry-run|--apply]" >&2; exit 2; }
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/stand-flags.defaults\" <<'FLAGS_DEFAULTS_EOF'"
  cat "$HERE/stand-flags.defaults"
  echo 'FLAGS_DEFAULTS_EOF'
  echo "cat > \"\$d/stand-flags.sh\" <<'STAND_FLAGS_SH_EOF'"
  cat "$HERE/stand-flags.sh"
  echo 'STAND_FLAGS_SH_EOF'
  echo 'bash "$d/stand-flags.sh" "$@"'
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh" "$mode"
