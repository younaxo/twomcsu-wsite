#!/usr/bin/env bash
# Бэкап twomc.su: PostgreSQL (pg_dump -Fc + pg_dumpall --globals-only), том uploads, манифест с sha256.
#   infrastructure/backup/backup.sh                       # плановый бэкап
#   BACKUP_TAG=predeploy infrastructure/backup/backup.sh  # снимок перед деплоем
# Запускать на сервере из любого каталога (скрипт сам переходит в корень checkout).
# Redis НЕ бэкапится (кеш и временные счётчики; refresh-сессии лежат в Postgres) — docs/runbooks/backup-restore.md.
#
# Коды выхода: 0 успех; 1 ошибка; 3 нехватка места; 4 бэкап создан локально, но выгрузка в S3 не удалась.
#
# Переменные окружения (значения секретов здесь не хранятся; ключи age/S3 задаёт владелец на сервере):
#   BACKUP_DIR            каталог локальных бэкапов вне репозитория (по умолчанию $HOME/twomc-backups/scheduled)
#   BACKUP_KEEP           сколько последних локальных бэкапов хранить (14)
#   BACKUP_MIN_FREE_MB    минимум свободного места на старте, МБ (2048); меньше — выход 3
#   BACKUP_TAG            метка в имени: scheduled | predeploy | ... (scheduled)
#   BACKUP_ENCRYPT        age (по умолчанию) | gpg | none (none только вместе с BACKUP_ALLOW_UNENCRYPTED=1)
#   AGE_RECIPIENT         публичный ключ age (приватный хранится офлайн у владельца)
#   GPG_RECIPIENT         получатель gpg (альтернатива age)
#   BACKUP_S3_RCLONE_REMOTE  назначение rclone вида remote:bucket/prefix (учётные данные — в конфиге rclone)
#   BACKUP_S3_URI, BACKUP_S3_ENDPOINT  альтернатива через aws cli: s3://bucket/prefix и --endpoint-url (RU-S3)
#   UPLOADS_VOLUME        имя docker-тома uploads (по умолчанию определяется по контейнеру twomc-su-api)
#   BACKUP_HELPER_IMAGE   образ временного контейнера для архива uploads (postgres:16-alpine, --pull=never)
#   BACKUP_SKIP_UPLOADS   1 — не архивировать uploads (restore-drill)
#   BACKUP_COMPOSE_FILE, BACKUP_ENV_FILE, BACKUP_COMPOSE_PROJECT  переопределение compose (для restore-drill)
set -euo pipefail

cd "$(dirname "$0")/../.."
umask 077

BACKUP_DIR=${BACKUP_DIR:-$HOME/twomc-backups/scheduled}
BACKUP_KEEP=${BACKUP_KEEP:-14}
BACKUP_MIN_FREE_MB=${BACKUP_MIN_FREE_MB:-2048}
BACKUP_TAG=${BACKUP_TAG:-scheduled}
BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-age}
BACKUP_COMPOSE_FILE=${BACKUP_COMPOSE_FILE:-infrastructure/docker-compose.prod.yml}
BACKUP_ENV_FILE=${BACKUP_ENV_FILE-.env}
BACKUP_COMPOSE_PROJECT=${BACKUP_COMPOSE_PROJECT:-}
BACKUP_SKIP_UPLOADS=${BACKUP_SKIP_UPLOADS:-0}
BACKUP_HELPER_IMAGE=${BACKUP_HELPER_IMAGE:-postgres:16-alpine}

fail() { echo "ОШИБКА: $*" >&2; exit "${2:-1}"; }

COMPOSE=(docker compose)
if [[ -n "$BACKUP_COMPOSE_PROJECT" ]]; then COMPOSE+=(-p "$BACKUP_COMPOSE_PROJECT"); fi
if [[ -n "$BACKUP_ENV_FILE" ]]; then COMPOSE+=(--env-file "$BACKUP_ENV_FILE"); fi
COMPOSE+=(-f "$BACKUP_COMPOSE_FILE")

[[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] || fail "BACKUP_KEEP='$BACKUP_KEEP' некорректно (число не меньше 1)"
(( BACKUP_KEEP >= 1 )) || fail "BACKUP_KEEP должен быть не меньше 1"
[[ "$BACKUP_MIN_FREE_MB" =~ ^[0-9]+$ ]] || fail "BACKUP_MIN_FREE_MB='$BACKUP_MIN_FREE_MB' некорректно"
[[ "$BACKUP_TAG" =~ ^[A-Za-z0-9_-]+$ ]] || fail "BACKUP_TAG допускает только буквы, цифры, _ и -"

case "$BACKUP_ENCRYPT" in
  age)
    [[ -n "${AGE_RECIPIENT:-}" ]] || fail "не задан AGE_RECIPIENT (публичный ключ age). Незашифрованный бэкап содержит ПДн — отказ"
    command -v age >/dev/null || fail "не найден age" ;;
  gpg)
    [[ -n "${GPG_RECIPIENT:-}" ]] || fail "не задан GPG_RECIPIENT"
    command -v gpg >/dev/null || fail "не найден gpg" ;;
  none)
    [[ "${BACKUP_ALLOW_UNENCRYPTED:-}" == "1" ]] || fail "BACKUP_ENCRYPT=none разрешён только с BACKUP_ALLOW_UNENCRYPTED=1 (синтетика)" ;;
  *) fail "BACKUP_ENCRYPT='$BACKUP_ENCRYPT': допустимо age, gpg, none" ;;
esac

sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
free_mb() { df -Pk "$1" | awk 'NR==2 {print int($4/1024)}'; }

mkdir -p "$BACKUP_DIR" || fail "не удалось создать BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true
repo_root=$(pwd -P)
case "$(cd "$BACKUP_DIR" && pwd -P)/" in
  "$repo_root"/*) fail "BACKUP_DIR внутри репозитория — запрещено (бэкап содержит ПДн)" ;;
esac

free=$(free_mb "$BACKUP_DIR")
[[ "$free" =~ ^[0-9]+$ ]] || fail "не удалось определить свободное место в BACKUP_DIR"
if (( free < BACKUP_MIN_FREE_MB )); then
  fail "мало места в BACKUP_DIR: свободно ${free} МБ, нужно не меньше ${BACKUP_MIN_FREE_MB} МБ — бэкап не начат" 3
fi

name="twomc-$(date -u +%Y%m%dT%H%M%SZ)-$BACKUP_TAG"
work="$BACKUP_DIR/.$name.partial"
final="$BACKUP_DIR/$name"
mkdir "$work" || fail "не удалось создать $work"
ok=0
# shellcheck disable=SC2329  # вызывается через trap
cleanup() { if (( ok == 0 )); then rm -rf -- "$work"; echo "Бэкап не завершён, временные файлы удалены" >&2; fi; }
trap cleanup EXIT

echo "→ pg_dump -Fc"
# shellcheck disable=SC2016  # $POSTGRES_* раскрываются внутри контейнера
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$work/postgres.dump" || fail "pg_dump не удался"
[[ -s "$work/postgres.dump" ]] || fail "дамп БД пуст"
entries=$("${COMPOSE[@]}" exec -T postgres pg_restore --list < "$work/postgres.dump" | wc -l) || fail "дамп не читается (pg_restore --list)"
(( entries > 0 )) || fail "pg_restore --list вернул пустой список"

echo "→ pg_dumpall --globals-only (роли; содержит хеши паролей)"
# shellcheck disable=SC2016
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dumpall --globals-only -U "$POSTGRES_USER"' > "$work/globals.sql" || fail "pg_dumpall --globals-only не удался"
[[ -s "$work/globals.sql" ]] || fail "globals.sql пуст"

files=(postgres.dump globals.sql)
if [[ "$BACKUP_SKIP_UPLOADS" != "1" ]]; then
  echo "→ архив uploads (временный контейнер, том только для чтения)"
  vol=${UPLOADS_VOLUME:-$(docker inspect twomc-su-api --format '{{range .Mounts}}{{if eq .Destination "/app/apps/api/uploads"}}{{.Name}}{{end}}{{end}}')}
  [[ -n "$vol" ]] || fail "не удалось определить том uploads (задайте UPLOADS_VOLUME)"
  docker run --rm --pull=never --network none --read-only -v "$vol":/data:ro "$BACKUP_HELPER_IMAGE" tar -C /data -cf - . \
    | gzip -c > "$work/uploads.tar.gz" || fail "архивация uploads не удалась"
  gzip -t "$work/uploads.tar.gz" || fail "архив uploads повреждён"
  files+=(uploads.tar.gz)
fi

# Хеши открытых файлов — для проверки после расшифровки; SHA256SUMS ниже — для проверки хранимых артефактов.
( cd "$work" && sha256_of "${files[@]}" > PLAIN.sha256 )
{
  echo "format=twomc-backup-v1"
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tag=$BACKUP_TAG"
  echo "encryption=$BACKUP_ENCRYPT"
  echo "postgres_list_entries=$entries"
  echo "files=${files[*]}"
} > "$work/MANIFEST.txt"

stored=()
for f in "${files[@]}"; do
  case "$BACKUP_ENCRYPT" in
    age) age -r "$AGE_RECIPIENT" -o "$work/$f.age" "$work/$f" || fail "шифрование age не удалось ($f)"; rm -f -- "${work:?}/$f"; stored+=("$f.age") ;;
    gpg) gpg --batch --yes --trust-model always -r "$GPG_RECIPIENT" -o "$work/$f.gpg" -e "$work/$f" || fail "шифрование gpg не удалось ($f)"; rm -f -- "${work:?}/$f"; stored+=("$f.gpg") ;;
    none) stored+=("$f") ;;
  esac
done
( cd "$work" && sha256_of "${stored[@]}" MANIFEST.txt PLAIN.sha256 > SHA256SUMS )

mv "$work" "$final" || fail "не удалось переименовать каталог бэкапа"
ok=1
chmod -R go-rwx "$final" 2>/dev/null || true
echo "Бэкап сохранён: $final"

rc=0
if [[ -n "${BACKUP_S3_RCLONE_REMOTE:-}" ]]; then
  echo "→ выгрузка в S3 (rclone)"
  rclone copy "$final" "${BACKUP_S3_RCLONE_REMOTE%/}/$name" || { echo "Выгрузка в S3 не удалась; локальная копия сохранена" >&2; rc=4; }
elif [[ -n "${BACKUP_S3_URI:-}" ]]; then
  echo "→ выгрузка в S3 (aws cli)"
  s3args=()
  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then s3args+=(--endpoint-url "$BACKUP_S3_ENDPOINT"); fi
  aws s3 cp --recursive "${s3args[@]}" "$final" "${BACKUP_S3_URI%/}/$name" || { echo "Выгрузка в S3 не удалась; локальная копия сохранена" >&2; rc=4; }
else
  echo "S3 не настроен — локальный fallback (BACKUP_DIR, хранится $BACKUP_KEEP последних)"
fi

# Ротация локальных копий: оставить BACKUP_KEEP последних (имя содержит UTC-время, порядок лексикографический).
find "$BACKUP_DIR" -maxdepth 1 -type d -name 'twomc-*' | sort -r | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
  rm -rf -- "$old" && echo "Ротация: удалён $(basename "$old")"
done

exit "$rc"
