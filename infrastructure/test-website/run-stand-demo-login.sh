#!/usr/bin/env bash
# ЛОКАЛЬНО: задать пароль демо-игроку стенда (demo_ember) одним SSH-сеансом (под общей блокировкой VDS). Скрипты едут по stdin.
#   infrastructure/test-website/run-stand-demo-login.sh [--dry-run|--apply]     (по умолчанию --dry-run)
# Запись в БД и в файл учёток на сервере происходят только с --apply (владелец/Platform). Пароль не печатается и не покидает сервер.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:---dry-run}"
[[ "$mode" == "--dry-run" || "$mode" == "--apply" ]] || { echo "Использование: run-stand-demo-login.sh [--dry-run|--apply]" >&2; exit 2; }
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/stand-demo-login.stand.ts\" <<'DEMO_LOGIN_TS_EOF'"
  cat "$HERE/stand-demo-login.stand.ts"
  echo 'DEMO_LOGIN_TS_EOF'
  echo "cat > \"\$d/stand-demo-login.sh\" <<'DEMO_LOGIN_SH_EOF'"
  cat "$HERE/stand-demo-login.sh"
  echo 'DEMO_LOGIN_SH_EOF'
  echo "STAND_DEMO_TS=\"\$d/stand-demo-login.stand.ts\" bash \"\$d/stand-demo-login.sh\" $mode"
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh"
