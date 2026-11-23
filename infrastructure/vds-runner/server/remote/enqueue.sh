#!/usr/bin/env bash
# СЕРВЕР (через `ssh ... 'bash -s -- <id>' < enqueue.sh`): принять загруженный бандл /tmp/twomcr-<id>.tar в очередь и запустить worker.
# Бандл: meta.env (JOB, REF_DESC, CREATED), code.tar.gz, ops/ (скрипты раннера этой версии). Идемпотентно создаёт /srv/twomc-runner.
set -euo pipefail
ID="${1:?id}"
[[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
ROOT=/srv/twomc-runner
BUNDLE="/tmp/twomcr-$ID.tar"
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
# meta.env: только известные ключи со строгими значениями (он затем source-ится worker-ом).
grep -qE '^JOB=(unit|api-e2e|web-build|docker-build)$' "$stage/meta.env" || { echo "Недопустимое задание" >&2; rm -rf "$stage"; exit 5; }
if grep -vE '^(JOB|REF_DESC|CREATED)=[A-Za-z0-9._:/@+,=-]*$' "$stage/meta.env" | grep -q .; then echo "meta.env содержит недопустимые строки" >&2; rm -rf "$stage"; exit 5; fi

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
