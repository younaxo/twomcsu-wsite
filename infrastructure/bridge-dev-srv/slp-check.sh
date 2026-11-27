#!/usr/bin/env bash
# Только чтение: число игроков dev-srv через Server List Ping (адрес и порт - основная аллокация сервера из SERVER_UUID).
# Запуск: run-on-vds.sh script slp-check.sh. Печатает «players=N max=M version=V». Панель: один GET /network/allocations. Код 0 - успех, 1 - SLP не ответил.
export LC_ALL=C
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
trap ptero_cleanup EXIT
export PTERO_ALLOW_WRITE=0
ptero_init || exit 1
ptero_slp || { echo "SLP: нет ответа"; exit 1; }
