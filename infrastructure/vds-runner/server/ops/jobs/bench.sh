#!/usr/bin/env bash
# Задание bench: experiments/lang-bench/bench/run-bench.sh по docs/reports/lang-bench-plan.md (ядра 0-3 заняты на 70-95 минут).
# Вход: снимок кода с experiments/lang-bench/ (--ref/--worktree), параметры - `run-remote.sh bench --env КЛЮЧ=ЗНАЧЕНИЕ` (список ключей - enqueue.sh);
# списки (IMPLS, LEVELS, DOCKER_BUILD_ARGS) передаются через запятую, здесь запятые превращаются в пробелы. OHA_IMAGE обязателен (закреплённый тег).
# Тайм-аут задания не менее 7200 с (worker.sh: job_timeout_for). Контейнеры бенчмарка помечены BENCH_LABEL=twomc-runner-job=<id> и удаляются штатно.
# Весь каталог результатов (OUT) = $dir/out; run-remote.sh забирает его целиком в --out/out.
# Перед стартом проверяется, что стенд не под нагрузкой (CPU, loadavg, память, диск, чужие контейнеры, порты 18081-18084); иначе выход 20, бенчмарк не стартует.
# Параметры проверяются строго (validate_params): диапазоны, PROFILE small|medium|large, cpuset не пересекается и оставляет стенду >= 2 ядер (RUNNER_STAND_MIN_CPUS),
# DOCKER_BUILD_ARGS - только `--no-cache` и `--build-arg NODE_IMAGE=<образ>@sha256:<digest>` (allowlist ключей, M-2); значения --env не начинаются с `-` (L-2). ВАЖНО: run-bench.sh из снимка выполняется на ХОСТЕ (не в песочнице) - только доверенные ветки.
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
  # L-2: значение не должно начинаться с "-" (иначе станет флагом docker/oha); исключения - списки флагов, для них своя проверка в validate_params
  case "$k" in DOCKER_BUILD_ARGS|JAVA_GC) ;; *) [[ "$val" != -* ]] || { echo "##### bench: значение $k не должно начинаться с минуса"; exit 2; } ;; esac
  case "$k" in IMPLS|LEVELS|DOCKER_BUILD_ARGS) val="${val//,/ }" ;; esac
  if [[ "$k" == DATASET_FILE ]]; then valid_rel_path "$val" || { echo "##### bench: недопустимый DATASET_FILE"; exit 2; }; fi
  export "$k=$val"
done
[[ -z "${ENV_BENCH_NODE_IMAGE:-}" ]] || { [[ "$ENV_BENCH_NODE_IMAGE" =~ ^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$ ]] || { echo "##### bench: недопустимый BENCH_NODE_IMAGE"; exit 2; }; export NODE_IMAGE="$ENV_BENCH_NODE_IMAGE"; }
precheck_only="${ENV_BENCH_PRECHECK_ONLY:-0}"

# ---- строгая проверка значений (M2/M3/L3): диапазоны, cpuset не отбирает у стенда ядра, DOCKER_BUILD_ARGS - только --build-arg KEY=VAL и --no-cache
STAND_MIN_CPUS="${RUNNER_STAND_MIN_CPUS:-2}"      # ядер, которые cpuset бенчмарка обязан оставить стенду (на 6 vCPU: бенчмарк 0-3, стенд 4-5)
is_int() { [[ "$1" =~ ^[0-9]{1,6}$ ]]; }          # неотрицательное целое без знака (до 999999)
in_range() { is_int "$1" && (( 10#$1 >= $2 && 10#$1 <= $3 )); }   # in_range <значение> <мин> <макс>
mem_mb() { # mem_mb <NNm|NNg>: мегабайты (код 1 при неверном формате)
  [[ "$1" =~ ^([0-9]{1,5})([mg])$ ]] || return 1
  if [[ "${BASH_REMATCH[2]}" == g ]]; then echo $(( 10#${BASH_REMATCH[1]} * 1024 )); else echo $(( 10#${BASH_REMATCH[1]} )); fi
}
expand_cpus() { # expand_cpus <список вида 0-1,4>: по одному номеру в строке; код 1 - неверный формат или номер >= nproc
  local spec="$1" part a b i ncpu; ncpu="$(nproc)"
  [[ "$spec" =~ ^[0-9]{1,3}(-[0-9]{1,3})?(,[0-9]{1,3}(-[0-9]{1,3})?)*$ ]] || return 1
  for part in ${spec//,/ }; do
    if [[ "$part" == *-* ]]; then a="${part%-*}"; b="${part#*-}"; else a="$part"; b="$part"; fi
    (( 10#$a <= 10#$b && 10#$b < ncpu )) || return 1
    for (( i = 10#$a; i <= 10#$b; i++ )); do echo "$i"; done
  done
}
validate_params() {
  local bad=0 v i ncpu s_list l_list union s_n l_n m h tok expect="" arg_ok=1
  ncpu="$(nproc)"
  for v in OHA_IMAGE NODE_IMAGE DATASET_FILE; do   # L-2: значения не начинаются с "-" (не станут флагом)
    [[ "${!v:-}" != -* ]] || { echo "##### bench: $v не должен начинаться с минуса"; bad=1; }
  done
  # NODE_IMAGE (BENCH_NODE_IMAGE): закреплён по digest, как и значение в DOCKER_BUILD_ARGS
  [[ -z "${NODE_IMAGE:-}" || "$NODE_IMAGE" =~ ^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,150}@sha256:[0-9a-f]{64}$ ]] || { echo "##### bench: NODE_IMAGE (BENCH_NODE_IMAGE) - только <образ>@sha256:<digest>"; bad=1; }
  [[ -z "${PROFILE:-}" || "$PROFILE" =~ ^(small|medium|large)$ ]] || { echo "##### bench: PROFILE должен быть small|medium|large"; bad=1; }
  [[ -z "${DB_LATENCY_MS:-}" ]] || in_range "$DB_LATENCY_MS" 0 10000 || { echo "##### bench: DB_LATENCY_MS - целое 0..10000"; bad=1; }
  [[ -z "${DURATION:-}" ]]  || in_range "$DURATION" 1 3600 || { echo "##### bench: DURATION - целое 1..3600 с"; bad=1; }
  [[ -z "${WARMUP:-}" ]]    || in_range "$WARMUP" 0 3600  || { echo "##### bench: WARMUP - целое 0..3600 с"; bad=1; }
  [[ -z "${REPEATS:-}" ]]   || in_range "$REPEATS" 1 20   || { echo "##### bench: REPEATS - целое 1..20"; bad=1; }
  for v in SERVER_NCPU LOADGEN_NCPU; do
    [[ -z "${!v:-}" ]] || in_range "${!v}" 1 "$ncpu" || { echo "##### bench: $v - целое 1..$ncpu"; bad=1; }
  done
  for v in MEM HEAP; do
    [[ -z "${!v:-}" ]] && continue
    s_n="$(mem_mb "${!v}")" && (( s_n >= 64 && s_n <= 4096 )) || { echo "##### bench: $v - формат NNm|NNg, 64m..4g"; bad=1; }
  done
  if [[ -n "${MEM:-}" && -n "${HEAP:-}" ]]; then
    m="$(mem_mb "$MEM" 2>/dev/null || echo 0)"; h="$(mem_mb "$HEAP" 2>/dev/null || echo 0)"
    (( h < m )) || { echo "##### bench: HEAP должен быть меньше MEM"; bad=1; }
  fi
  [[ -z "${JAVA_GC:-}" || "$JAVA_GC" =~ ^-XX:[+-]?[A-Za-z0-9]{1,40}(=[A-Za-z0-9.]{1,20})?$ ]] || { echo "##### bench: JAVA_GC - одна опция вида -XX:+UseG1GC"; bad=1; }
  for v in IMPLS; do
    for tok in ${IMPLS:-}; do [[ "$tok" =~ ^(ts-current|ts-batch|rust|java)$ ]] || { echo "##### bench: IMPLS - из ts-current ts-batch rust java"; bad=1; break; }; done
  done
  for tok in ${LEVELS:-}; do in_range "$tok" 1 100000 || { echo "##### bench: LEVELS - целые 1..100000"; bad=1; break; }; done
  # DOCKER_BUILD_ARGS (запятые уже заменены пробелами): только `--no-cache` и пары `--build-arg KEY=VAL`
  for tok in ${DOCKER_BUILD_ARGS:-}; do
    if [[ -n "$expect" ]]; then
      # M-2: allowlist КЛЮЧЕЙ - только NODE_IMAGE, значение закреплено по digest (...@sha256:<64 hex>), не начинается с "-"
      [[ "$tok" =~ ^NODE_IMAGE=[A-Za-z0-9][A-Za-z0-9._:/+-]{0,150}@sha256:[0-9a-f]{64}$ ]] || arg_ok=0
      expect=""
    elif [[ "$tok" == --no-cache ]]; then :
    elif [[ "$tok" == --build-arg ]]; then expect=1
    else arg_ok=0
    fi
  done
  [[ -z "$expect" && "$arg_ok" == 1 ]] || { echo "##### bench: DOCKER_BUILD_ARGS - только '--no-cache' и '--build-arg,NODE_IMAGE=<образ>@sha256:<digest>'"; bad=1; }
  # cpuset: формат, номера < nproc, наборы не пересекаются, стенду остаётся >= STAND_MIN_CPUS ядер
  s_list="$(expand_cpus "${SERVER_CPUS:-0-1}")" || { echo "##### bench: SERVER_CPUS - неверный список ядер (0..$(( ncpu - 1 )))"; bad=1; s_list=""; }
  l_list="$(expand_cpus "${LOADGEN_CPUS:-2-3}")" || { echo "##### bench: LOADGEN_CPUS - неверный список ядер (0..$(( ncpu - 1 )))"; bad=1; l_list=""; }
  s_n="$(grep -c . <<<"$s_list")"; l_n="$(grep -c . <<<"$l_list")"
  if [[ -n "$s_list" && -n "$l_list" ]]; then
    union="$(printf '%s\n%s\n' "$s_list" "$l_list" | sort -un | grep -c .)"
    (( union == s_n + l_n )) || { echo "##### bench: SERVER_CPUS и LOADGEN_CPUS пересекаются"; bad=1; }
    (( ncpu - union >= STAND_MIN_CPUS )) || { echo "##### bench: cpuset бенчмарка занимает $union из $ncpu ядер: стенду остаётся $(( ncpu - union )) < $STAND_MIN_CPUS"; bad=1; }
    (( 10#${SERVER_NCPU:-2} <= s_n )) || { echo "##### bench: SERVER_NCPU > числа ядер в SERVER_CPUS ($s_n)"; bad=1; }
    (( 10#${LOADGEN_NCPU:-2} <= l_n )) || { echo "##### bench: LOADGEN_NCPU > числа ядер в LOADGEN_CPUS ($l_n)"; bad=1; }
    echo "##### bench: cpuset: сервер $s_n ядер, нагрузчик $l_n, стенду остаётся $(( ncpu - union )) из $ncpu"
  fi
  return $bad
}
validate_params || { echo "##### bench: недопустимые параметры (код 2)"; exit 2; }

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
