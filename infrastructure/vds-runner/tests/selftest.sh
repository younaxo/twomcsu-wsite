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

# --- T4: аргументы java-build/bench проверяются ДО любого SSH (код 2, сеть не используется)
rr() { ( VDS_LOCK_DIR="$D/t4-lock" "$HERE/run-remote.sh" "$@" ) >/dev/null 2>&1; echo $?; }
[[ "$(rr java-build)" == 2 ]] && ok "T4a java-build без --path отклонён" || bad "T4a"
[[ "$(rr java-build --path ../x)" == 2 ]] && ok "T4b --path с '..' отклонён" || bad "T4b"
[[ "$(rr java-build --path /etc)" == 2 ]] && ok "T4c абсолютный --path отклонён" || bad "T4c"
[[ "$(rr java-build --path 'a b')" == 2 ]] && ok "T4d --path с пробелом отклонён" || bad "T4d"
[[ "$(rr unit --path plugins/bridge)" == 2 ]] && ok "T4e --path вне java-build отклонён" || bad "T4e"
[[ "$(rr bench --env FOO=1)" == 2 ]] && ok "T4f неизвестный ключ --env отклонён" || bad "T4f"
[[ "$(rr bench --env 'OHA_IMAGE=a;b')" == 2 ]] && ok "T4g значение --env со спецсимволом отклонено" || bad "T4g"
[[ "$(rr bench --env PROFILE=small --env PROFILE=large)" == 2 ]] && ok "T4h повтор ключа --env отклонён" || bad "T4h"
[[ "$(rr unit --env PROFILE=small)" == 2 ]] && ok "T4i --env вне bench отклонён" || bad "T4i"

# --- T5: маскирование секретов в смоуке стенда (без сети; нужен node)
if command -v node >/dev/null 2>&1; then
  SMOKE_SELFTEST_MASK=1 node "$HERE/../test-website/smoke.mjs" 2>&1 | grep -q 'mask-selftest: ok' && ok "T5 smoke.mjs маскирует пароли, TOTP, JWT, Bearer, пароли в URL, otpauth" || bad "T5 маскирование смоука"
  SMOKE_SELFTEST_MASK=1 node "$HERE/../test-website/visual-check.mjs" 2>&1 | grep -q 'mask-selftest: ok' && ok "T5b visual-check.mjs использует ту же маску (в т.ч. числа, массивы, заголовки, YAML)" || bad "T5b маскирование visual-check"
  mo="$(SMOKE_SELFTEST_MASK=1 node "$HERE/../test-website/smoke.mjs" 2>&1)"; echo "     $mo"
else
  echo "skip T5 (нет node)"
fi

# --- T6: проверка параметров bench (validate_params, подменённый nproc=6, без docker и сети) и нижний регистр тегов образов
B="$HERE/server/ops/jobs/bench.sh"
{ echo 'nproc() { echo 6; }'; sed -n "/^STAND_MIN_CPUS=/,/^validate_params ||/p" "$B" | sed '$d'; } > "$D/validate.sh"
vp() { ( unset OHA_IMAGE NODE_IMAGE DATASET_FILE PROFILE DB_LATENCY_MS DURATION WARMUP REPEATS SERVER_NCPU LOADGEN_NCPU MEM HEAP JAVA_GC IMPLS LEVELS DOCKER_BUILD_ARGS SERVER_CPUS LOADGEN_CPUS
         env "$@" bash -c "source '$D/validate.sh'; validate_params" >/dev/null 2>&1; echo $? ); }
[[ "$(vp A=1)" == 0 ]] && ok "T6a умолчания (бенчмарк 0-3, стенду 2 ядра) допустимы" || bad "T6a"
[[ "$(vp SERVER_CPUS=0-2 LOADGEN_CPUS=3-5)" == 1 ]] && ok "T6b cpuset без ядер для стенда отклонён" || bad "T6b"
[[ "$(vp SERVER_CPUS=0-1 LOADGEN_CPUS=1-2)" == 1 ]] && ok "T6c пересекающиеся cpuset отклонены" || bad "T6c"
[[ "$(vp SERVER_CPUS=0-9)" == 1 ]] && ok "T6d номер ядра >= nproc отклонён" || bad "T6d"
[[ "$(vp PROFILE=huge)" == 1 ]] && ok "T6e PROFILE вне small|medium|large отклонён" || bad "T6e"
[[ "$(vp DB_LATENCY_MS=5x)" == 1 ]] && ok "T6f нечисловой DB_LATENCY_MS отклонён" || bad "T6f"
[[ "$(vp 'DOCKER_BUILD_ARGS=--privileged')" == 1 ]] && ok "T6g DOCKER_BUILD_ARGS с чужим флагом отклонён" || bad "T6g"
DG=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
[[ "$(vp "DOCKER_BUILD_ARGS=--build-arg NODE_IMAGE=node:24-alpine@$DG --no-cache")" == 0 ]] && ok "T6h NODE_IMAGE по digest и --no-cache допустимы" || bad "T6h"
[[ "$(vp 'DOCKER_BUILD_ARGS=--build-arg NODE_IMAGE=node:24')" == 1 ]] && ok "T6h2 NODE_IMAGE без digest отклонён" || bad "T6h2"
[[ "$(vp "DOCKER_BUILD_ARGS=--build-arg FOO=x@$DG")" == 1 ]] && ok "T6h3 ключ вне allowlist (FOO) отклонён" || bad "T6h3"
[[ "$(vp "DOCKER_BUILD_ARGS=--build-arg HTTP_PROXY=http://x@$DG")" == 1 ]] && ok "T6h4 ключ HTTP_PROXY отклонён" || bad "T6h4"
[[ "$(vp "DOCKER_BUILD_ARGS=--build-arg NODE_IMAGE=-evil@$DG")" == 1 ]] && ok "T6h5 NODE_IMAGE со значением на '-' отклонён" || bad "T6h5"
[[ "$(vp OHA_IMAGE=-v)" == 1 ]] && ok "T6k OHA_IMAGE на '-' отклонён" || bad "T6k"
[[ "$(vp OHA_IMAGE=ghcr.io/hatoo/oha:1.4.5)" == 0 ]] && ok "T6l обычный OHA_IMAGE допустим" || bad "T6l"
[[ "$(vp "NODE_IMAGE=node:24-alpine@$DG")" == 0 ]] && ok "T6m NODE_IMAGE по digest допустим" || bad "T6m"
[[ "$(vp NODE_IMAGE=node:24-alpine)" == 1 ]] && ok "T6n NODE_IMAGE без digest отклонён" || bad "T6n"
[[ "$(vp MEM=512m HEAP=1g)" == 1 ]] && ok "T6i HEAP >= MEM отклонён" || bad "T6i"
if grep -nE 'twomcr-\$\{?id\}?-(api|web|java)|-t "twomcr-\$id' "$HERE"/server/ops/jobs/*.sh | grep -v '^$' | grep -q .; then bad "T6j тег образа с id без нижнего регистра"; else ok "T6j теги образов строятся из \${id,,}"; fi

# --- T7: extract_dir (java-build) на подставных tar: docker подменён функцией, отдающей готовый tar. Отклонение = код 13 и REJECTED=1, каталог dest пуст
J="$HERE/server/ops/jobs/java-build.sh"
{ echo 'valid_rel_path() { :; }'; sed -n '/^REJECTED=0/,/^extract() {/p' "$J" | sed '$d'; } > "$D/extract.sh"
T7="$D/t7"; mkdir -p "$T7/src"; ( cd "$T7/src" && echo data > ok.jar && ln ok.jar hard.jar && mkdir sub && echo r > sub/r.xml && mkfifo fifo.x 2>/dev/null; true )
mk() { ( cd "$T7/src" && tar -cf "$T7/$1.tar" "${@:2}" ) 2>/dev/null; }
mk plain ok.jar sub
mk hard ok.jar hard.jar
mk dots --transform 's|^|../|' ok.jar
printf '%s\n' "garbage-not-a-tar" > "$T7/garbage.tar"
( cd "$T7/src" && tar -cPf "$T7/abs.tar" "$T7/src/ok.jar" ) 2>/dev/null
[[ -p "$T7/src/fifo.x" ]] && mk fifo fifo.x
ln -s ok.jar "$T7/src/sym.jar" 2>/dev/null && [[ -L "$T7/src/sym.jar" ]] && mk sym sym.jar
ed() { # ed <имя tar> -> "код REJECTED файлов-в-dest"
  ( dir="$T7"; docker() { cat "$T7/$FAKE.tar"; }; FAKE="$1"
    source "$D/extract.sh"; extract_dir cid /x "$T7/dest-$1" >/dev/null 2>&1; rc=$?
    echo "$rc $REJECTED $(find "$T7/dest-$1" -type f | wc -l)" ); }
[[ "$(ed plain)" == "0 0 2" ]] && ok "T7a обычный архив распакован (код 0, 2 файла)" || bad "T7a: $(ed plain)"
[[ "$(ed hard)" == "13 1 0" ]] && ok "T7b hardlink отклонён (код 13)" || bad "T7b: $(ed hard)"
[[ "$(ed dots)" == "13 1 0" ]] && ok "T7c '../' отклонён (код 13)" || bad "T7c: $(ed dots)"
[[ "$(ed abs)" == "13 1 0" ]] && ok "T7d абсолютный путь отклонён (код 13)" || bad "T7d: $(ed abs)"
[[ "$(ed garbage)" == "13 1 0" ]] && ok "T7e нечитаемый tar (ненулевой код tar -t) отклонён (код 13)" || bad "T7e: $(ed garbage)"
if [[ -f "$T7/fifo.tar" ]]; then [[ "$(ed fifo)" == "13 1 0" ]] && ok "T7f fifo отклонён (код 13)" || bad "T7f: $(ed fifo)"; else echo "skip T7f (mkfifo недоступен)"; fi
if [[ -f "$T7/sym.tar" ]]; then [[ "$(ed sym)" == "13 1 0" ]] && ok "T7g симлинк отклонён (код 13)" || bad "T7g: $(ed sym)"; else echo "skip T7g (ln -s недоступен)"; fi

# --- T8: run-visual.sh / visual-check.sh / доставка mask.mjs (без сети: проверки аргументов идут до SSH)
TW="$HERE/../test-website"
rv() { ( VDS_LOCK_DIR="$D/t8-lock" "$TW/run-visual.sh" "$@" ) >/dev/null 2>&1; echo $?; }
[[ "$(rv --fetch /srv/twomc-stand/qa/.. "$D/f1")" == 2 ]] && ok "T8a --fetch с '..' отклонён" || bad "T8a"
[[ "$(rv --fetch /srv/twomc-stand/qa/. "$D/f2")" == 2 ]] && ok "T8b --fetch с '.' отклонён" || bad "T8b"
[[ "$(rv --fetch /srv/twomc-stand/qa/a..b "$D/f3")" == 2 ]] && ok "T8c --fetch с '..' внутри имени отклонён" || bad "T8c"
[[ "$(rv /srv/twomc-stand/qa/..)" == 2 ]] && ok "T8d папка результатов '..' отклонена" || bad "T8d"
[[ ! -e "$D/f1" && ! -e "$D/f2" && ! -e "$D/f3" ]] && ok "T8e отклонённый --fetch не создаёт локальный каталог" || bad "T8e"
grep -q 'mask.mjs' "$TW/run-smoke.sh" && grep -q 'mask.mjs' "$TW/run-visual.sh" && grep -q '/s/mask.mjs' "$TW/smoke.sh" && grep -q '/s/mask.mjs' "$TW/visual-check.sh" && ok "T8f mask.mjs доставляется и монтируется в оба контейнера" || bad "T8f"
grep -q 'origin: BASE' "$TW/visual-check.mjs" && ok "T8g httpCredentials с origin: BASE" || bad "T8g"
grep -qF 'replace(/\r/g,' "$TW/visual-check.mjs" && ok "T8h CR убирается при разборе учёток" || bad "T8h"
grep -q 'umask 077; mkdir -p "\$OUT_DIR"' "$TW/visual-check.sh" && ok "T8i umask 077 перед созданием каталога результатов" || bad "T8i"
grep -q 'BASE_URL_CFG' "$TW/visual-check.sh" && ! grep -q 'BASE_URL:-' "$TW/visual-check.sh" && ok "T8j BASE_URL только из конфигурации" || bad "T8j"
exit "$fail"
