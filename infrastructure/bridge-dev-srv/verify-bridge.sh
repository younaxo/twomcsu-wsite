#!/usr/bin/env bash
# Проверка работы Bridge после установки: состояние плагина и счётчики отправки.
# ЗАПУСК ТОЛЬКО через пакет: bash run-on-vds.sh script verify-bridge.sh [--log [N] [--bot <ник>]] (прямой запуск файла отказывает: нужны функции ptero.sh).
# Без аргументов: отправляет в консоль ТОЛЬКО команду `twomcbridge events` (только чтение состояния плагина; белый список ptero.sh); больше ничего не пишет.
# --log [N]   только чтение (запись на панель выключена): последние N (1..200, по умолчанию 40) строк logs/latest.log, ТОЛЬКО строки с TwoMCBridge и
#             ключевыми словами join/kick/disconnect (+ lost connection, left the game, whitelist). Ники игроков (кроме ника бота из --bot) -> <player>,
#             IP -> <ip>, UUID -> <uuid>, длинный hex -> <hex>. Консольных команд не отправляет.
# Коды: 0 сайт принял события, 3 принятых пока нет (нужен игрок онлайн), 1 плагин не отвечает; с --log: 0 готово, 1 журнал не прочитан, 2 аргументы.
export LC_ALL=C
set -uo pipefail
declare -F ptero_init >/dev/null 2>&1 || { echo "Запускать только через: bash run-on-vds.sh script verify-bridge.sh" >&2; exit 2; }
trap ptero_cleanup EXIT

LOG=0; LOG_N=40; BOT_NICK=""
while (( $# )); do
  case "$1" in
    --log) LOG=1 ;;
    --bot) shift; [[ "${1:-}" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "--bot: ник 3-16 [A-Za-z0-9_]" >&2; exit 2; }; BOT_NICK="$1" ;;
    *) if [[ "$LOG" == 1 && "$1" =~ ^[0-9]{1,3}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 200 )); then LOG_N=$((10#$1)); else echo "Использование: verify-bridge.sh | --log [N 1-200] [--bot <ник>]" >&2; exit 2; fi ;;
  esac
  shift
done

PTERO_ALLOW_WRITE=0   # по умолчанию только чтение; запись включается точечно ТОЛЬКО для отправки команды в консоль (ниже)
ptero_init || exit 1

if [[ "$LOG" == 1 ]]; then
  _pt_mktemp || exit 1; raw="$_PT_LAST"
  _pt_mktemp || exit 1; flt="$_PT_LAST"
  ptero_file_read /logs/latest.log > "$raw" 2>/dev/null || { echo "ОШИБКА: logs/latest.log не прочитан"; : > "$raw"; exit 1; }
  # ники берутся из ВСЕГО текста (последние 5000 строк), фильтр по ключевым словам - после маскировки
  tail -n 5000 "$raw" > "$flt"; : > "$raw"
  _pt_mktemp || exit 1; msk="$_PT_LAST"
  ptero_mask_log "$flt" "$BOT_NICK" > "$msk"; : > "$flt"
  echo "--- latest.log: TwoMCBridge/join/kick/disconnect, последние $LOG_N (ники кроме бота, IP и UUID замаскированы) ---"
  grep -iE 'TwoMCBridge|join|kick|disconnect|lost connection|left the game|white-?list' "$msk" | tail -n "$LOG_N" | cut -c1-300
  : > "$msk"
  exit 0
fi

ptero_status || exit 1
resp="$(PTERO_ALLOW_WRITE=1 ptero_command_capture "twomcbridge events" 20 'TwoMC Bridge: ' 'TwoMC Bridge|Unknown command|Unknown or incomplete' 2>/dev/null)"
grep -E '^L: ' <<<"$resp" | head -n 5
grep -q 'TwoMC Bridge: ' <<<"$resp" || { echo "плагин не отвечает (не загружен?)"; exit 1; }
echo "--- последние строки журнала по Bridge ---"
ptero_console_tail 15 'TwoMCBridge|Снимки|Инвентарь|unsupported|server_mismatch|401' 2>/dev/null | grep -E '^L: ' | tail -n 15
acc="$(sed -n 's/.*принято \([0-9][0-9]*\).*/\1/p' <<<"$resp" | head -n1)"
if (( ${acc:-0} >= 1 )); then echo "OK: сайт принял событий: $acc"; exit 0; fi
echo "PENDING: принятых событий 0 (нужен игрок онлайн; снимок раз в 5-10 минут и при выходе)"; exit 3
