#!/usr/bin/env bash
# ЛОКАЛЬНО: симулятор мок-оплаты стенда одним SSH-сеансом (под общей блокировкой VDS). Скрипт едет по stdin и выполняется на сервере.
#   infrastructure/test-website/run-mock-pay.sh <orderId|orderNumber|paymentId> [paid|failed] [--dry-run]
# Секрет вебхука читается только на сервере из stand.env и не печатается; печатается HTTP-код и accepted/reason.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ref="${1:-}"
action="${2:-paid}"
extra="${3:-}"
if [[ "$action" == "--dry-run" ]]; then action="paid"; extra="--dry-run"; fi
[[ "$ref" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || { echo "Использование: run-mock-pay.sh <orderId|orderNumber|paymentId> [paid|failed] [--dry-run]" >&2; exit 2; }
[[ "$action" == "paid" || "$action" == "failed" ]] || { echo "Статус: paid или failed (refunded: админка заказа, см. runbook)" >&2; exit 2; }
[[ -z "$extra" || "$extra" == "--dry-run" ]] || { echo "Неизвестный аргумент: $extra" >&2; exit 2; }
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
vds_stage_new
{
  echo 'set -euo pipefail; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT'
  echo "cat > \"\$d/mock-pay.sh\" <<'MOCK_PAY_SH_EOF'"
  cat "$HERE/mock-pay.sh"
  echo 'MOCK_PAY_SH_EOF'
  echo 'bash "$d/mock-pay.sh" "$@"'
} > "$STAGE_TMP/remote.sh"
if [[ -n "$extra" ]]; then
  vds_ssh_script "$STAGE_TMP/remote.sh" "$ref" "$action" "$extra"
else
  vds_ssh_script "$STAGE_TMP/remote.sh" "$ref" "$action"
fi
