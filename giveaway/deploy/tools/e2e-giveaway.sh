#!/usr/bin/env bash
# Запуск e2e конкурентности выдачи билетов (apps/api/test/giveaway-concurrency.e2e-spec.ts) НА VDS на ОДНОРАЗОВОЙ БД.
# Не трогает БД мини-выкладки: поднимает временный postgres:16-alpine (данные в tmpfs, пароль случайный, порты не публикуются)
# во временной docker-сети, применяет миграции, запускает один spec и удаляет контейнер/сеть/рабочую копию.
# Нужен каталог релиза (его кладёт deploy.sh: $BASE/releases/<sha>, там есть apps/api/test).
# Память: ~1 ГБ на pnpm install + ts-jest; остановите тестовый Minecraft-сервер на время прогона (на VDS мало ОЗУ).
# Нужен доступ в интернет (pnpm install, движки Prisma). Секреты мини-выкладки не используются и не выводятся.
#
#   e2e-giveaway.sh /srv/twomc-giveaway/releases/<sha>
set -euo pipefail

REL="${1:-}"
[ -d "$REL/apps/api/test" ] || { echo "Использование: $0 <каталог релиза с apps/api/test>" >&2; exit 2; }
BASE="${GIVEAWAY_REMOTE_BASE:-/srv/twomc-giveaway}"
RUN="gw-e2e-$$"
WORK="$BASE/state/$RUN"
PGPASS="$(openssl rand -hex 16 | tr -d '[:space:]')"

cleanup() {
  docker rm -f "${RUN}-pg" > /dev/null 2>&1 || true
  docker network rm "${RUN}-net" > /dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK"
cp -a "$REL/." "$WORK/"
docker network create "${RUN}-net" > /dev/null
docker run -d --name "${RUN}-pg" --network "${RUN}-net" --memory 256m --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=e2e -e POSTGRES_DB=e2e -e "POSTGRES_PASSWORD=${PGPASS}" postgres:16-alpine > /dev/null
for _ in $(seq 1 30); do
  docker exec "${RUN}-pg" pg_isready -U e2e -d e2e > /dev/null 2>&1 && break
  sleep 1
done
docker exec "${RUN}-pg" pg_isready -U e2e -d e2e > /dev/null || { echo "временный postgres не поднялся" >&2; exit 1; }

echo "[e2e] установка зависимостей, миграции и spec (может занять несколько минут)"
set +e
docker run --rm --network "${RUN}-net" --memory 1200m -v "$WORK:/app" -w /app \
  -e CI=true -e "DATABASE_URL=postgresql://e2e:${PGPASS}@${RUN}-pg:5432/e2e?schema=public" \
  -e "HOST_UID=$(id -u)" -e "HOST_GID=$(id -g)" node:20-alpine sh -c '
    apk add --no-cache openssl > /dev/null &&
    corepack enable && corepack prepare pnpm@9.15.9 --activate &&
    pnpm install --frozen-lockfile --filter @twomc/api... --filter @twomc/shared... &&
    pnpm --filter @twomc/shared run build &&
    cd apps/api &&
    node_modules/.bin/prisma migrate deploy &&
    node_modules/.bin/jest --config ./test/jest-e2e.json --runInBand giveaway-concurrency
    rc=$?
    chown -R "$HOST_UID:$HOST_GID" /app
    exit $rc'
RC=$?
set -e
echo "[e2e] код выхода: $RC (0 = все сценарии конкурентности прошли)"
exit "$RC"
