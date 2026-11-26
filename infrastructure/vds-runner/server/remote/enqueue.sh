#!/usr/bin/env bash
# СЕРВЕР (через `ssh ... 'bash -s -- <id>' < enqueue.sh`): принять загруженный бандл ~/.twomc-inbox/twomcr-<id>.tar в очередь и запустить worker.
# Бандл: meta.env (JOB, REF_DESC, CREATED), code.tar.gz, ops/ (скрипты раннера этой версии). Идемпотентно создаёт /srv/twomc-runner.
set -euo pipefail
ID="${1:?id}"
[[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
ROOT=/srv/twomc-runner
BUNDLE="$HOME/.twomc-inbox/twomcr-$ID.tar"
[[ -f "$BUNDLE" ]] || { echo "Нет загруженного бандла $BUNDLE" >&2; exit 3; }

if [[ ! -d "$ROOT" ]]; then
  sudo -n mkdir -p "$ROOT"
  sudo -n chown "$(id -un):$(id -gn)" "$ROOT"
fi
mkdir -p "$ROOT"/{queue,running,done,ops,cache/pnpm-store,cache/home,cache/corepack}

stage="$ROOT/queue/.incoming-$ID"
rm -rf "$stage"; mkdir -p "$stage"
tar -xf "$BUNDLE" -C "$stage"
rm -f "$BUNDLE"
[[ -f "$stage/meta.env" && -f "$stage/code.tar.gz" && -d "$stage/ops" ]] || { echo "Бандл неполный" >&2; rm -rf "$stage"; exit 4; }
# meta.env: по одной строке JOB, REF_DESC, CREATED (дубликаты запрещены: source берёт последнюю), только строгие значения; JOB - без пути.
# Необязательно (не более одного раза каждая): JOB_PATH (java-build; относительный путь без '..') и ENV_<КЛЮЧ> (только bench, белый список ключей).
for k in JOB REF_DESC CREATED; do
  [[ "$(grep -c "^$k=" "$stage/meta.env")" == 1 ]] || { echo "meta.env: $k должен встречаться ровно один раз" >&2; rm -rf "$stage"; exit 5; }
done
BENCH_KEYS='OHA_IMAGE|PROFILE|DB_LATENCY_MS|DATASET_FILE|RULES|IMPLS|LEVELS|DURATION|WARMUP|REPEATS|DOCKER_BUILD_ARGS|BENCH_NODE_IMAGE|BENCH_PRECHECK_ONLY|MEM|HEAP|SERVER_NCPU|SERVER_CPUS|LOADGEN_CPUS|LOADGEN_NCPU|JAVA_GC'
if grep -vE "^(JOB|REF_DESC|CREATED|JOB_PATH|ENV_($BENCH_KEYS))=[A-Za-z0-9._:/@+,=-]*\$" "$stage/meta.env" | grep -q .; then echo "meta.env содержит недопустимые строки" >&2; rm -rf "$stage"; exit 5; fi
if [[ -n "$(cut -d= -f1 "$stage/meta.env" | sort | uniq -d)" ]]; then echo "meta.env: повторяющиеся ключи" >&2; rm -rf "$stage"; exit 5; fi
grep -qE '^JOB=(unit|api-e2e|web-build|docker-build|java-build|bench)$' "$stage/meta.env" || { echo "Недопустимое задание" >&2; rm -rf "$stage"; exit 5; }
if grep -E '^REF_DESC=' "$stage/meta.env" | grep -qE '(^|[=/])\.\.?(/|$)'; then echo "meta.env: REF_DESC с точечными сегментами" >&2; rm -rf "$stage"; exit 5; fi
if grep -qE '^JOB_PATH=' "$stage/meta.env"; then
  grep -qE '^JOB=java-build$' "$stage/meta.env" || { echo "meta.env: JOB_PATH допустим только для java-build" >&2; rm -rf "$stage"; exit 5; }
  jp="$(sed -n 's/^JOB_PATH=//p' "$stage/meta.env")"
  [[ "$jp" =~ ^[A-Za-z0-9._/-]+$ && "$jp" != /* && "$jp" != *..* ]] || { echo "meta.env: недопустимый JOB_PATH" >&2; rm -rf "$stage"; exit 5; }
fi
if grep -qE '^JOB=java-build$' "$stage/meta.env" && ! grep -qE '^JOB_PATH=.' "$stage/meta.env"; then echo "meta.env: java-build требует JOB_PATH" >&2; rm -rf "$stage"; exit 5; fi
if grep -qE '^ENV_' "$stage/meta.env" && ! grep -qE '^JOB=bench$' "$stage/meta.env"; then echo "meta.env: ENV_* допустимы только для bench" >&2; rm -rf "$stage"; exit 5; fi

# Версионируемая копия ops: неизменяемый каталог по хэшу содержимого.
HASH="$(tar --sort=name --mtime=@0 --owner=0 --group=0 -cf - -C "$stage" ops | sha256sum | cut -c1-12)"
if [[ ! -d "$ROOT/ops/$HASH" ]]; then
  cp -r "$stage/ops" "$ROOT/ops/.new-$HASH" && mv "$ROOT/ops/.new-$HASH" "$ROOT/ops/$HASH"
  chmod -R u+rwX,go-w "$ROOT/ops/$HASH"
fi
rm -rf "$stage/ops"
echo "OPS_HASH=$HASH" >> "$stage/meta.env"
mv "$stage" "$ROOT/queue/$ID"          # атомарная постановка

pos="$(ls -1 "$ROOT/queue" | grep -cE '^[0-9]{8}T[0-9]{6}Z-' || true)"
running="$(ls -1 "$ROOT/running" 2>/dev/null | grep -cE '^[0-9]{8}T[0-9]{6}Z-' || true)"

# Запуск worker в фоне с низким приоритетом; если он уже работает, новый сразу выйдет (flock).
setsid nohup nice -n 15 ionice -c3 bash "$ROOT/ops/$HASH/worker.sh" >> "$ROOT/worker.log" 2>&1 < /dev/null &
disown || true
echo "QUEUED id=$ID queue=$pos running=$running ops=$HASH"
