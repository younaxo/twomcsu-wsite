#!/usr/bin/env bash
# Выкладка/обновление мини-выкладки розыгрыша С МАШИНЫ АГЕНТА на VDS (по ssh). Запускать из корня репозитория.
# Выкладывается ТОЛЬКО закоммитченное состояние выбранного коммита (git archive): без .env*, без неотслеживаемых файлов,
# без секретов. Секреты уже лежат на сервере (setup-server.sh) и сюда не передаются и не выводятся.
#
# Параметры подключения - переменные окружения (в репозитории их нет):
#   GIVEAWAY_VDS_HOST   адрес сервера (обязательно)
#   GIVEAWAY_VDS_USER   пользователь развёртывания без root (обязательно)
#   GIVEAWAY_VDS_KEY    путь к приватному SSH-ключу ВНЕ репозитория (обязательно; файл скрипт не читает, только передаёт ssh)
#   GIVEAWAY_VDS_PORT   порт ssh (по умолчанию 22)
#   GIVEAWAY_REMOTE_BASE каталог на сервере (по умолчанию /srv/twomc-giveaway)
#   GIVEAWAY_DOMAIN     домен для проверки https (по умолчанию giveaway.twomc.su)
# Проверка хоста: StrictHostKeyChecking=yes. Первый раз добавьте отпечаток в known_hosts, сверив его с владельцем
# (ssh-keyscan -p PORT HOST > файл; ssh-keygen -lf файл; сравнить; затем дописать в ~/.ssh/known_hosts).
#
# Использование:
#   giveaway/deploy/deploy.sh [--rev <коммит>] [--skip-migrate] [--dry-run]
#   giveaway/deploy/deploy.sh --rollback-to <sha>     откат на ранее собранный релиз (образ twomc-giveaway-api:<sha> должен быть)
#
# Порядок: git archive -> сервер -> compose config -> build api -> up postgres/redis -> проверка DATABASE_URL (только БД
# мини-выкладки) -> бэкап (если уже есть релиз) -> миграции профилем ops -> up api nginx -> healthcheck -> при провале
# автоматический возврат на предыдущий релиз. Миграции НЕ откатываются (схема расширяющая, предыдущий образ совместим);
# откат данных - только из бэкапа (RUNBOOK п.8).
set -euo pipefail

REV="HEAD"
SKIP_MIGRATE=0
DRY=0
ROLLBACK_TO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rev) REV="${2:-}"; shift 2 ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --rollback-to) ROLLBACK_TO="${2:-}"; shift 2 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
  esac
done

: "${GIVEAWAY_VDS_HOST:?задайте GIVEAWAY_VDS_HOST}"
: "${GIVEAWAY_VDS_USER:?задайте GIVEAWAY_VDS_USER}"
: "${GIVEAWAY_VDS_KEY:?задайте GIVEAWAY_VDS_KEY (путь к ключу вне репозитория)}"
PORT="${GIVEAWAY_VDS_PORT:-22}"
BASE="${GIVEAWAY_REMOTE_BASE:-/srv/twomc-giveaway}"
DOMAIN="${GIVEAWAY_DOMAIN:-giveaway.twomc.su}"
[ -f "$GIVEAWAY_VDS_KEY" ] || { echo "Ключ не найден по пути GIVEAWAY_VDS_KEY" >&2; exit 2; }
[[ "$GIVEAWAY_VDS_USER" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] || { echo "GIVEAWAY_VDS_USER: недопустимое имя" >&2; exit 2; }
[[ "$GIVEAWAY_VDS_USER" != "root" ]] || { echo "Выкладка под root запрещена" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] || { echo "GIVEAWAY_VDS_PORT: число" >&2; exit 2; }
[[ "$BASE" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "GIVEAWAY_REMOTE_BASE: недопустимый путь" >&2; exit 2; }
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { echo "GIVEAWAY_DOMAIN: недопустимое значение" >&2; exit 2; }

SSH=(ssh -i "$GIVEAWAY_VDS_KEY" -p "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o ConnectTimeout=15 -o ServerAliveInterval=15 "${GIVEAWAY_VDS_USER}@${GIVEAWAY_VDS_HOST}")

# Удалённая часть: на stdin ssh, аргументы: режим sha prev_skip_migrate base domain.
remote_script() {
  cat << 'REMOTE'
set -uo pipefail
MODE="$1"; SHA="$2"; SKIP_MIGRATE="$3"; BASE="$4"; DOMAIN="$5"
DIR="$BASE/releases/$SHA"
SECRETS="$BASE/secrets"
STATE="$BASE/state"
mkdir -p "$STATE"
log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy][ОШИБКА] %s\n' "$*" >&2; }
# stdin docker-команд ВСЕГДА /dev/null: иначе они съедят остаток скрипта, читаемого bash -s из stdin.
C() { local rel="$1" sha="$2"; shift 2; ( RELEASE="$sha" docker compose -f "$rel/giveaway/deploy/docker-compose.yml" "$@" < /dev/null ); }

[ -d "$DIR" ] || { fail "нет каталога релиза $DIR"; exit 1; }
PREV="$(cat "$STATE/current_release" 2>/dev/null || true)"
[ "$PREV" = "$SHA" ] && PREV="$(cat "$STATE/previous_release" 2>/dev/null || true)"

rollback() {
  if [ -n "$PREV" ] && [ -d "$BASE/releases/$PREV" ] && docker image inspect "twomc-giveaway-api:$PREV" > /dev/null 2>&1 < /dev/null; then
    log "ОТКАТ на релиз $PREV (образы теги; миграции не откатываются)"
    C "$BASE/releases/$PREV" "$PREV" up -d api nginx || fail "откат тоже не удался: проверьте вручную (docker compose ps/logs)"
  else
    log "предыдущего релиза нет: останавливаю api и nginx (тома остаются)"
    C "$DIR" "$SHA" stop nginx api || true
  fi
}

wait_healthy() {  # контейнер, секунды
  local n="$1" t="$2" i s
  for i in $(seq 1 "$t"); do
    s="$(docker inspect -f '{{.State.Health.Status}}' "$n" 2> /dev/null || echo none)"
    [ "$s" = "healthy" ] && return 0
    sleep 1
  done
  return 1
}

if [ "$MODE" = "rollback" ]; then
  docker image inspect "twomc-giveaway-api:$SHA" > /dev/null 2>&1 || { fail "образа twomc-giveaway-api:$SHA нет"; exit 1; }
  C "$DIR" "$SHA" config -q || exit 1
  C "$DIR" "$SHA" up -d api nginx || exit 1
  wait_healthy twomc-giveaway-api 90 || { fail "api не healthy после отката"; exit 1; }
  CUR="$(cat "$STATE/current_release" 2>/dev/null || true)"
  [ -z "$CUR" ] || echo "$CUR" > "$STATE/previous_release"
  echo "$SHA" > "$STATE/current_release"
  log "откат на $SHA выполнен"
  exit 0
fi

# --- Предпроверки (без вывода секретов) ---
[ -f "$SECRETS/api.env" ] && [ -f "$SECRETS/postgres.env" ] && [ -f "$SECRETS/redis.env" ] || { fail "нет env-файлов в $SECRETS (setup-server.sh)"; exit 1; }
[ "$(stat -c '%a' "$SECRETS/api.env")" = "600" ] || { fail "api.env должен быть 600"; exit 1; }
grep -Eq '^DATABASE_URL=postgres(ql)?://[^@]+@postgres:5432/giveaway(\?|$)' "$SECRETS/api.env" \
  || { fail "DATABASE_URL должен указывать на контейнер postgres мини-выкладки (@postgres:5432/giveaway); стоп"; exit 1; }
grep -q '^GIVEAWAY_ONLY=true' "$SECRETS/api.env" || { fail "в api.env нет GIVEAWAY_ONLY=true; стоп"; exit 1; }
[ -s "$BASE/certs/fullchain.pem" ] && [ -s "$BASE/certs/privkey.pem" ] || { fail "нет сертификатов в $BASE/certs (setup-server.sh issue-cert)"; exit 1; }

log "релиз $SHA, предыдущий: ${PREV:-нет}"
C "$DIR" "$SHA" config -q || { fail "compose config не прошёл"; exit 1; }

log "сборка образа api"
C "$DIR" "$SHA" build api || { fail "сборка не удалась (прод не тронут)"; exit 1; }

log "postgres и redis"
C "$DIR" "$SHA" up -d postgres redis || { fail "не поднялись postgres/redis"; exit 1; }
wait_healthy twomc-giveaway-postgres 60 || { fail "postgres не healthy"; exit 1; }
wait_healthy twomc-giveaway-redis 60 || { fail "redis не healthy"; exit 1; }

if [ -n "$PREV" ] && [ -x /usr/local/sbin/twomc-giveaway-backup ]; then
  log "бэкап перед миграциями"
  /usr/local/sbin/twomc-giveaway-backup < /dev/null || { fail "бэкап не удался; миграции не применяются"; exit 1; }
fi

if [ "$SKIP_MIGRATE" != "1" ]; then
  log "миграции (профиль ops, БД мини-выкладки)"
  C "$DIR" "$SHA" --profile ops run --rm -T migrate || { fail "миграции не прошли; приложение не переключено, предыдущий релиз продолжает работать"; exit 1; }
fi

log "up api nginx"
C "$DIR" "$SHA" up -d api nginx || { fail "up не удался"; rollback; exit 1; }
if ! wait_healthy twomc-giveaway-api 120; then
  fail "api не стал healthy; последние строки лога (без секретов не гарантируются - смотрите осторожно):"
  docker logs --tail=30 twomc-giveaway-api 2>&1 < /dev/null | sed -E 's/(PASSWORD|SECRET|KEY)=[^ ]*/\1=<скрыто>/g' >&2
  rollback; exit 1
fi
docker exec twomc-giveaway-nginx wget -qO- http://api:4000/health > /dev/null 2>&1 < /dev/null || { fail "nginx не достучался до api"; rollback; exit 1; }
sleep 2
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" -X POST "https://${DOMAIN}/api/giveaway/v1/events" || echo 000)"
case "$code" in
  400 | 401 | 503) log "приёмник отвечает: HTTP $code (ожидаемо без подписи; 503 - розыгрыш выключен)" ;;
  *) fail "неожиданный ответ приёмника: HTTP $code"; rollback; exit 1 ;;
esac
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/health" || echo 000)"
[ "$code" = "404" ] || { fail "/health снаружи должен быть закрыт (404), получено $code"; rollback; exit 1; }

[ -z "$PREV" ] || echo "$PREV" > "$STATE/previous_release"
echo "$SHA" > "$STATE/current_release"
log "готово: релиз $SHA"
C "$DIR" "$SHA" ps
REMOTE
}

if ! git rev-parse --git-dir > /dev/null 2>&1; then echo "Запускайте из репозитория" >&2; exit 2; fi

if [ -n "$ROLLBACK_TO" ]; then
  [[ "$ROLLBACK_TO" =~ ^[0-9a-f]{7,40}$ ]] || { echo "--rollback-to: sha коммита" >&2; exit 2; }
  SHA="$ROLLBACK_TO"
  echo "Откат на $SHA на ${GIVEAWAY_VDS_HOST}"
  [ "$DRY" -eq 1 ] && { echo "[dry-run] ssh ... bash -s rollback $SHA"; exit 0; }
  remote_script | "${SSH[@]}" bash -s -- rollback "$SHA" 0 "$BASE" "$DOMAIN"
  exit $?
fi

FULL="$(git rev-parse --verify "${REV}^{commit}")"
SHA="$(git rev-parse --short=10 "$FULL")"
PATHS=(pnpm-lock.yaml pnpm-workspace.yaml package.json apps/api apps/web/package.json packages/shared
  infrastructure/api.Dockerfile .dockerignore giveaway/deploy)
echo "Коммит: $FULL (релиз $SHA)"
echo "Состав архива: ${PATHS[*]} (только отслеживаемые файлы; .env*/секреты исключены)"
if git status --porcelain -- "${PATHS[@]}" 2> /dev/null | grep -q .; then
  echo "Предупреждение: есть незакоммиченные изменения в этих путях; они НЕ попадут в выкладку (берётся коммит $SHA)." >&2
fi
ENVF="$(git ls-tree -r --name-only "$FULL" -- "${PATHS[@]}" | grep -E '(^|/)[^/]*\.env(\.[^/]*)?$' | grep -v '\.example$' || true)"
[ -z "$ENVF" ] || { echo "В архиве оказались env-файлы (не .example), стоп:" >&2; echo "$ENVF" >&2; exit 1; }
if [ "$DRY" -eq 1 ]; then
  echo "[dry-run] git archive $SHA | ssh tar -x в $BASE/releases/$SHA; затем remote deploy (build, migrate=$((1 - SKIP_MIGRATE)), up, healthcheck, откат при сбое)"
  exit 0
fi

echo "Загрузка релиза $SHA"
"${SSH[@]}" "mkdir -p '$BASE/releases/$SHA' '$BASE/state'"
git archive --format=tar "$FULL" -- "${PATHS[@]}" \
  | "${SSH[@]}" "tar -x -C '$BASE/releases/$SHA' --no-same-owner --exclude='.env' --exclude='.env.*' --exclude='*.pem' --exclude='*.key'"
remote_script | "${SSH[@]}" bash -s -- deploy "$SHA" "$SKIP_MIGRATE" "$BASE" "$DOMAIN"
