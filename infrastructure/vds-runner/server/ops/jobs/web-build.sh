#!/usr/bin/env bash
# Задание web-build: pnpm install --frozen-lockfile и next build (с зависимостями workspace).
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
inner="$dir/inner.sh"
{ node_prelude; cat <<'IN'
export NODE_OPTIONS=--max-old-space-size=6144
echo "##### install"; pnpm install --frozen-lockfile || exit 10
echo "##### web-build"; pnpm --filter "@twomc/web..." run build || exit 11
echo "##### web-build rc=0"
echo "build-ok: $(du -sm apps/web/.next | cut -f1) MB .next"
IN
} > "$inner"
run_node "$id" "$src" "$WEB_BUILD_MEM" "$inner"
