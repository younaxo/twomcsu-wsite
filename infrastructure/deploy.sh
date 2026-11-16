#!/usr/bin/env bash
# Production-деплой twomc.su на сервере (запускать из корня checkout на сервере).
#   infrastructure/deploy.sh            # деплой текущего main
#   infrastructure/deploy.sh rollback   # вернуть предыдущий релиз (только образы, схема БД не откатывается)
#
# Шаги: проверка чистого main → pre-flight health текущего релиза → скан деструктивных миграций →
# build образов с тегом git sha → снимок БД (pg_dump) → prisma migrate deploy (production-safe,
# без migrate dev / db push) → переключение контейнеров → health check → ТОЛЬКО ПОСЛЕ УСПЕХА запись
# RELEASE в .release / .release.prev → очистка старых тегов образов.
#
# Порядок «снимок → миграция → переключение → health» и правило expand/contract: ADR-0158, docs/runbooks/deploy.md.
#
# Переменные окружения (все необязательные):
#   PREDEPLOY_BACKUP_DIR  каталог снимков БД, вне репозитория (по умолчанию $HOME/twomc-backups/predeploy)
#   PREDEPLOY_BACKUP_KEEP сколько последних снимков хранить: целое >= 1 (по умолчанию 7); иначе выход до снимка
#   KEEP_RELEASES         сколько последних тегов образов api/web хранить (по умолчанию 3, минимум 2)
#   API_PORT, WEB_PORT    порты на 127.0.0.1 (4000 / 3000)
#   HEALTH_TRIES, HEALTH_INTERVAL  число попыток и пауза в секундах (20 / 3)
#   PREFLIGHT_TRIES       число попыток pre-flight проверки текущего релиза (3)
#   SKIP_PREFLIGHT=1      пропустить pre-flight (hotfix при уже неработающем релизе), с предупреждением
#   ALLOW_DESTRUCTIVE_MIGRATION=1  разрешить DROP TABLE/COLUMN/CONSTRAINT/INDEX, RENAME, SET NOT NULL, ALTER COLUMN TYPE, TRUNCATE в новых
#                         миграциях (только с одобрением владельца и проверенным свежим снимком)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose --env-file .env -f infrastructure/docker-compose.prod.yml)

API_HEALTH_URL="http://127.0.0.1:${API_PORT:-4000}/health"
WEB_HEALTH_URL="http://127.0.0.1:${WEB_PORT:-3000}/"
HEALTH_TRIES=${HEALTH_TRIES:-20}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-3}
PREFLIGHT_TRIES=${PREFLIGHT_TRIES:-3}
KEEP_RELEASES=${KEEP_RELEASES:-3}
PREDEPLOY_BACKUP_DIR=${PREDEPLOY_BACKUP_DIR:-$HOME/twomc-backups/predeploy}
PREDEPLOY_BACKUP_KEEP=${PREDEPLOY_BACKUP_KEEP:-7}
MIGRATIONS_DIR=apps/api/prisma/migrations

health() {
  local url=$1 tries=${2:-$HEALTH_TRIES}
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -m 5 "$url" >/dev/null; then return 0; fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

# Обе проверки обязательны; провал любой даёт ненулевой код (без зависимости от set -e в &&-цепочках).
health_all() {
  local tries=${1:-$HEALTH_TRIES}
  health "$API_HEALTH_URL" "$tries" || { echo "Health check не прошёл: api ($API_HEALTH_URL)"; return 1; }
  health "$WEB_HEALTH_URL" "$tries" || { echo "Health check не прошёл: web ($WEB_HEALTH_URL)"; return 1; }
  return 0
}

# Откат образов. Схема БД НЕ откатывается (см. docs/runbooks/deploy.md).
#   rollback_release         ручной откат: цель .release.prev, после успеха .release.prev → .release
#   rollback_release <sha>   автооткат во время деплоя: цель <sha> (прежний .release), маркеры не трогаются
rollback_release() {
  local prev manual=0
  if [[ $# -ge 1 ]]; then
    prev=$1
  else
    manual=1
    if [[ ! -f .release.prev ]]; then
      echo "Откат невозможен: нет предыдущего релиза (.release.prev) — это первый деплой."
      echo "Текущий релиз остаётся запущенным и может быть неработоспособным: остановите/почините вручную (docs/runbooks/deploy.md)."
      return 1
    fi
    prev=$(cat .release.prev) || { echo "Откат НЕ выполнен: не удалось прочитать .release.prev"; return 1; }
  fi
  if [[ -z "$prev" ]]; then
    echo "Откат невозможен: нет предыдущего релиза — это первый деплой."
    echo "Текущий релиз остаётся запущенным и может быть неработоспособным: остановите/почините вручную (docs/runbooks/deploy.md)."
    return 1
  fi
  echo "Откат образов на $prev"
  RELEASE=$prev "${COMPOSE[@]}" up -d --no-build api web || { echo "Откат НЕ выполнен: docker compose up завершился с ошибкой"; return 1; }
  health_all || { echo "Откат НЕ выполнен: релиз $prev не прошёл health check, нужно ручное вмешательство"; return 1; }
  if (( manual )); then
    mv .release.prev .release || { echo "Образы откатены на $prev и здоровы, но маркер .release не обновлён (mv не удался): поправьте .release вручную"; return 1; }
  fi
  echo "Откат образов выполнен: $prev (схема БД откатом не менялась)"
  return 0
}

# Маркеры релиза пишутся ТОЛЬКО после успешного health. Повторный деплой того же sha не затирает .release.prev.
write_release_markers() {
  if [[ -n "$PREV_RELEASE" && "$PREV_RELEASE" != "$RELEASE" ]]; then
    { echo "$PREV_RELEASE" > .release.prev.tmp && mv .release.prev.tmp .release.prev; } \
      || { echo "Не удалось записать .release.prev"; return 1; }
  elif [[ -z "$PREV_RELEASE" ]]; then
    rm -f .release.prev   # первый деплой: устаревший .release.prev не должен вводить в заблуждение
  fi
  { echo "$RELEASE" > .release.tmp && mv .release.tmp .release; } || { echo "Не удалось записать .release"; return 1; }
  return 0
}

# Снимок БД перед миграцией. Любая ошибка останавливает деплой (возврат 1).
snapshot_db() {
  local dir=$PREDEPLOY_BACKUP_DIR repo_root file tmp real home_real
  repo_root=$(pwd -P)
  # Каталог снимков (ПДн): не symlink; не общий каталог ($HOME, /, /tmp); не внутри репозитория. chmod 700 — только после всех проверок.
  [[ ! -L "$dir" ]] || { echo "PREDEPLOY_BACKUP_DIR — символическая ссылка: запрещено (chmod пошёл бы по ссылке)"; return 1; }
  ( umask 077; mkdir -p "$dir" ) || { echo "Не удалось создать каталог снимков"; return 1; }
  real=$(cd "$dir" && pwd -P) || { echo "Не удалось определить путь каталога снимков"; return 1; }
  home_real=$(cd "${HOME:-/}" 2>/dev/null && pwd -P || echo /)
  case "$real" in
    /|/tmp|"$home_real") echo "PREDEPLOY_BACKUP_DIR указывает на общий каталог ($real) — запрещено, нужен выделенный подкаталог"; return 1 ;;
  esac
  case "$real/" in
    "$repo_root"/*) echo "PREDEPLOY_BACKUP_DIR внутри репозитория — запрещено (снимок содержит ПДн)"; return 1 ;;
  esac
  chmod 700 "$real" || { echo "Не удалось выставить права 700 на каталог снимков"; return 1; }
  file="$dir/twomc-${RELEASE}-$(date +%Y%m%dT%H%M%S).dump"
  tmp="$file.partial"
  echo "→ снимок БД → $file"
  # umask 077: файл доступен только владельцу. Креды берутся из окружения контейнера postgres.
  # shellcheck disable=SC2016  # $POSTGRES_* раскрываются внутри контейнера, а не на хосте
  if ! ( umask 077; "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp" ); then
    rm -f "$tmp"
    echo "Снимок БД не удался (pg_dump) — деплой остановлен, миграции не применялись"
    return 1
  fi
  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    echo "Снимок БД пуст — деплой остановлен, миграции не применялись"
    return 1
  fi
  if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$tmp" >/dev/null; then
    rm -f "$tmp"
    echo "Снимок БД не читается (pg_restore --list) — деплой остановлен, миграции не применялись"
    return 1
  fi
  mv "$tmp" "$file"
  chmod 600 "$file"
  echo "Снимок сохранён: $file"
  # Ротация: только что созданный снимок исключён из удаления; среди остальных остаётся KEEP-1 новейших.
  # `|| true`: если старых снимков нет, grep -v возвращает 1, что при pipefail не должно ронять деплой.
  # shellcheck disable=SC2012
  ls -1t "$dir"/twomc-*.dump 2>/dev/null | { grep -vxF -- "$file" || true; } \
    | tail -n +"$PREDEPLOY_BACKUP_KEEP" | while IFS= read -r old; do rm -f -- "$old"; done
  return 0
}

# Оставить KEEP_RELEASES последних тегов twomc-api/twomc-web (+ текущий и .release.prev), остальные удалить.
prune_old_tags() {
  local keep=$KEEP_RELEASES repo protect tag
  if ! [[ "$keep" =~ ^[0-9]+$ ]] || (( keep < 2 )); then
    echo "KEEP_RELEASES='$keep' некорректно (нужно число не меньше 2) — очистка образов пропущена"
    return 0
  fi
  protect=" $RELEASE "
  if [[ -f .release.prev ]]; then protect+="$(cat .release.prev) "; fi
  if [[ -n "${PREV_RELEASE:-}" ]]; then protect+="$PREV_RELEASE "; fi
  for repo in twomc-api twomc-web; do
    # Новые теги первыми; <none> и latest не трогаем. `|| true`: grep -v без совпадений даёт 1 (pipefail).
    docker image ls "$repo" --format '{{.CreatedAt}}|{{.Tag}}' 2>/dev/null | sort -r | cut -d'|' -f2 \
      | { grep -v -e '^<none>$' -e '^latest$' || true; } | tail -n +"$((keep + 1))" | while IFS= read -r tag; do
        if [[ "$protect" == *" $tag "* ]]; then continue; fi
        docker image rm "$repo:$tag" >/dev/null 2>&1 || echo "Не удалось удалить $repo:$tag (используется?) — пропущено"
      done
  done
  return 0
}

# Скан миграций, добавленных между прежним релизом и HEAD, на деструктивные операции.
# Возврат 1 — найдено или проверить не удалось (fail closed).
check_destructive_migrations() {
  local base=$1 files f hits found=0
  if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    echo "Не удалось определить диапазон миграций: коммит $base (из .release) неизвестен git"
    return 1
  fi
  files=$(git diff --name-only --diff-filter=ACMR "$base" HEAD -- "$MIGRATIONS_DIR") \
    || { echo "git diff по миграциям не удался"; return 1; }
  while IFS= read -r f; do
    [[ "$f" == */migration.sql ]] || continue
    # Комментарии убираем, строки склеиваем, делим по «;» — проверка по операторам, а не по строкам.
    # ALTER TABLE ... DROP <имя> (без слова COLUMN) тоже деструктивно; безопасные DROP DEFAULT/NOT NULL/IDENTITY/EXPRESSION вырезаются до скана.
    hits=$(git show "HEAD:$f" | sed 's/--.*$//' | tr '\n' ' ' | tr ';' '\n' \
      | sed -E 's/DROP[[:space:]]+(DEFAULT|NOT[[:space:]]+NULL|IDENTITY|EXPRESSION)//Ig' \
      | grep -Eiw -e 'DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX)' -e 'ALTER[[:space:]]+TABLE.*[[:space:]]DROP[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?["A-Za-z_].*' -e 'RENAME' -e 'TRUNCATE'           -e 'SET[[:space:]]+NOT[[:space:]]+NULL' \
          -e 'ALTER[[:space:]]+COLUMN[[:space:]]+[^[:space:]]+[[:space:]]+(SET[[:space:]]+DATA[[:space:]]+)?TYPE' || true)
    if [[ -n "$hits" ]]; then
      echo "Деструктивная миграция: $f"
      printf '%s\n' "$hits" | sed 's/^[[:space:]]*/    /' | cut -c1-200
      found=1
    fi
  done <<< "$files"
  (( found == 0 ))
}

if [[ "${1:-}" == "rollback" ]]; then
  rollback_release || exit 1
  exit 0
fi

[[ -f .env ]] || { echo ".env отсутствует — заполните по .env.example"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Рабочая директория не чистая — деплой только из закоммиченного main"; exit 1; }
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" == "main" ]] || { echo "Деплой только из main (сейчас: $BRANCH)"; exit 1; }
git pull --ff-only
RELEASE=$(git rev-parse --short HEAD)
export RELEASE
echo "Релиз $RELEASE"

# PREDEPLOY_BACKUP_KEEP: целое >= 1. Проверка до любых действий над БД: иначе ротация могла бы удалить свежий снимок.
if ! [[ "$PREDEPLOY_BACKUP_KEEP" =~ ^[0-9]+$ ]] || (( 10#$PREDEPLOY_BACKUP_KEEP < 1 )); then
  echo "PREDEPLOY_BACKUP_KEEP='$PREDEPLOY_BACKUP_KEEP' некорректно (нужно целое число не меньше 1) — деплой остановлен до снимка"
  exit 1
fi
PREDEPLOY_BACKUP_KEEP=$((10#$PREDEPLOY_BACKUP_KEEP))

# Прежний релиз = содержимое .release (до успешного health оно не перезаписывается).
PREV_RELEASE=""
if [[ -f .release ]]; then PREV_RELEASE=$(cat .release) || { echo "Не удалось прочитать .release"; exit 1; }; fi

# Pre-flight: текущий релиз должен быть здоров, иначе автооткат на него бессмыслен.
if [[ -z "$PREV_RELEASE" ]]; then
  echo "Pre-flight пропущен: прежнего релиза нет (первый деплой)"
elif [[ "${SKIP_PREFLIGHT:-}" == "1" ]]; then
  echo "ПРЕДУПРЕЖДЕНИЕ: SKIP_PREFLIGHT=1 — health текущего релиза $PREV_RELEASE не проверяется (hotfix)"
else
  echo "→ pre-flight health текущего релиза $PREV_RELEASE"
  health_all "$PREFLIGHT_TRIES" || { echo "Текущий релиз не здоров — деплой остановлен до снимка и миграций. Для hotfix: SKIP_PREFLIGHT=1"; exit 1; }
fi

# Деструктивные миграции требуют отдельного решения владельца (expand/contract, ADR-0158).
if [[ -z "$PREV_RELEASE" ]]; then
  echo "Скан миграций пропущен: прежнего релиза нет (первый деплой)"
elif ! check_destructive_migrations "$PREV_RELEASE"; then
  if [[ "${ALLOW_DESTRUCTIVE_MIGRATION:-}" == "1" ]]; then
    echo "ПРЕДУПРЕЖДЕНИЕ: ALLOW_DESTRUCTIVE_MIGRATION=1 — деструктивные миграции разрешены вручную; нужны свежий снимок и одобрение владельца"
  else
    echo "Деплой остановлен до снимка и миграций. Нужны одобрение владельца и ALLOW_DESTRUCTIVE_MIGRATION=1 (docs/runbooks/deploy.md)"
    exit 1
  fi
fi

echo "→ build образов"
"${COMPOSE[@]}" build api web

echo "→ инфраструктура (postgres, redis)"
"${COMPOSE[@]}" up -d postgres redis

# Снимок ДО миграции: при провале деплой останавливается, миграции не применяются.
snapshot_db || exit 1

# Миграции должны быть обратно совместимы с предыдущим релизом (expand/contract, ADR-0158).
echo "→ миграции (prisma migrate deploy)"
"${COMPOSE[@]}" run --rm --no-deps api sh -c "cd /app/apps/api && npx prisma migrate deploy" \
  || { echo "Миграции не применены — деплой остановлен, приложения не переключались. При частично применённой схеме см. runbook (восстановление из снимка)"; exit 1; }

echo "→ переключение приложений"
# Маркеры .release/.release.prev здесь НЕ пишутся: только после успешного health (иначе провал оставил бы их неверными).
"${COMPOSE[@]}" up -d api web || { echo "docker compose up завершился с ошибкой — откат"; rollback_release "$PREV_RELEASE" || echo "Автооткат не выполнен"; exit 1; }

echo "→ health check"
if health_all; then
  write_release_markers || { echo "Деплой $RELEASE здоров, но маркеры релиза не записаны — исправьте .release вручную"; exit 1; }
  echo "Деплой $RELEASE успешен"
  prune_old_tags
else
  echo "Релиз $RELEASE не прошёл health check — откат образов"
  rollback_release "$PREV_RELEASE" || echo "Автооткат не выполнен — деплой $RELEASE НЕ успешен"
  exit 1
fi
