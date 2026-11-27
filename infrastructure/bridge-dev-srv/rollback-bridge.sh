#!/usr/bin/env bash
# Откат установки Bridge на dev-srv БЕЗ удаления: jar переименовывается в TwoMCBridge-0.1.0.jar.disabled-<время>, затем restart.
# config.yml и bridge-key.txt остаются на месте. Запуск: run-on-vds.sh script rollback-bridge.sh --dry-run|--yes
set -uo pipefail
trap ptero_cleanup EXIT
MODE=""
for a in "$@"; do case "$a" in --dry-run) MODE=dry ;; --yes) MODE=yes ;; *) echo "допустимо --dry-run | --yes" >&2; exit 2 ;; esac; done
[[ -n "$MODE" ]] || { echo "Укажите --dry-run или --yes."; exit 2; }
if [[ "$MODE" == yes ]]; then PTERO_ALLOW_WRITE=1; else PTERO_ALLOW_WRITE=0; fi
export PTERO_ALLOW_WRITE
ptero_init || exit 1
ptero_status || exit 1
if ! ptero_files_list /plugins | grep -qxF -- '- TwoMCBridge-0.1.0.jar'; then echo "TwoMCBridge-0.1.0.jar в /plugins нет: откатывать нечего"; exit 0; fi
new="TwoMCBridge-0.1.0.jar.disabled-$(date -u +%Y%m%dT%H%M%SZ)"
if [[ "$MODE" == dry ]]; then echo "DRY-RUN: переименовал бы TwoMCBridge-0.1.0.jar -> $new и выполнил restart"; exit 0; fi
ptero_rename /plugins TwoMCBridge-0.1.0.jar "$new" || { echo "переименование не удалось (HTTP $PTERO_HTTP)"; exit 1; }
echo "jar переименован: $new"
ptero_power restart || { echo "restart не принят (HTTP $PTERO_HTTP)"; exit 1; }
for _ in $(seq 1 12); do sleep 10; st="$(ptero_state)"; [[ -n "$st" && "$st" != running ]] && break; done
for _ in $(seq 1 36); do sleep 10; [[ "$(ptero_state)" == running ]] && { echo "сервер: running"; exit 0; }; done
echo "сервер не вернулся в running за 360 с: смотрите консоль в панели"; exit 1
