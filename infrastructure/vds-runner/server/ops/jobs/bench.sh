#!/usr/bin/env bash
# Задание bench: experiments/lang-bench/bench/run-bench.sh по docs/reports/lang-bench-plan.md (ядра 0-3 заняты на 70-95 минут).
# Вход: снимок кода с experiments/lang-bench/ (--ref/--worktree), параметры - `run-remote.sh bench --env КЛЮЧ=ЗНАЧЕНИЕ` (список ключей - enqueue.sh);
# списки (IMPLS, LEVELS, DOCKER_BUILD_ARGS) передаются через запятую, здесь запятые превращаются в пробелы. OHA_IMAGE обязателен (закреплённый тег).
# Тайм-аут задания не менее 7200 с (worker.sh: job_timeout_for). Контейнеры бенчмарка помечены BENCH_LABEL=twomc-runner-job=<id> и удаляются штатно.
# Весь каталог результатов (OUT) = $dir/out; run-remote.sh забирает его целиком в --out/out.
# Перед стартом проверяется, что стенд не под нагрузкой (CPU, loadavg, память, диск, чужие контейнеры, порты 18081-18084); иначе выход 20, бенчмарк не стартует.
# BENCH_PRECHECK_ONLY=1 (--env BENCH_PRECHECK_ONLY=1): только проверки и `bash -n`, сам бенчмарк НЕ запускается.
# Коды: 0 успех, 2 неверные параметры, 20 стенд под нагрузкой / нет ресурсов, 21 нет lang-bench в снимке, иначе код run-bench.sh.
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"

ROOT="$src/experiments/lang-bench"
out="$dir/out"; mkdir -p "$out"
[[ -f "$ROOT/bench/run-bench.sh" && -f "$ROOT/tools/summarize.mjs" ]] || { echo "##### bench: в снимке нет experiments/lang-bench (run-bench.sh, tools/summarize.mjs)"; exit 21; }

MAX_BUSY_PCT="${RUNNER_BENCH_MAX_BUSY_PCT:-25}"   # средняя загрузка всех vCPU за окно проверки
MAX_LOAD1="${RUNNER_BENCH_MAX_LOAD1:-1.5}"        # loadavg за 1 минуту
MIN_MEM_MB="${RUNNER_BENCH_MIN_MEM_MB:-3072}"     # MemAvailable
MIN_DISK_MB="${RUNNER_BENCH_MIN_DISK_MB:-10240}"  # свободно на томе раннера
MIN_CPUS="${RUNNER_BENCH_MIN_CPUS:-4}"            # ядра 0-3 по умолчанию

# ---- параметры бенчмарка из ENV_* (проверены enqueue.sh; здесь снова: только известные ключи и строгие значения)
unset NODE_IMAGE OHA_IMAGE PROFILE DB_LATENCY_MS DATASET_FILE RULES IMPLS LEVELS DURATION WARMUP REPEATS DOCKER_BUILD_ARGS MEM HEAP \
      SERVER_NCPU SERVER_CPUS LOADGEN_CPUS LOADGEN_NCPU JAVA_GC BUILD OUT RUN_ID 2>/dev/null || true
for k in OHA_IMAGE PROFILE DB_LATENCY_MS DATASET_FILE RULES IMPLS LEVELS DURATION WARMUP REPEATS DOCKER_BUILD_ARGS MEM HEAP \
         SERVER_NCPU SERVER_CPUS LOADGEN_CPUS LOADGEN_NCPU JAVA_GC; do
  var="ENV_$k"
  [[ -n "${!var:-}" ]] || continue
  val="${!var}"
  [[ "$val" =~ ^[A-Za-z0-9._:/@+,=-]+$ ]] || { echo "##### bench: недопустимое значение $k"; exit 2; }
  case "$k" in IMPLS|LEVELS|DOCKER_BUILD_ARGS) val="${val//,/ }" ;; esac
  if [[ "$k" == DATASET_FILE ]]; then valid_rel_path "$val" || { echo "##### bench: недопустимый DATASET_FILE"; exit 2; }; fi
  export "$k=$val"
done
[[ -z "${ENV_BENCH_NODE_IMAGE:-}" ]] || { [[ "$ENV_BENCH_NODE_IMAGE" =~ ^[A-Za-z0-9._:/@+-]+$ ]] || { echo "##### bench: недопустимый BENCH_NODE_IMAGE"; exit 2; }; export NODE_IMAGE="$ENV_BENCH_NODE_IMAGE"; }
precheck_only="${ENV_BENCH_PRECHECK_ONLY:-0}"

# ---- проверка «стенд не под нагрузкой» и ресурсов
cpu_busy_pct() { # cpu_busy_pct <секунд>: загрузка всех vCPU (user+system+...; без idle и iowait) за окно
  local a b ta tb ia ib
  a="$(head -1 /proc/stat)"; sleep "$1"; b="$(head -1 /proc/stat)"
  read -r -a A <<<"$a"; read -r -a B <<<"$b"
  ta=0; tb=0; for v in "${A[@]:1:8}"; do ta=$(( ta + v )); done; for v in "${B[@]:1:8}"; do tb=$(( tb + v )); done
  ia=$(( A[4] + A[5] )); ib=$(( B[4] + B[5] ))
  (( tb > ta )) || { echo 0; return; }
  echo $(( 100 * ( (tb - ta) - (ib - ia) ) / (tb - ta) ))
}
precheck() {
  local bad=0 n sum=0 s mem disk load1 busy
  n="$(nproc)"; (( n >= MIN_CPUS )) || { echo "##### precheck: vCPU=$n < $MIN_CPUS"; bad=1; }
  mem="$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)"; (( mem >= MIN_MEM_MB )) || { echo "##### precheck: MemAvailable=${mem} МБ < $MIN_MEM_MB"; bad=1; }
  disk="$(df -Pm "$RUNNER_ROOT" | awk 'NR==2{print $4}')"; (( disk >= MIN_DISK_MB )) || { echo "##### precheck: свободно ${disk} МБ < $MIN_DISK_MB"; bad=1; }
  load1="$(cut -d' ' -f1 /proc/loadavg)"
  awk -v l="$load1" -v m="$MAX_LOAD1" 'BEGIN{exit !(l <= m)}' || { echo "##### precheck: loadavg1=$load1 > $MAX_LOAD1 (стенд/хост под нагрузкой)"; bad=1; }
  for _ in 1 2 3; do s="$(cpu_busy_pct 5)"; sum=$(( sum + s )); done; busy=$(( sum / 3 ))
  (( busy <= MAX_BUSY_PCT )) || { echo "##### precheck: CPU занят на ${busy}% (3x5 с) > ${MAX_BUSY_PCT}% (стенд под нагрузкой)"; bad=1; }
  # чужие контейнеры раннера, остатки прошлого бенчмарка, занятые порты
  s="$(docker ps -q --filter 'label=twomc-runner-job' | wc -l)"; (( s == 0 )) || { echo "##### precheck: работают контейнеры раннера: $s"; bad=1; }
  s="$(docker ps -aq --filter 'name=^lb-' | wc -l)"; (( s == 0 )) || { echo "##### precheck: остались контейнеры lb-*: $s"; bad=1; }
  if ss -ltn 2>/dev/null | grep -qE ':(18081|18082|18083|18084)\s'; then echo "##### precheck: заняты порты 18081-18084"; bad=1; fi
  echo "##### precheck: vCPU=$n MemAvailable=${mem}МБ disk=${disk}МБ loadavg1=$load1 cpu_busy=${busy}% (порог загрузки ${MAX_BUSY_PCT}%, loadavg ${MAX_LOAD1})"
  return $bad
}
echo "##### bench: проверка «стенд не под нагрузкой»"
precheck || { echo "##### bench: СТАРТ ОТМЕНЁН - стенд под нагрузкой или не хватает ресурсов (код 20); повторить в согласованное окно"; exit 20; }

# ---- статические проверки сценария и входных данных
bash -n "$ROOT/bench/run-bench.sh" || { echo "##### bench: run-bench.sh не проходит bash -n"; exit 2; }
echo "##### bench: bash -n run-bench.sh ok"
if [[ "$precheck_only" == 1 ]]; then
  if [[ -n "${OHA_IMAGE:-}" ]]; then
    if timeout 60 docker manifest inspect "$OHA_IMAGE" >/dev/null 2>&1; then echo "##### bench: образ OHA_IMAGE доступен"; else echo "##### bench: образ OHA_IMAGE НЕ найден/недоступен"; exit 2; fi
  else
    echo "##### bench: OHA_IMAGE не задан (для реального запуска обязателен)"
  fi
  echo "##### bench: BENCH_PRECHECK_ONLY=1 - бенчмарк НЕ запускался"
  exit 0
fi
[[ -n "${OHA_IMAGE:-}" ]] || { echo "##### bench: задайте --env OHA_IMAGE=<образ:закреплённый-тег>"; exit 2; }
[[ "$OHA_IMAGE" == *:* && "$OHA_IMAGE" != *:latest ]] || { echo "##### bench: OHA_IMAGE должен иметь закреплённый тег (не latest)"; exit 2; }

# ---- запуск
export BENCH_LABEL="twomc-runner-job=$id" OUT="$out" RUN_ID="$id"
{
  echo "id=$id"; echo "started=$(date -u +%FT%TZ)"; echo "kernel=$(uname -sr)"; echo "vcpu=$(nproc)"
  echo "loadavg_before=$(cut -d' ' -f1-3 /proc/loadavg)"; docker version --format 'docker={{.Server.Version}}'
  for v in OHA_IMAGE PROFILE DB_LATENCY_MS DATASET_FILE RULES IMPLS LEVELS DURATION WARMUP REPEATS NODE_IMAGE MEM HEAP SERVER_NCPU SERVER_CPUS LOADGEN_CPUS LOADGEN_NCPU JAVA_GC; do
    [[ -z "${!v:-}" ]] || echo "$v=${!v}"
  done
} > "$out/runner-env.txt"
echo "##### bench: старт run-bench.sh (nice 15, ionice idle), OUT=out, BENCH_LABEL=$BENCH_LABEL"
nice -n 15 ionice -c3 bash "$ROOT/bench/run-bench.sh"; rc=$?
echo "##### bench: run-bench.sh rc=$rc"
{ echo "finished=$(date -u +%FT%TZ)"; echo "loadavg_after=$(cut -d' ' -f1-3 /proc/loadavg)"; echo "run_bench_rc=$rc"; } >> "$out/runner-env.txt"
# digest/ID собранных образов (воспроизводимость), затем удаление образов бенчмарка (результаты уже в out)
for n in ts-current ts-batch rust java; do docker image inspect "langbench-$n" --format "image langbench-$n {{.Id}} {{.Size}} bytes" 2>/dev/null; done >> "$out/runner-env.txt"
for n in ts-current ts-batch rust java; do docker rmi -f "langbench-$n" >/dev/null 2>&1 || true; done
if [[ -f "$out/summary.md" ]]; then echo "##### bench: summary.md"; head -n 60 "$out/summary.md" | sed 's/^/##### /'; fi
echo "##### bench: результаты $(find "$out" -type f | wc -l) файл(ов), $(du -sm "$out" | cut -f1) МБ"
exit "$rc"
