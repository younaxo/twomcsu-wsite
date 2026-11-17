#!/usr/bin/env bash
# Бэкап twomc.su: PostgreSQL (pg_dump -Fc + pg_dumpall --globals-only), том uploads, манифест с sha256.
#   infrastructure/backup/backup.sh                       # плановый бэкап
#   BACKUP_TAG=predeploy infrastructure/backup/backup.sh  # снимок перед деплоем
# Запускать на сервере из любого каталога (скрипт сам переходит в корень checkout).
# Redis НЕ бэкапится (кеш и временные счётчики; refresh-сессии лежат в Postgres) — docs/runbooks/backup-restore.md.
#
# Коды выхода: 0 успех; 1 ошибка; 3 нехватка места; 4 бэкап создан локально, но выгрузка в S3 не удалась;
# 5 бэкап сохранён, но ротация не смогла удалить старую копию (4 приоритетнее 5; детали в stderr).
#
# Переменные окружения (значения секретов здесь не хранятся; ключи age/S3 задаёт владелец на сервере):
#   BACKUP_DIR            каталог локальных бэкапов вне репозитория (по умолчанию $HOME/twomc-backups/scheduled)
#   BACKUP_KEEP_DAILY     сколько хранить ежедневных копий (метка scheduled) (7)
#   BACKUP_KEEP_WEEKLY    сколько хранить еженедельных копий (метка weekly) (4)
#   BACKUP_KEEP_PREDEPLOY сколько хранить снимков перед деплоем (метка predeploy) (7)
#   BACKUP_KEEP_OTHER     сколько хранить копий прочих меток (prerestore, drill, ...), отдельно на каждую метку (7)
#   BACKUP_WEEKLY_DAY     день недели недельной копии, 1-7 по date +%u, UTC (7 = воскресенье)
#   BACKUP_ROTATE_DRY_RUN 1 — ротация только печатает, что удалила бы
#   (BACKUP_KEEP устарел и игнорируется: заменён переменными BACKUP_KEEP_*)
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

# --- Хранение: функции ротации и недельной копии (можно подключить через source без БД и Docker) ---
BACKUP_KEEP_DAILY=${BACKUP_KEEP_DAILY:-7}
BACKUP_KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-4}
BACKUP_KEEP_PREDEPLOY=${BACKUP_KEEP_PREDEPLOY:-7}
BACKUP_KEEP_OTHER=${BACKUP_KEEP_OTHER:-7}
BACKUP_WEEKLY_DAY=${BACKUP_WEEKLY_DAY:-7}
BACKUP_ROTATE_DRY_RUN=${BACKUP_ROTATE_DRY_RUN:-0}
rotate_failed=0

# rotate_tag КАТАЛОГ МЕТКА СКОЛЬКО_ХРАНИТЬ — оставляет СКОЛЬКО_ХРАНИТЬ последних копий с этой меткой.
# Удаляются только каталоги верхнего уровня КАТАЛОГа с именем twomc-YYYYMMDDTHHMMSSZ-МЕТКА (строгий шаблон).
# `.partial`, файлы и копии других меток не затрагиваются. Порядок — по UTC-времени в имени (лексикографический).
# Сбой удаления: копия остаётся, rotate_failed=1 (выход 5, если нет более важного 4).
rotate_tag() {
  local dir=$1 tag=$2 keep=$3 old
  [[ -n "$dir" && -d "$dir" ]] || { echo "ОШИБКА РОТАЦИИ: каталог '$dir' не существует" >&2; rotate_failed=1; return 0; }
  [[ "$dir" != "/" ]] || { echo "ОШИБКА РОТАЦИИ: каталог '/' запрещён" >&2; rotate_failed=1; return 0; }
  [[ "$tag" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "ОШИБКА РОТАЦИИ: недопустимая метка '$tag'" >&2; rotate_failed=1; return 0; }
  if ! [[ "$keep" =~ ^[0-9]+$ ]] || (( keep < 1 )); then
    echo "ОШИБКА РОТАЦИИ: число хранимых копий '$keep' некорректно" >&2; rotate_failed=1; return 0
  fi
  local -a same_tag=()
  mapfile -t same_tag < <(find "$dir" -maxdepth 1 -mindepth 1 -type d -name 'twomc-*' 2>/dev/null \
    | sed 's|.*/||' | grep -E "^twomc-[0-9]{8}T[0-9]{6}Z-${tag}\$" | sort -r || true)
  (( ${#same_tag[@]} > keep )) || return 0
  for old in "${same_tag[@]:keep}"; do
    [[ "$old" =~ ^twomc-[0-9]{8}T[0-9]{6}Z-${tag}$ ]] || continue
    if [[ "$BACKUP_ROTATE_DRY_RUN" == "1" ]]; then
      echo "Ротация ($tag, dry-run): был бы удалён $old"
    elif rm -rf -- "${dir:?}/${old:?}"; then
      echo "Ротация ($tag): удалён $old"
    else
      echo "ОШИБКА РОТАЦИИ: не удалось удалить $old; бэкап сохранён, выход будет ненулевым (5, либо 4 при провале S3)" >&2
      rotate_failed=1
    fi
  done
}

# rotate_all КАТАЛОГ [ТЕКУЩАЯ_МЕТКА] — три уровня хранения плюс текущая нестандартная метка.
rotate_all() {
  local dir=$1 cur=${2:-}
  rotate_tag "$dir" scheduled "$BACKUP_KEEP_DAILY"
  rotate_tag "$dir" weekly "$BACKUP_KEEP_WEEKLY"
  rotate_tag "$dir" predeploy "$BACKUP_KEEP_PREDEPLOY"
  case "$cur" in
    ""|scheduled|weekly|predeploy) ;;
    *) rotate_tag "$dir" "$cur" "$BACKUP_KEEP_OTHER" ;;
  esac
}

# weekly_copy ИСХОДНЫЙ_КАТАЛОГ КАТАЛОГ_НАЗНАЧЕНИЯ — недельная копия ежедневного бэкапа: жёсткие ссылки (cp -al, без
# дублирования места), при невозможности — обычная копия. Существующая копия не перезаписывается.
# Копирование идёт в <КАТАЛОГ_НАЗНАЧЕНИЯ>.partial и переименовывается только после успеха: сбой посреди копирования
# не оставляет каталог *-weekly под валидным именем (ротация `.partial` не видит — строгий шаблон имени).
# Перед откатом на полную копию проверяется место: свободно должно остаться не меньше BACKUP_MIN_FREE_MB сверх размера копии.
weekly_copy() {
  local src=$1 dst=$2 tmp="${2}.partial" need_mb free_mb_now min_mb=${BACKUP_MIN_FREE_MB:-2048}
  [[ -d "$src" ]] || return 1
  [[ ! -e "$dst" ]] || return 0
  rm -rf -- "${tmp:?}"
  if cp -al -- "$src" "$tmp" 2>/dev/null; then
    mv -- "$tmp" "$dst" && return 0
    rm -rf -- "${tmp:?}"; return 1
  fi
  rm -rf -- "${tmp:?}"
  need_mb=$(du -sm -- "$src" 2>/dev/null | awk '{print $1}')
  free_mb_now=$(df -Pk -- "$(dirname -- "$dst")" 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
  if ! [[ "$need_mb" =~ ^[0-9]+$ && "$free_mb_now" =~ ^[0-9]+$ ]] || (( free_mb_now - need_mb < min_mb )); then
    echo "ОШИБКА: для обычной копии недельного бэкапа не хватает места (нужно ${need_mb:-?} МБ плюс ${min_mb} МБ запаса, свободно ${free_mb_now:-?} МБ)" >&2
    return 1
  fi
  if cp -a -- "$src" "$tmp" && mv -- "$tmp" "$dst"; then return 0; fi
  rm -rf -- "${tmp:?}"
  return 1
}

# При подключении через source (стаб-тест) дальше не идём: ни cd, ни Docker, ни БД.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; fi

cd "$(dirname "$0")/../.."
umask 077

BACKUP_DIR=${BACKUP_DIR:-$HOME/twomc-backups/scheduled}
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

if [[ -n "${BACKUP_KEEP:-}" ]]; then echo "ПРЕДУПРЕЖДЕНИЕ: BACKUP_KEEP устарел и игнорируется (используйте BACKUP_KEEP_DAILY/WEEKLY/PREDEPLOY/OTHER)" >&2; fi
for v in BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_KEEP_PREDEPLOY BACKUP_KEEP_OTHER; do
  if ! [[ "${!v}" =~ ^[0-9]+$ ]] || (( ${!v} < 1 )); then fail "$v='${!v}' некорректно (число не меньше 1)"; fi
done
[[ "$BACKUP_WEEKLY_DAY" =~ ^[1-7]$ ]] || fail "BACKUP_WEEKLY_DAY='$BACKUP_WEEKLY_DAY' некорректно (1-7)"
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
  echo "S3 не настроен — локальный fallback (BACKUP_DIR; хранится $BACKUP_KEEP_DAILY ежедневных, $BACKUP_KEEP_WEEKLY недельных, $BACKUP_KEEP_PREDEPLOY predeploy)"
fi

# Недельный уровень: плановая (scheduled) копия в день BACKUP_WEEKLY_DAY (по умолчанию воскресенье, UTC)
# дополнительно сохраняется как twomc-<то же время>-weekly (жёсткие ссылки). Ошибка не отменяет бэкап: выход 5.
# День недели берётся из метки времени самого бэкапа ($name), а не из нового `date`: иначе у полуночи UTC возможна гонка.
backup_ts=${name#twomc-}; backup_ts=${backup_ts%%-*}
backup_dow=$(date -u -d "${backup_ts:0:4}-${backup_ts:4:2}-${backup_ts:6:2}" +%u 2>/dev/null || true)
if [[ "$BACKUP_TAG" == "scheduled" && "$backup_dow" == "$BACKUP_WEEKLY_DAY" ]]; then
  weekly_name="${name%-scheduled}-weekly"
  if weekly_copy "$final" "$BACKUP_DIR/$weekly_name"; then
    echo "Недельная копия: $BACKUP_DIR/$weekly_name"
  else
    echo "ОШИБКА: не удалось создать недельную копию $weekly_name; ежедневная сохранена, выход будет ненулевым (5)" >&2
    rotate_failed=1
  fi
fi

# Ротация локальных копий по уровням (scheduled/weekly/predeploy и текущая прочая метка), см. rotate_tag.
rotate_all "$BACKUP_DIR" "$BACKUP_TAG"

if (( rotate_failed == 1 && rc == 0 )); then rc=5; fi
exit "$rc"
