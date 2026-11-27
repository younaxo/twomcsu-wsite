#!/usr/bin/env bash
# ЛОКАЛЬНО: ротация 2FA админа стенда одним SSH-сеансом (под общей блокировкой VDS). Скрипты едут по stdin.
#   infrastructure/test-website/run-rotate-2fa.sh --dry-run | --yes
# Запускает ТОЛЬКО владелец (docs/runbooks/test-website-stand.md, «Ротация 2FA стенда — инструкция владельцу»).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${1:-}" in --dry-run|--yes) ARG="$1" ;; *) echo "Использование: $0 --dry-run | --yes" >&2; exit 2 ;; esac
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/rotate-2fa.stand.ts\" <<'ROTATE_TS_EOF'"
  cat "$HERE/rotate-2fa.stand.ts"
  echo 'ROTATE_TS_EOF'
  echo "cat > \"\$d/rotate-2fa.sh\" <<'ROTATE_SH_EOF'"
  cat "$HERE/rotate-2fa.sh"
  echo 'ROTATE_SH_EOF'
  echo "ROTATE_2FA_TS=\"\$d/rotate-2fa.stand.ts\" bash \"\$d/rotate-2fa.sh\" $ARG"
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh"
