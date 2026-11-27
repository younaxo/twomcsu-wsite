#!/usr/bin/env bash
# Только чтение: игроки и версия dev-srv через Server List Ping (адрес и порт - основная аллокация сервера из SERVER_UUID).
# Запуск: run-on-vds.sh script slp-check.sh. Печатает «players=N/M version=V» (V без §-кодов, пробелы как «_»).
# Панель: один GET /network/allocations. Код 0 - успех, 1 - SLP не ответил (причина по каждой сети - в stderr).
# Если version содержит «Тех. работы»/maintenance, сервер вероятно в режиме техработ/whitelist: см. docs/runbooks/bridge-dev-srv.md.
export LC_ALL=C
set -uo pipefail
if ! declare -F ptero_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/ptero.sh"; fi
trap ptero_cleanup EXIT
export PTERO_ALLOW_WRITE=0
ptero_init || exit 1
if s="$(ptero_slp)"; then
  # s = «players=N max=M version=V»
  n="${s#players=}"; n="${n%% *}"; m="${s#* max=}"; m="${m%% *}"; v="${s##* version=}"
  echo "players=$n/$m version=$v"
  if ptero_slp_maintenance "$v"; then
    echo "WARN: version указывает на техработы/whitelist: бот войти не сможет без добавления в whitelist владельцем"
  fi
  exit 0
fi
echo "SLP: нет ответа"; exit 1
