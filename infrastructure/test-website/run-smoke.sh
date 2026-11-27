#!/usr/bin/env bash
# ЛОКАЛЬНО: выполнить дымовую проверку стенда одним SSH-сеансом (под общей блокировкой VDS). Скрипты едут по stdin.
#   infrastructure/test-website/run-smoke.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/smoke.mjs\" <<'SMOKE_MJS_EOF'"
  cat "$HERE/smoke.mjs"
  echo 'SMOKE_MJS_EOF'
  echo "cat > \"\$d/smoke.sh\" <<'SMOKE_SH_EOF'"
  cat "$HERE/smoke.sh"
  echo 'SMOKE_SH_EOF'
  echo 'SMOKE_MJS="$d/smoke.mjs" bash "$d/smoke.sh"'
} > "$STAGE_TMP/remote.sh"
vds_ssh_script "$STAGE_TMP/remote.sh"
