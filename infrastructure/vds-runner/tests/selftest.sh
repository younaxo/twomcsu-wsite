#!/usr/bin/env bash
# ЛОКАЛЬНЫЕ самопроверки (без сети и VDS): блокировка, безопасный временный каталог, denylist --worktree.
#   infrastructure/vds-runner/tests/selftest.sh
# Все опасные сценарии выполняются на ПОДСТАВНОМ каталоге (D), реальный TEMP/TMP не затрагивается.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
D="$(mktemp -d -t twomc-selftest.XXXXXX)"; trap 'rm -rf -- "$D"' EXIT
fail=0; ok() { echo "ok   $*"; }; bad() { echo "FAIL $*"; fail=1; }

# --- T1: ранний выход скриптов не удаляет TMP/TEMP/TMPDIR (подставной каталог)
mkdir -p "$D/decoy/keep"; echo x > "$D/decoy/keep/file"
( TMP="$D/decoy" TEMP="$D/decoy" TMPDIR="$D/decoy" VDS_LOCK_DIR="$D/decoy-lock" STAND_ROOT=/bad "$HERE/../test-website/push-release.sh" ) >/dev/null 2>&1
[[ -f "$D/decoy/keep/file" ]] && ok "T1a push-release: ранний выход не трогает TMP" || bad "T1a push-release удалил подставной TMP"
( TMP="$D/decoy" TEMP="$D/decoy" TMPDIR="$D/decoy" VDS_LOCK_DIR="$D/decoy-lock" "$HERE/run-remote.sh" bogus ) >/dev/null 2>&1
[[ -f "$D/decoy/keep/file" ]] && ok "T1b run-remote: ранний выход не трогает TMP" || bad "T1b run-remote удалил подставной TMP"
( source "$HERE/lib/vds-lock.sh"; STAGE_TMP="$D/decoy"; vds_stage_cleanup )
[[ -f "$D/decoy/keep/file" ]] && ok "T1c vds_stage_cleanup отказывается удалять каталог без префикса twomc-stage." || bad "T1c cleanup удалил чужой каталог"
( source "$HERE/lib/vds-lock.sh"; TMPDIR="$D" vds_stage_new; [[ -d "$STAGE_TMP" ]] && vds_stage_cleanup; [[ -z "$STAGE_TMP" ]] ) && ok "T1d vds_stage_new/cleanup создают и удаляют twomc-stage.*" || bad "T1d"

# --- T2: блокировка. Формат owner: "pid время скрипт крайний_срок"
export VDS_LOCK_DIR="$D/lock"
sleep 60 & LIVE=$!
now="$(date +%s)"
mkdir "$VDS_LOCK_DIR"; echo "$LIVE $((now-86400)) t $((now+3600))" > "$VDS_LOCK_DIR/owner"      # живой pid, возраст сутки, потолок впереди
( source "$HERE/lib/vds-lock.sh"; vds_lock_acquire 3 ) 2>/dev/null && bad "T2a живой владелец потерял блокировку" || ok "T2a живой pid (возраст 24 ч, потолок не истёк) НЕ снимается"
[[ -d "$VDS_LOCK_DIR" ]] || bad "T2a каталог блокировки исчез"
echo "$LIVE $((now-86400)) t $((now-10))" > "$VDS_LOCK_DIR/owner"                                # живой pid, но потолок истёк
( source "$HERE/lib/vds-lock.sh"; vds_lock_acquire 5 && vds_lock_release ) 2>/dev/null && ok "T2b истёкший жёсткий потолок снимается" || bad "T2b"
kill "$LIVE" 2>/dev/null; wait "$LIVE" 2>/dev/null
mkdir -p "$VDS_LOCK_DIR"; echo "999999 $((now-100)) t $((now+3600))" > "$VDS_LOCK_DIR/owner"      # мёртвый pid
( source "$HERE/lib/vds-lock.sh"; vds_lock_acquire 5 && vds_lock_release ) 2>/dev/null && ok "T2c мёртвый pid снимается" || bad "T2c"
[[ ! -d "$VDS_LOCK_DIR" ]] && ok "T2d после release каталога нет" || bad "T2d"

# --- T3: denylist --worktree
# shellcheck source=lib/wt-filter.sh
source "$HERE/lib/wt-filter.sh"
for p in .env .env.local apps/api/.env.production .npmrc .netrc .pgpass id_rsa id_ed25519.pub keys/a.jks a.keystore AuthKey_X.p8 sa/service-account-prod.json db.kdbx x.sqlite dump.sql backup.dump a.pem a.key node_modules/x/y.js apps/web/.next/a.js apps/api/dist/main.js coverage/lcov.info a.tsbuildinfo deploy/secrets/x.txt cfg/credentials.json; do
  wt_denied "$p" && ok "T3 исключён: $p" || bad "T3 НЕ исключён: $p"
done
for p in .env.example apps/web/.env.sample apps/api/prisma/migrations/20240101_init/migration.sql apps/api/src/modules/auth/two-factor/secret-box.ts apps/api/src/a.ts package.json pnpm-lock.yaml; do
  wt_denied "$p" && bad "T3 ЛИШНЕЕ исключение: $p" || ok "T3 включён: $p"
done
exit "$fail"
