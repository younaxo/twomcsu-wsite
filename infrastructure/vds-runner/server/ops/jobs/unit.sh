#!/usr/bin/env bash
# Задание unit: pnpm install --frozen-lockfile, tsc (typecheck всех пакетов), jest api, vitest web.
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
inner="$dir/inner.sh"
{ node_prelude; cat <<'IN'
rnd() { head -c24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
export DATABASE_URL=postgresql://u:p@127.0.0.1:5432/unused REDIS_HOST=127.0.0.1 REDIS_PORT=6379 REDIS_PASSWORD= TURNSTILE_DISABLED=true
export JWT_ACCESS_SECRET="$(rnd)unit-access" JWT_REFRESH_SECRET="$(rnd)unit-refresh" TWO_FACTOR_ENCRYPTION_KEY="$(rnd)unit-2fa"
step() { local name="$1"; shift; echo; echo "##### $name"; local t=$SECONDS; "$@"; local rc=$?; echo "##### $name rc=$rc ($((SECONDS-t))s)"; return $rc; }
rc=0
step install pnpm install --frozen-lockfile || exit 10
step typecheck pnpm -r --if-present run typecheck || rc=11
step jest-api pnpm --filter @twomc/api run test --maxWorkers=3 || rc=12
step vitest-web pnpm --filter @twomc/web run test || rc=13
exit $rc
IN
} > "$inner"
run_node "$id" "$src" "$JOB_MEM" "$inner"
