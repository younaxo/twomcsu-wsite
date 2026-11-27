#!/usr/bin/env bash
# ЛОКАЛЬНО: запустить скрипт из этого каталога на VDS (ptero.sh подключается автоматически), через общий lock и ssh-обёртку раннера.
#   run-on-vds.sh stage <локальный-jar>          положить JAR и шаблон config.yml в ~/.twomc-inbox на VDS (панель и стенд не трогает)
#   run-on-vds.sh install [--dry-run|--yes]      install-bridge.sh на VDS (без флагов ничего не меняет)
#   run-on-vds.sh script <имя.sh> [арг...]       любой скрипт этого каталога (для диагностики, только чтение)
# Код 255 = сбой SSH: НЕ повторять подряд. Аргументы проверяет vds_ssh_script ([A-Za-z0-9._:/=,@+-]).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$(cd "$HERE/../vds-runner" && pwd)"
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$RUNNER/lib/vds-ssh.sh"
STAGE_FILE=""
trap 'rm -f -- "$STAGE_FILE"; vds_exit_cleanup' EXIT

bundle() { # bundle <скрипт>: ptero.sh + скрипт (без shebang) одним файлом
  STAGE_FILE="$(mktemp "${TMPDIR:-/tmp}/bridge-dev-run.XXXXXX")"
  { cat "$HERE/ptero.sh"; echo; grep -v "^#!" "$HERE/stand-lib.sh"; echo; grep -v "^#!" "$HERE/$1"; } > "$STAGE_FILE"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  stage)
    jar="${1:?укажите локальный jar}"
    [[ -f "$jar" ]] || { echo "Нет файла $jar" >&2; exit 2; }
    sha="$(sha256sum "$jar" | cut -d' ' -f1)"
    vds_put_inbox "$jar" TwoMCBridge.jar
    vds_put_inbox "$HERE/config.yml.tpl" bridge-config.yml.tpl
    echo "staged: TwoMCBridge.jar sha256=$sha, bridge-config.yml.tpl"
    ;;
  install)
    bundle install-bridge.sh
    vds_ssh_script "$STAGE_FILE" "$@"
    ;;
  script)
    name="${1:?имя скрипта}"; shift
    [[ "$name" =~ ^[A-Za-z0-9._-]+\.sh$ && -f "$HERE/$name" ]] || { echo "Нет скрипта $name" >&2; exit 2; }
    bundle "$name"
    vds_ssh_script "$STAGE_FILE" "$@"
    ;;
  *) sed -n '2,7p' "${BASH_SOURCE[0]}" >&2; exit 2 ;;
esac
