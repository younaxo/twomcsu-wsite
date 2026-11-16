#!/usr/bin/env bash
# Восстановление БД из бэкапа infrastructure/backup/backup.sh.
#   infrastructure/backup/restore.sh [--target drill] <каталог-бэкапа>   # одноразовая БД restore-drill (по умолчанию)
#   infrastructure/backup/restore.sh --target prod <каталог-бэкапа>      # интерактивно: ввести имя БД; api остановлен
#   RESTORE_CONFIRM=OVERWRITE-PRODUCTION infrastructure/backup/restore.sh --target prod --non-interactive <каталог>
# Порядок: sha256 хранимых файлов (несовпадение — ОТКАЗ, код 2) → расшифровка → sha256 открытого дампа →
# pg_restore --list → pg_restore --clean --if-exists. Роли (globals.sql) и uploads — вручную по runbook.
# prod: подтверждение вводом имени БД (TTY); без TTY — отказ, если нет И RESTORE_CONFIRM, И --non-interactive;
# api должен быть остановлен (иначе отказ); перед pg_restore --clean обязательный снимок текущей БД (неудача — стоп).
# Восстановление в production перезаписывает данные: только владелец/назначенный им человек (docs/runbooks/backup-restore.md).
#
# Коды выхода: 0 успех; 1 ошибка; 2 целостность (sha256 или чтение дампа) — восстановление не начато; 3 нет места.
#
# Переменные окружения:
#   AGE_IDENTITY          путь к файлу приватного ключа age (для расшифровки; ключ не создаётся и не хранится скриптом)
#   RESTORE_TMP_DIR       каталог для расшифрованного дампа (по умолчанию $HOME/twomc-backups/.restore-tmp)
#   RESTORE_MIN_FREE_MB   минимум свободного места, МБ (2048)
#   RESTORE_CONFIRM       OVERWRITE-PRODUCTION — только вместе с --non-interactive (без TTY)
#   RESTORE_SNAPSHOT_DIR  каталог снимков перед prod-восстановлением (по умолчанию $HOME/twomc-backups/pre-restore)
#   DRILL_POSTGRES_PASSWORD  нужен compose restore-drill для интерполяции
set -euo pipefail

cd "$(dirname "$0")/../.."
umask 077

fail() { echo "ОШИБКА: $*" >&2; exit "${2:-1}"; }

TARGET=drill
NON_INTERACTIVE=0
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --target) [[ $# -ge 2 ]] || fail "после --target нужно drill или prod"; TARGET=$2; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    *) fail "неизвестный параметр $1" ;;
  esac
done
SRC=${1:-}
[[ -n "$SRC" && -d "$SRC" ]] || fail "укажите каталог бэкапа: restore.sh [--target drill|prod] <каталог>"
SRC=$(cd "$SRC" && pwd -P)
RESTORE_TMP_DIR=${RESTORE_TMP_DIR:-$HOME/twomc-backups/.restore-tmp}
RESTORE_MIN_FREE_MB=${RESTORE_MIN_FREE_MB:-2048}

case "$TARGET" in
  drill)
    : "${DRILL_POSTGRES_PASSWORD:?задайте DRILL_POSTGRES_PASSWORD (одноразовая БД restore-drill)}"
    export DRILL_POSTGRES_PASSWORD
    COMPOSE=(docker compose -p twomc-restore-drill -f infrastructure/docker-compose.restore-drill.yml) ;;
  prod)
    # Политика подтверждения (допущение, docs/runbooks/backup-restore.md): без TTY нужны И RESTORE_CONFIRM, И --non-interactive.
    if [[ "$NON_INTERACTIVE" == "1" ]]; then
      [[ "${RESTORE_CONFIRM:-}" == "OVERWRITE-PRODUCTION" ]] || fail "--non-interactive требует RESTORE_CONFIRM=OVERWRITE-PRODUCTION"
    elif [[ ! ( -t 0 && -t 1 ) ]]; then
      fail "восстановление в production без TTY: нужны RESTORE_CONFIRM=OVERWRITE-PRODUCTION и --non-interactive"
    fi
    [[ -f .env ]] || fail ".env отсутствует"
    COMPOSE=(docker compose --env-file .env -f infrastructure/docker-compose.prod.yml) ;;
  *) fail "--target: допустимо drill или prod" ;;
esac

sha256_check() { if command -v sha256sum >/dev/null; then sha256sum -c "$@"; else shasum -a 256 -c "$@"; fi; }
free_mb() { df -Pk "$1" | awk 'NR==2 {print int($4/1024)}'; }

for f in SHA256SUMS MANIFEST.txt PLAIN.sha256; do
  [[ -f "$SRC/$f" ]] || fail "в бэкапе нет $f" 2
done

echo "→ проверка sha256 хранимых файлов"
( cd "$SRC" && sha256_check --quiet SHA256SUMS ) || fail "ОТКАЗ: sha256 не совпадает — бэкап повреждён или изменён, восстановление не начато" 2

enc=$(sed -n 's/^encryption=//p' "$SRC/MANIFEST.txt")
case "$enc" in
  age) stored=postgres.dump.age ;;
  gpg) stored=postgres.dump.gpg ;;
  none) stored=postgres.dump ;;
  *) fail "неизвестное encryption='$enc' в манифесте" 2 ;;
esac
[[ -f "$SRC/$stored" ]] || fail "нет файла $stored" 2

mkdir -p "$RESTORE_TMP_DIR"
chmod 700 "$RESTORE_TMP_DIR" 2>/dev/null || true
free=$(free_mb "$RESTORE_TMP_DIR")
[[ "$free" =~ ^[0-9]+$ ]] || fail "не удалось определить свободное место"
if (( free < RESTORE_MIN_FREE_MB )); then fail "мало места в RESTORE_TMP_DIR: ${free} МБ, нужно ${RESTORE_MIN_FREE_MB} МБ" 3; fi
tmp=$(mktemp -d "$RESTORE_TMP_DIR/restore.XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT

echo "→ расшифровка ($enc)"
case "$enc" in
  age)
    [[ -n "${AGE_IDENTITY:-}" && -f "$AGE_IDENTITY" ]] || fail "задайте AGE_IDENTITY — путь к файлу приватного ключа age"
    age -d -i "$AGE_IDENTITY" -o "$tmp/postgres.dump" "$SRC/$stored" || fail "расшифровка age не удалась" 2 ;;
  gpg) gpg --batch --yes -o "$tmp/postgres.dump" -d "$SRC/$stored" || fail "расшифровка gpg не удалась" 2 ;;
  none) cp -- "$SRC/$stored" "$tmp/postgres.dump" ;;
esac

grep -E '[ *]postgres\.dump$' "$SRC/PLAIN.sha256" > "$tmp/PLAIN.one" || fail "в PLAIN.sha256 нет postgres.dump" 2
( cd "$tmp" && sha256_check --quiet PLAIN.one ) || fail "ОТКАЗ: sha256 расшифрованного дампа не совпадает — восстановление не начато" 2

"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$tmp/postgres.dump" >/dev/null || fail "дамп не читается (pg_restore --list) — восстановление не начато" 2

if [[ "$TARGET" == "prod" ]]; then
  # shellcheck disable=SC2016  # $POSTGRES_DB раскрывается внутри контейнера
  dbname=$("${COMPOSE[@]}" exec -T postgres sh -c 'printf %s "$POSTGRES_DB"') || fail "не удалось определить имя БД production"
  [[ -n "$dbname" ]] || fail "пустое имя БД production"
  if [[ "$NON_INTERACTIVE" != "1" ]]; then
    echo "ВНИМАНИЕ: будет перезаписана БД production '$dbname' данными из $(basename "$SRC")."
    read -r -p "Для продолжения введите имя БД ($dbname): " answer || answer=
    [[ "$answer" == "$dbname" ]] || fail "имя БД не совпало — восстановление отменено, ничего не изменено"
  fi
  running=$("${COMPOSE[@]}" ps --status running --services) || fail "не удалось получить список запущенных сервисов"
  if grep -qx 'api' <<<"$running"; then
    fail "сервис api запущен: остановите его (docker compose ... stop api web) — восстановление не начато"
  fi
  SNAP_DIR=${RESTORE_SNAPSHOT_DIR:-$HOME/twomc-backups/pre-restore}
  mkdir -p "$SNAP_DIR" && chmod 700 "$SNAP_DIR" 2>/dev/null || true
  snap="$SNAP_DIR/twomc-pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
  echo "→ снимок текущей БД перед восстановлением: $snap (открытый дамп с ПДн; зашифровать или удалить после проверки)"
  # shellcheck disable=SC2016
  "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$snap" || { rm -f -- "$snap"; fail "снимок текущей БД не удался — восстановление не начато"; }
  [[ -s "$snap" ]] || { rm -f -- "$snap"; fail "снимок текущей БД пуст — восстановление не начато"; }
  "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$snap" >/dev/null || fail "снимок не читается (pg_restore --list) — восстановление не начато"
fi

echo "→ pg_restore --clean --if-exists в цель '$TARGET'"
# shellcheck disable=SC2016  # $POSTGRES_* раскрываются внутри контейнера
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$tmp/postgres.dump" || fail "pg_restore завершился с ошибкой"
echo "Восстановление завершено: $(basename "$SRC") → $TARGET"
