#!/usr/bin/env bash
# Бенчмарк B1 (расчёт корзины): ts-current, ts-batch, rust, java - одинаковые лимиты, нагрузка oha.
# ЗАПУСКАТЬ ТОЛЬКО НА VDS (задание раннера `bench`, см. docs/reports/lang-bench-plan.md). Локально на ПК не запускать.
# Статус: готов к запуску, НЕ ЗАПУСКАЛСЯ (Docker и Rust/JDK на ПК запрещены); проверен только `bash -n`.
#
# Этапы: (0) сборка образов (BUILD=1) и генерация корзин;
#        (1a) эквивалентность на ДАННЫХ ПО УМОЛЧАНИЮ (fixtures/dataset.json): golden + >=1000 корзин; golden гоняется ТОЛЬКО здесь,
#             потому что ожидания посчитаны вручную именно для fixtures/dataset.json; расхождение - выход;
#        (1b) если задан DATASET_FILE: сравнение вариантов между собой на большом наборе на сгенерированных корзинах (без golden,
#             tools/check-equivalence.mjs --no-golden --dataset ...); расхождение - выход;
#        (2) замеры ПО КРУГУ (L2): повтор r -> варианты по очереди (порядок сдвигается на 1 на каждом повторе) -> холодный старт,
#            прогрев, затем уровни LEVELS; так дрейф стенда (температура, соседи) размазывается по вариантам, а не ложится на один;
#        (3) сводка (медианы, сравнение с ts-current и ts-batch) tools/summarize.mjs.
# Переменные (значения по умолчанию в скобках):
#   IMPLS ("ts-current ts-batch rust java")  SERVER_NCPU (2)  SERVER_CPUS (0-1)  LOADGEN_CPUS (2-3)  LOADGEN_NCPU (2, число ядер LOADGEN_CPUS)
#   MEM (512m)  HEAP (256m, только Java)  JAVA_GC ("-XX:+UseG1GC", одинаково для Java везде; пишется в meta.json)
#   LEVELS ("1 50 500")  DURATION (60, с)  WARMUP (60, с; для Java не менее 60)  REPEATS (3)  PROFILE (medium: small|medium|large)
#   DB_LATENCY_MS (0; >0 включает модель «обращений к БД», см. CONTRACT.md)  DATASET_FILE ("" или generated/dataset-large.json)
#   RULES ("" или число: сгенерировать большой набор правил)  OHA_IMAGE (ОБЯЗАТЕЛЬНО, закрепить тег)  BUILD (1)  OUT (results/<id>)
#   NODE_IMAGE (node:24.18.0-alpine; для служебных вызовов node)
#   DOCKER_BUILD_ARGS (например "--build-arg NODE_IMAGE=node:24.18.0-alpine@sha256:...", см. README, «Воспроизводимость»)
#   BENCH_LABEL (метка контейнеров для очистки раннером, например twomc-runner-job=<id>)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMPLS="${IMPLS:-ts-current ts-batch rust java}"
SERVER_NCPU="${SERVER_NCPU:-2}"; SERVER_CPUS="${SERVER_CPUS:-0-1}"; LOADGEN_CPUS="${LOADGEN_CPUS:-2-3}"; LOADGEN_NCPU="${LOADGEN_NCPU:-2}"
MEM="${MEM:-512m}"; HEAP="${HEAP:-256m}"; JAVA_GC="${JAVA_GC:--XX:+UseG1GC}"
LEVELS="${LEVELS:-1 50 500}"; DURATION="${DURATION:-60}"; WARMUP="${WARMUP:-60}"; REPEATS="${REPEATS:-3}"
PROFILE="${PROFILE:-medium}"; DB_LATENCY_MS="${DB_LATENCY_MS:-0}"; DATASET_FILE="${DATASET_FILE:-}"; RULES="${RULES:-}"
OHA_IMAGE="${OHA_IMAGE:?Задайте OHA_IMAGE с закреплённым тегом (образ нагрузчика oha)}"
NODE_IMAGE="${NODE_IMAGE:-node:24.18.0-alpine}"
DOCKER_BUILD_ARGS="${DOCKER_BUILD_ARGS:-}"
BUILD="${BUILD:-1}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT="${OUT:-$ROOT/results/$RUN_ID}"
PAYLOAD="$ROOT/generated/bench-$PROFILE.json"
declare -A PORT=( [ts-current]=18081 [ts-batch]=18082 [rust]=18083 [java]=18084 )
JAVA_OPTS_VALUE="-Xms$HEAP -Xmx$HEAP $JAVA_GC"
# Набор данных, с которым стартуют серверы СЕЙЧАС ("" = fixtures/dataset.json из образа); меняется по этапам
ACTIVE_DATASET=""
SPID=""        # PID фонового сборщика docker stats (M7: убивается в cleanup)
TARGETS=""
COLD_MS=0

[[ "$WARMUP" -ge 60 ]] || { echo "WARMUP должен быть >= 60 с (JIT Java)" >&2; exit 2; }
[[ "$DURATION" -ge 60 ]] || { echo "DURATION должен быть >= 60 с" >&2; exit 2; }
mkdir -p "$OUT"

stop_sampler() {
  if [[ -n "$SPID" ]]; then
    pkill -P "$SPID" 2>/dev/null || true
    kill "$SPID" 2>/dev/null || true
    wait "$SPID" 2>/dev/null || true
    SPID=""
  fi
}
cleanup() {
  stop_sampler
  for n in $IMPLS; do docker rm -f "lb-$n" >/dev/null 2>&1 || true; done
  docker rm -f lb-oha >/dev/null 2>&1 || true
}
trap cleanup EXIT

nodectl() { docker run --rm --network host -u "$(id -u):$(id -g)" -v "$ROOT":/w "$NODE_IMAGE" node "$@"; }

start_impl() { # $1 = вариант; в $COLD_MS кладёт холодный старт (мс до первого 200 на расчёте)
  local n="$1" p="${PORT[$1]}"
  docker rm -f "lb-$n" >/dev/null 2>&1 || true
  local args=(-d --name "lb-$n" --cpus "$SERVER_NCPU" --cpuset-cpus "$SERVER_CPUS" --memory "$MEM" --memory-swap "$MEM"
    --pids-limit 512 -p "127.0.0.1:$p:8080" -e "DB_LATENCY_MS=$DB_LATENCY_MS" --label "${BENCH_LABEL:-twomc-bench=$RUN_ID}")
  if [[ -n "$ACTIVE_DATASET" ]]; then args+=(-v "$ROOT/$ACTIVE_DATASET":/data/dataset.json:ro -e DATASET_PATH=/data/dataset.json); fi
  if [[ "$n" == java ]]; then args+=(-e "JAVA_OPTS=$JAVA_OPTS_VALUE"); fi
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

start_all() { # поднимает все IMPLS (для этапа эквивалентности), список целей кладёт в $TARGETS
  TARGETS=""
  for n in $IMPLS; do start_impl "$n"; TARGETS+="${TARGETS:+,}$n=http://127.0.0.1:${PORT[$n]}"; done
}

equivalence() { # $@ - дополнительные аргументы check-equivalence
  docker run --rm --network host -u "$(id -u):$(id -g)" -v "$ROOT":/w:ro "$NODE_IMAGE" \
    node /w/tools/check-equivalence.mjs --http "$TARGETS" --min-carts 1000 "$@"
}

# ---------- 0. сборка и данные ----------
if [[ "$BUILD" == 1 ]]; then
  for n in $IMPLS; do
    t0=$(date +%s)
    # shellcheck disable=SC2086
    docker build -q -f "$ROOT/impl/$n/Dockerfile" $DOCKER_BUILD_ARGS -t "langbench-$n" "$ROOT" >/dev/null
    echo "{\"build_s\": $(( $(date +%s) - t0 ))}" > "$OUT/build-$n.json"
  done
fi
nodectl /w/tools/gen-carts.mjs --count 2000 ${RULES:+--rules "$RULES"}

# ---------- 1a. эквивалентность на данных по умолчанию (golden ТОЛЬКО здесь, H1) ----------
ACTIVE_DATASET=""
start_all
echo "== эквивалентность (fixtures/dataset.json, golden + корзины): $TARGETS"
equivalence | tee "$OUT/equivalence.log"
cleanup

# ---------- 1b. сравнение вариантов на большом наборе (без golden) ----------
if [[ -n "$DATASET_FILE" ]]; then
  ACTIVE_DATASET="$DATASET_FILE"
  start_all
  echo "== эквивалентность на $DATASET_FILE (только сравнение вариантов между собой, без golden): $TARGETS"
  equivalence --no-golden --dataset "$DATASET_FILE" | tee "$OUT/equivalence-large.log"
  cleanup
fi

# ---------- 2. замеры ----------
{
  echo "{\"run\":\"$RUN_ID\",\"impls\":\"$IMPLS\",\"server_ncpu\":$SERVER_NCPU,\"loadgen_ncpu\":$LOADGEN_NCPU,\"mem\":\"$MEM\",\"heap_java\":\"$HEAP\","
  echo "\"java_gc\":\"$JAVA_GC\",\"java_opts\":\"$JAVA_OPTS_VALUE\",\"levels\":\"$LEVELS\","
  echo "\"duration_s\":$DURATION,\"warmup_s\":$WARMUP,\"repeats\":$REPEATS,\"order\":\"round-robin по повторам, порядок вариантов сдвигается на 1\","
  echo "\"profile\":\"$PROFILE\",\"db_latency_ms\":$DB_LATENCY_MS,\"dataset\":\"${DATASET_FILE:-fixtures/dataset.json}\",\"oha_image\":\"$OHA_IMAGE\"}"
} > "$OUT/meta.json"

ACTIVE_DATASET="$DATASET_FILE"
read -r -a ORDER <<< "$IMPLS"
COUNT=${#ORDER[@]}
for r in $(seq 1 "$REPEATS"); do
  shift_by=$(( (r - 1) % COUNT ))
  for k in $(seq 0 $(( COUNT - 1 ))); do
    n="${ORDER[$(( (k + shift_by) % COUNT ))]}"
    p="${PORT[$n]}"; url="http://127.0.0.1:$p/store/cart/calculate"
    start_impl "$n"
    echo "{\"cold_start_ms\": $COLD_MS}" > "$OUT/$n-cold-r$r.json"
    if [[ "$r" == 1 ]]; then
      size=$(docker image inspect "langbench-$n" --format '{{.Size}}')
      echo "{\"cold_start_ms\": $COLD_MS, \"image_bytes\": $size}" > "$OUT/$n-static.json"
    fi
    echo "== повтор $r, $n: cold start ${COLD_MS} мс; прогрев ${WARMUP} с"
    docker run --rm --network host --cpuset-cpus "$LOADGEN_CPUS" -v "$PAYLOAD":/payload.json:ro "$OHA_IMAGE" \
      -z "${WARMUP}s" -c 50 -m POST -T application/json -D /payload.json --no-tui --output-format json "$url" >/dev/null
    for c in $LEVELS; do
      stats="$OUT/$n-c$c-r$r.stats.csv"; lstats="$OUT/$n-c$c-r$r.loadgen.csv"; : > "$stats"; : > "$lstats"
      # M5/M7: фоновая выборка сервера и нагрузчика; PID в SPID, убивается и после замера, и в cleanup (trap EXIT)
      (
        while :; do
          docker stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}}' "lb-$n" >> "$stats" 2>/dev/null || true
          docker stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}}' lb-oha >> "$lstats" 2>/dev/null || true
          sleep 1
        done
      ) &
      SPID=$!
      docker run --rm --name lb-oha --label "${BENCH_LABEL:-twomc-bench=$RUN_ID}" --network host --cpuset-cpus "$LOADGEN_CPUS" \
        -v "$PAYLOAD":/payload.json:ro "$OHA_IMAGE" \
        -z "${DURATION}s" -c "$c" -m POST -T application/json -D /payload.json --no-tui --output-format json "$url" \
        > "$OUT/$n-c$c-r$r.json"
      stop_sampler
      echo "   повтор $r, $n, c=$c готов"
      sleep 5
    done
    docker rm -f "lb-$n" >/dev/null 2>&1 || true
  done
done

# ---------- 3. сводка ----------
docker run --rm -u "$(id -u):$(id -g)" -v "$ROOT":/w:ro -v "$OUT":/out "$NODE_IMAGE" node /w/tools/summarize.mjs /out
echo "Готово: $OUT (summary.md, summary.json)"
