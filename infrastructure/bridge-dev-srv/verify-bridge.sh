#!/usr/bin/env bash
# Проверка работы Bridge после установки: состояние плагина и счётчики отправки. Запуск: run-on-vds.sh script verify-bridge.sh
# Отправляет в консоль ТОЛЬКО команду `twomcbridge events` (только чтение состояния плагина); больше ничего не пишет.
# Коды: 0 сайт принял события, 3 принятых пока нет (нужен игрок онлайн), 1 плагин не отвечает.
set -uo pipefail
trap ptero_cleanup EXIT
PTERO_ALLOW_WRITE=1   # нужен только для отправки команды в консоль; функции записи файлов здесь не вызываются
ptero_init || exit 1
ptero_status || exit 1
resp="$(ptero_command_capture "twomcbridge events" 20 'TwoMC Bridge: ' 'TwoMC Bridge|Unknown command|Unknown or incomplete' 2>/dev/null)"
grep -E '^L: ' <<<"$resp" | head -n 5
grep -q 'TwoMC Bridge: ' <<<"$resp" || { echo "плагин не отвечает (не загружен?)"; exit 1; }
echo "--- последние строки журнала по Bridge ---"
ptero_console_tail 15 'TwoMCBridge|Снимки|Инвентарь|unsupported|server_mismatch|401' 2>/dev/null | grep -E '^L: ' | tail -n 15
acc="$(sed -n 's/.*принято \([0-9][0-9]*\).*/\1/p' <<<"$resp" | head -n1)"
if (( ${acc:-0} >= 1 )); then echo "OK: сайт принял событий: $acc"; exit 0; fi
echo "PENDING: принятых событий 0 (нужен игрок онлайн; снимок раз в 5-10 минут и при выходе)"; exit 3
