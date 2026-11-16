#!/usr/bin/env bash
# Восстановление БД из бэкапа infrastructure/backup/backup.sh.
#   infrastructure/backup/restore.sh [--target drill] <каталог-бэкапа>   # одноразовая БД restore-drill (по умолчанию)
#   infrastructure/backup/restore.sh --target prod <каталог-бэкапа>      # интерактивно: ввести имя БД; api остановлен
#   RESTORE_CONFIRM=OVERWRITE-PRODUCTION infrastructure/backup/restore.sh --target prod --non-interactive <каталог>
# Порядок: sha256 хранимых файлов (несовпадение — ОТКАЗ, код 2) → расшифровка → sha256 открытого дампа →
# pg_restore --list → pg_restore --clean --if-exists --single-transaction (RESTORE_SINGLE_TRANSACTION=0 отключает). Роли (globals.sql) и uploads — вручную по runbook.
# prod: подтверждение вводом имени БД (TTY); без TTY — отказ, если нет И RESTORE_CONFIRM, И --non-interactive;
# api должен быть остановлен (running, restarting и paused считаются «не остановлен» — иначе отказ); перед pg_restore --clean обязательный снимок текущей БД (неудача — стоп).
# Восстановление в production перезаписывает данные: только владелец/назначенный им человек (docs/runbooks/backup-restore.md).
#
# Коды выхода: 0 успех; 1 ошибка; 2 целостность (sha256 или чтение дампа) — восстановление не начато; 3 нет места.
#
# Переменные окружения:
#   AGE_IDENTITY          путь к файлу приватного ключа age (для расшифровки; ключ не создаётся и не хранится скриптом)
#   RESTORE_TMP_DIR       каталог для расшифрованного дампа (по умолчанию $HOME/twomc-backups/.restore-tmp)
#   RESTORE_MIN_FREE_MB   минимум свободного места, МБ (2048)
#   RESTORE_SINGLE_TRANSACTION  1 (по умолчанию) — pg_restore --single-transaction; 0 — выключить (runbook)
#   RESTORE_CONFIRM       OVERWRITE-PRODUCTION — только вместе с --non-interactive (без TTY)
#   RESTORE_SNAPSHOT_DIR  каталог снимков перед prod-восстановлением (по умолчанию $HOME/twomc-backups/pre-restore); внутри репозитория — отказ
#   RESTORE_SNAPSHOT_KEEP  сколько снимков pre-restore хранить (3); ротация отдельно от плановых бэкапов
#   AGE_RECIPIENT         публичный ключ age: если задан, снимок pre-restore шифруется; иначе открытый + предупреждение
#   RESTORE_SNAPSHOT_PLAIN_DAYS  срок в предупреждении об открытом снимке (7 дней; скрипт сам не удаляет раньше ротации)
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
  running=$("${COMPOSE[@]}" ps --status running --status restarting --status paused --services) || fail "не удалось получить список запущенных сервисов"
  if grep -qx 'api' <<<"$running"; then
    fail "сервис api запущен, перезапускается или на паузе: остановите его (docker compose ... stop api web) — восстановление не начато"
  fi
  # Снимок текущей БД = открытый дамп с ПДн: каталог вне репозитория (как в deploy.sh), шифрование age или громкое предупреждение, ротация.
  repo_root=$(pwd -P)
  SNAP_DIR=${RESTORE_SNAPSHOT_DIR:-$HOME/twomc-backups/pre-restore}
  RESTORE_SNAPSHOT_KEEP=${RESTORE_SNAPSHOT_KEEP:-3}
  RESTORE_SNAPSHOT_PLAIN_DAYS=${RESTORE_SNAPSHOT_PLAIN_DAYS:-7}
  [[ "$RESTORE_SNAPSHOT_KEEP" =~ ^[1-9][0-9]*$ ]] || fail "RESTORE_SNAPSHOT_KEEP должен быть целым числом >= 1"
  [[ "$SNAP_DIR" == /* || "$SNAP_DIR" =~ ^[A-Za-z]:[\/] ]] || SNAP_DIR="$repo_root/$SNAP_DIR"
  case "$SNAP_DIR/" in
    "$repo_root"/*) fail "RESTORE_SNAPSHOT_DIR внутри репозитория — запрещено (снимок содержит ПДн); восстановление не начато" ;;
  esac
  mkdir -p "$SNAP_DIR" && chmod 700 "$SNAP_DIR" 2>/dev/null || true
  case "$(cd "$SNAP_DIR" && pwd -P)/" in
    "$repo_root"/*) rmdir -- "$SNAP_DIR" 2>/dev/null || true; fail "RESTORE_SNAPSHOT_DIR (после разрешения ссылок) внутри репозитория — запрещено; восстановление не начато" ;;
  esac
  snap="$SNAP_DIR/twomc-pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
  echo "→ снимок текущей БД перед восстановлением"
  # Сначала во временный каталог (700, удаляется по выходу): в SNAP_DIR попадает только готовый и проверенный файл.
  # shellcheck disable=SC2016
  "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp/pre-restore.dump" || fail "снимок текущей БД не удался — восстановление не начато"
  [[ -s "$tmp/pre-restore.dump" ]] || fail "снимок текущей БД пуст — восстановление не начато"
  "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$tmp/pre-restore.dump" >/dev/null || fail "снимок не читается (pg_restore --list) — восстановление не начато"
  if [[ -n "${AGE_RECIPIENT:-}" ]]; then
    snap="$snap.age"
    age -r "$AGE_RECIPIENT" -o "$snap" "$tmp/pre-restore.dump" || { rm -f -- "$snap"; fail "шифрование снимка age не удалось — восстановление не начато"; }
    [[ -s "$snap" ]] || { rm -f -- "$snap"; fail "зашифрованный снимок пуст — восстановление не начато"; }
    echo "Снимок зашифрован (age): $snap"
  else
    cp -- "$tmp/pre-restore.dump" "$snap" || { rm -f -- "$snap"; fail "не удалось сохранить снимок — восстановление не начато"; }
    echo "ВНИМАНИЕ: AGE_RECIPIENT не задан — снимок $snap сохранён ОТКРЫТЫМ (содержит ПДн)." >&2
    echo "ВНИМАНИЕ: зашифруйте его (age -r <ключ>) или удалите не позднее чем через ${RESTORE_SNAPSHOT_PLAIN_DAYS} дн. после проверки восстановления." >&2
  fi
  # Ротация снимков pre-restore отдельно от плановых бэкапов: RESTORE_SNAPSHOT_KEEP последних (3). Сбой удаления — предупреждение.
  mapfile -t snaps < <(find "$SNAP_DIR" -maxdepth 1 -type f \( -name 'twomc-pre-restore-*.dump' -o -name 'twomc-pre-restore-*.dump.age' \) 2>/dev/null | sed 's|.*/||' | sort -r || true)
  if (( ${#snaps[@]} > RESTORE_SNAPSHOT_KEEP )); then
    for old in "${snaps[@]:RESTORE_SNAPSHOT_KEEP}"; do
      if rm -f -- "${SNAP_DIR:?}/$old"; then echo "Ротация pre-restore: удалён $old"; else echo "ПРЕДУПРЕЖДЕНИЕ: не удалось удалить старый снимок $old" >&2; fi
    done
  fi
  "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$snap" >/dev/null || fail "снимок не читается (pg_restore --list) — восстановление не начато"
fi

# --single-transaction: всё или ничего — при любой ошибке откат, БД остаётся в прежнем состоянии (а не наполовину очищенной).
# Совместимо с --clean --if-exists; несовместимо с -j (параллельность не используется: дамп идёт со stdin). Роли/globals не затрагиваются.
# Цена: любая ошибка (в т.ч. безобидная при обычном режиме) откатывает всё; RESTORE_SINGLE_TRANSACTION=0 — прежний режим (runbook).
RESTORE_SINGLE_TRANSACTION=${RESTORE_SINGLE_TRANSACTION:-1}
case "$RESTORE_SINGLE_TRANSACTION" in
  1) PGR_MODE=(--single-transaction) ;;
  0) PGR_MODE=(); echo "ПРЕДУПРЕЖДЕНИЕ: RESTORE_SINGLE_TRANSACTION=0 — при ошибке БД может остаться частично восстановленной" >&2 ;;
  *) fail "RESTORE_SINGLE_TRANSACTION: допустимо 0 или 1" ;;
esac
echo "→ pg_restore --clean --if-exists ${PGR_MODE[*]:-} в цель '$TARGET'"
# shellcheck disable=SC2016  # $POSTGRES_* раскрываются внутри контейнера
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_restore --clean --if-exists "$@" --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' pg_restore_sh ${PGR_MODE[@]+"${PGR_MODE[@]}"} < "$tmp/postgres.dump" \
  || fail "pg_restore завершился с ошибкой (при --single-transaction изменения откачены; см. runbook)"
echo "Восстановление завершено: $(basename "$SRC") → $TARGET"
