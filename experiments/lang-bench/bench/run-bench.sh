#!/usr/bin/env bash
# Бенчмарк B1 (расчёт корзины): ts-current, ts-batch, rust, java - по очереди, одинаковые лимиты, нагрузка oha.
# ЗАПУСКАТЬ ТОЛЬКО НА VDS (задание раннера `bench`, см. docs/reports/lang-bench-plan.md). Локально на ПК не запускать.
# Статус: готов к запуску, НЕ ЗАПУСКАЛСЯ (Docker и Rust/JDK на ПК запрещены); проверен только `bash -n`.
#
# Этапы: (0) сборка образов (BUILD=1) и генерация корзин; (1) эквивалентность (все четыре образа, golden + >=1000 корзин; расхождение - выход);
#        (2) по очереди для каждого варианта: холодный старт, прогрев, затем уровни LEVELS x REPEATS x DURATION с выборкой docker stats;
#        (3) сводка (медианы) tools/summarize.mjs.
# Переменные (значения по умолчанию в скобках):
#   IMPLS ("ts-current ts-batch rust java")  SERVER_NCPU (2)  SERVER_CPUS (0-1)  LOADGEN_CPUS (2-3)  MEM (512m)  HEAP (256m, только Java)
#   LEVELS ("1 50 500")  DURATION (60, с)  WARMUP (60, с; для Java не менее 60)  REPEATS (3)  PROFILE (medium: small|medium|large)
#   DB_LATENCY_MS (0; >0 включает модель «обращений к БД», см. CONTRACT.md)  DATASET_FILE ("" или generated/dataset-large.json)
#   RULES ("" или число: сгенерировать большой набор правил)  OHA_IMAGE (ОБЯЗАТЕЛЬНО, закрепить тег)  BUILD (1)  OUT (results/<id>)
#   BENCH_LABEL (метка контейнеров для очистки раннером, например twomc-runner-job=<id>)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMPLS="${IMPLS:-ts-current ts-batch rust java}"
SERVER_NCPU="${SERVER_NCPU:-2}"; SERVER_CPUS="${SERVER_CPUS:-0-1}"; LOADGEN_CPUS="${LOADGEN_CPUS:-2-3}"
MEM="${MEM:-512m}"; HEAP="${HEAP:-256m}"
LEVELS="${LEVELS:-1 50 500}"; DURATION="${DURATION:-60}"; WARMUP="${WARMUP:-60}"; REPEATS="${REPEATS:-3}"
PROFILE="${PROFILE:-medium}"; DB_LATENCY_MS="${DB_LATENCY_MS:-0}"; DATASET_FILE="${DATASET_FILE:-}"; RULES="${RULES:-}"
OHA_IMAGE="${OHA_IMAGE:?Задайте OHA_IMAGE с закреплённым тегом (образ нагрузчика oha)}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
BUILD="${BUILD:-1}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT="${OUT:-$ROOT/results/$RUN_ID}"
PAYLOAD="$ROOT/generated/bench-$PROFILE.json"
declare -A PORT=( [ts-current]=18081 [ts-batch]=18082 [rust]=18083 [java]=18084 )

[[ "$WARMUP" -ge 60 ]] || { echo "WARMUP должен быть >= 60 с (JIT Java)" >&2; exit 2; }
[[ "$DURATION" -ge 60 ]] || { echo "DURATION должен быть >= 60 с" >&2; exit 2; }
mkdir -p "$OUT"

cleanup() { for n in $IMPLS; do docker rm -f "lb-$n" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

nodectl() { docker run --rm --network host -u "$(id -u):$(id -g)" -v "$ROOT":/w "$NODE_IMAGE" node "$@"; }

start_impl() { # $1 = вариант; в $COLD_MS кладёт холодный старт (мс до первого 200 на расчёте)
  local n="$1" p="${PORT[$1]}"
  docker rm -f "lb-$n" >/dev/null 2>&1 || true
  local args=(-d --name "lb-$n" --cpus "$SERVER_NCPU" --cpuset-cpus "$SERVER_CPUS" --memory "$MEM" --memory-swap "$MEM"
    --pids-limit 512 -p "127.0.0.1:$p:8080" -e "DB_LATENCY_MS=$DB_LATENCY_MS" --label "${BENCH_LABEL:-twomc-bench=$RUN_ID}")
  if [[ -n "$DATASET_FILE" ]]; then args+=(-v "$ROOT/$DATASET_FILE":/data/dataset.json:ro -e DATASET_PATH=/data/dataset.json); fi
  if [[ "$n" == java ]]; then args+=(-e "JAVA_OPTS=-Xms$HEAP -Xmx$HEAP"); fi
  local t0 t1 i=0
  t0=$(date +%s%N)
  docker run "${args[@]}" "langbench-$n" >/dev/null
  until curl -sf -m 1 -X POST -H 'content-type: application/json' --data @"$PAYLOAD" -o /dev/null "http://127.0.0.1:$p/store/cart/calculate"; do
    i=$((i + 1)); [[ $i -lt 1200 ]] || { echo "$n не поднялся за 60 с" >&2; docker logs "lb-$n" | tail -20 >&2; exit 3; }
    sleep 0.05
  done
  t1=$(date +%s%N)
  COLD_MS=$(( (t1 - t0) / 1000000 ))
}

# ---------- 0. сборка и данные ----------
if [[ "$BUILD" == 1 ]]; then
  for n in $IMPLS; do
    t0=$(date +%s)
    docker build -q -f "$ROOT/impl/$n/Dockerfile" -t "langbench-$n" "$ROOT" >/dev/null
    echo "{\"build_s\": $(( $(date +%s) - t0 ))}" > "$OUT/build-$n.json"
  done
fi
nodectl /w/tools/gen-carts.mjs --count 2000 ${RULES:+--rules "$RULES"}

# ---------- 1. эквивалентность ----------
targets=""
for n in $IMPLS; do start_impl "$n"; targets+="${targets:+,}$n=http://127.0.0.1:${PORT[$n]}"; done
echo "== эквивалентность: $targets"
docker run --rm --network host -u "$(id -u):$(id -g)" -v "$ROOT":/w:ro "$NODE_IMAGE" \
  node /w/tools/check-equivalence.mjs --http "$targets" --min-carts 1000 | tee "$OUT/equivalence.log"
cleanup

# ---------- 2. замеры по очереди ----------
{
  echo "{\"run\":\"$RUN_ID\",\"impls\":\"$IMPLS\",\"server_ncpu\":$SERVER_NCPU,\"mem\":\"$MEM\",\"heap_java\":\"$HEAP\",\"levels\":\"$LEVELS\","
  echo "\"duration_s\":$DURATION,\"warmup_s\":$WARMUP,\"repeats\":$REPEATS,\"profile\":\"$PROFILE\",\"db_latency_ms\":$DB_LATENCY_MS,\"dataset\":\"${DATASET_FILE:-fixtures/dataset.json}\"}"
} > "$OUT/meta.json"

for n in $IMPLS; do
  p="${PORT[$n]}"; url="http://127.0.0.1:$p/store/cart/calculate"
  start_impl "$n"
  size=$(docker image inspect "langbench-$n" --format '{{.Size}}')
  echo "{\"cold_start_ms\": $COLD_MS, \"image_bytes\": $size}" > "$OUT/$n-static.json"
  echo "== $n: cold start ${COLD_MS} мс, образ ${size} байт; прогрев ${WARMUP} с"
  docker run --rm --network host --cpuset-cpus "$LOADGEN_CPUS" -v "$PAYLOAD":/payload.json:ro "$OHA_IMAGE" \
    -z "${WARMUP}s" -c 50 -m POST -T application/json -D /payload.json --no-tui --output-format json "$url" >/dev/null
  for c in $LEVELS; do
    for r in $(seq 1 "$REPEATS"); do
      stats="$OUT/$n-c$c-r$r.stats.csv"; : > "$stats"
      ( while :; do docker stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}}' "lb-$n" >> "$stats" 2>/dev/null || true; sleep 1; done ) &
      spid=$!
      docker run --rm --network host --cpuset-cpus "$LOADGEN_CPUS" -v "$PAYLOAD":/payload.json:ro "$OHA_IMAGE" \
        -z "${DURATION}s" -c "$c" -m POST -T application/json -D /payload.json --no-tui --output-format json "$url" \
        > "$OUT/$n-c$c-r$r.json"
      kill "$spid" 2>/dev/null || true; wait "$spid" 2>/dev/null || true
      echo "   $n c=$c повтор $r готов"
      sleep 5
    done
  done
  docker rm -f "lb-$n" >/dev/null 2>&1 || true
done

# ---------- 3. сводка ----------
docker run --rm -u "$(id -u):$(id -g)" -v "$ROOT":/w:ro -v "$OUT":/out "$NODE_IMAGE" node /w/tools/summarize.mjs /out
echo "Готово: $OUT (summary.md, summary.json)"
