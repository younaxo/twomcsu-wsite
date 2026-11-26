#!/usr/bin/env bash
# Задание api-e2e: ОДНОРАЗОВЫЕ postgres+redis (уникальные имена, отдельная сеть, tmpfs, без публикации портов),
# pnpm install, prisma migrate deploy, seed ролей/прав, jest e2e (как в CI). Всё удаляется по выходу.
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
export JOB_NET="twomcr-$id-net"
PGC="twomcr-$id-pg"; RDC="twomcr-$id-redis"
PGPASS="$(head -c18 /dev/urandom | od -An -tx1 | tr -d ' \n')"
trap 'docker_cleanup_job "$id"; echo "одноразовые postgres/redis/сеть удалены"' EXIT
docker network create --label "twomc-runner-job=$id" "$JOB_NET" >/dev/null || exit 20
docker run -d --name "$PGC" --label "twomc-runner-job=$id" --network "$JOB_NET" --network-alias pg \
  --cpus 1 --memory "$PG_MEM" --cpu-shares "$CPU_SHARES" --tmpfs /var/lib/postgresql/data:rw,size=1g \
  -e POSTGRES_USER=twomc -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB=twomc \
  "$PG_IMAGE" -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=200 >/dev/null || exit 21
docker run -d --name "$RDC" --label "twomc-runner-job=$id" --network "$JOB_NET" --network-alias redis \
  --cpus 0.5 --memory "$REDIS_MEM" --cpu-shares "$CPU_SHARES" "$REDIS_IMAGE" --save "" --appendonly no >/dev/null || exit 22
ready=0
for _ in $(seq 1 60); do
  if docker exec "$PGC" pg_isready -U twomc -d twomc >/dev/null 2>&1 && docker exec "$RDC" redis-cli ping 2>/dev/null | grep -q PONG; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo "postgres/redis не готовы за 60 с"; exit 23; }
echo "postgres+redis готовы (контейнеры $PGC, $RDC, сеть $JOB_NET)"
inner="$dir/inner.sh"
{ node_prelude; cat <<'IN'
rnd() { head -c24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
export REDIS_HOST=redis REDIS_PORT=6379 REDIS_PASSWORD= TURNSTILE_DISABLED=true
export JWT_ACCESS_SECRET="$(rnd)e2e-access" JWT_REFRESH_SECRET="$(rnd)e2e-refresh" TWO_FACTOR_ENCRYPTION_KEY="$(rnd)e2e-2fa"
export DATABASE_URL="postgresql://twomc:${PGPASS}@pg:5432/twomc"
step() { local name="$1"; shift; echo; echo "##### $name"; local t=$SECONDS; "$@"; local rc=$?; echo "##### $name rc=$rc ($((SECONDS-t))s)"; return $rc; }
step install pnpm install --frozen-lockfile || exit 10
cd apps/api
step prisma-validate pnpm exec prisma validate || exit 11
step prisma-migrate-deploy pnpm exec prisma migrate deploy || exit 12
step prisma-seed pnpm exec prisma db seed || exit 13
# Скрипт test:e2e берётся из package.json; в первый (параллельный) вызов jest добавляется --maxWorkers=3: без ограничения воркеры
# (по числу ядер хоста) упираются в лимит памяти контейнера и убиваются OOM (SIGKILL).
E2E_CMD="$(node -p "require('./package.json').scripts['test:e2e']")"
E2E_CMD="${E2E_CMD//--testPathIgnorePatterns two-factor/--testPathIgnorePatterns two-factor --maxWorkers=3}"
echo "e2e: $E2E_CMD"
step jest-e2e pnpm exec bash -c "$E2E_CMD" || exit 14
IN
} > "$inner"
run_node "$id" "$src" "$JOB_MEM" "$inner" -e "PGPASS=$PGPASS"
