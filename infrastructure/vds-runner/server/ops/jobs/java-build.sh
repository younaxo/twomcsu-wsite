#!/usr/bin/env bash
# Задание java-build: сборка по Dockerfile из каталога снимка (--path, например plugins/bridge), целевая стадия `build`
# (в Dockerfile плагина тесты JUnit идут в составе `gradle build`). Из образа извлекаются *.jar, XML-результаты и HTML-отчёт тестов в $dir/out
# (забирает run-remote.sh в --out/out). Исходный Dockerfile НЕ меняется; при отсутствии тега gradle на реестре используется копия Dockerfile.runner
# с ближайшим существующим тегом (Docker Hub, затем зеркало ECR), отметка пишется в сводку.
# Если официальная сборка упала, запускается диагностическая (`gradle build --continue || true`), чтобы получить отчёт тестов и число упавших;
# её jar НЕ годится для выпуска (лежит в out/diag/, код возврата задания остаётся ненулевым).
# Коды: 0 успех, 10 нет/недопустим --path или Dockerfile, 11 официальная сборка упала, 12 сборка успешна, но jar не найден.
# Песочница: docker build не умеет --cap-drop/no-new-privileges (RUN-шаги идут с набором прав по умолчанию); лимиты --memory/--cpu-shares/--cpu-quota
# передаются, но BuildKit их может игнорировать (см. docs/runbooks/vds-runner.md). Извлечение идёт через `docker create` (код не запускается)
# с --cap-drop ALL, no-new-privileges, --network none. Сеть сборки - стандартная bridge (нужна только для скачивания зависимостей).
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"

path="${JOB_PATH:-}"
valid_rel_path "$path" || { echo "##### java-build: недопустимый --path '$path'"; exit 10; }
ctx="$src/$path"
[[ -f "$ctx/Dockerfile" ]] || { echo "##### java-build: нет $path/Dockerfile в снимке"; exit 10; }
out="$dir/out"; mkdir -p "$out"
echo "##### java-build path=$path"
{ docker version --format 'docker client {{.Client.Version}}, server {{.Server.Version}}' 2>/dev/null; docker buildx version 2>/dev/null | head -1; } | sed 's/^/##### builder: /'

# ---- выбор образа gradle: оригинал, иначе ближайший существующий <мажор.минор>.<патч вниз>-<суффикс> на Docker Hub, затем на ECR
orig_from="$(grep -m1 -E '^FROM gradle:[^ ]+' "$ctx/Dockerfile" || true)"
dockerfile="$ctx/Dockerfile"
if [[ -n "$orig_from" ]]; then
  orig_tag="$(sed -E 's/^FROM gradle:([^ ]+).*/\1/' <<<"$orig_from")"
  chosen=""
  if [[ "$orig_tag" =~ ^([0-9]+\.[0-9]+)(\.([0-9]+))?-(.+)$ ]]; then
    mm="${BASH_REMATCH[1]}"; patch="${BASH_REMATCH[3]:-0}"; suffix="${BASH_REMATCH[4]}"
    cands=("$orig_tag"); for (( p = patch - 1; p >= 1; p-- )); do cands+=("$mm.$p-$suffix"); done; cands+=("$mm-$suffix")
    for t in "${cands[@]}"; do
      for reg in "" "$ECR_LIBRARY/"; do
        if timeout 60 docker manifest inspect "${reg}gradle:$t" >/dev/null 2>&1; then chosen="${reg}gradle:$t"; break 2; fi
      done
    done
  fi
  if [[ -z "$chosen" ]]; then
    echo "##### gradle-image: проверка тегов не дала результата, используется Dockerfile как есть ($orig_tag)"
  elif [[ "$chosen" == "gradle:$orig_tag" ]]; then
    echo "##### gradle-image: $chosen (как в Dockerfile, на Docker Hub)"
  else
    echo "##### gradle-image: ЗАМЕНА gradle:$orig_tag -> $chosen (копия Dockerfile.runner; исходный Dockerfile не изменён)"
    sed -E "s|^FROM gradle:[^ ]+|FROM $chosen|" "$ctx/Dockerfile" > "$ctx/Dockerfile.runner"
    dockerfile="$ctx/Dockerfile.runner"
  fi
fi

build_image() { # build_image <dockerfile> <tag> <logfile>: код docker build
  nice -n 15 docker build --progress=plain --target build \
    --cpu-shares "$CPU_SHARES" --memory "$JAVA_BUILD_MEM" --memory-swap "$JAVA_BUILD_MEM" --cpu-quota "$(( JAVA_BUILD_CPUS * 100000 ))" \
    -f "$1" -t "$2" --label "twomc-runner-job=$id" "$ctx" > "$3" 2>&1
  return $?
}

extract() { # extract <image> <dest>: libs, test-results, reports из рабочего каталога образа (без запуска кода)
  local img="$1" dest="$2" cid wd
  mkdir -p "$dest/libs" "$dest/test-results" "$dest/reports"
  wd="$(docker image inspect -f '{{.Config.WorkingDir}}' "$img" 2>/dev/null)"; wd="${wd:-/home/gradle/src}"
  cid="$(docker create --cap-drop ALL --security-opt no-new-privileges --network none --label "twomc-runner-job=$id" "$img" true 2>/dev/null)" || return 1
  docker cp "$cid:$wd/build/libs/." "$dest/libs/" >/dev/null 2>&1 || true
  docker cp "$cid:$wd/build/test-results/test/." "$dest/test-results/" >/dev/null 2>&1 || true
  docker cp "$cid:$wd/build/reports/tests/test/." "$dest/reports/" >/dev/null 2>&1 || true
  docker rm -f "$cid" >/dev/null 2>&1 || true
}

report_tests() { # report_tests <каталог test-results>: суммы и перечень упавших
  local d="$1" tot=0 fail=0 err=0 skip=0 f line n
  shopt -s nullglob
  for f in "$d"/*.xml; do
    line="$(grep -m1 -o '<testsuite [^>]*>' "$f" || true)"; [[ -n "$line" ]] || continue
    n="$(sed -n 's/.* tests="\([0-9]*\)".*/\1/p' <<<"$line")";    tot=$(( tot + ${n:-0} ))
    n="$(sed -n 's/.* failures="\([0-9]*\)".*/\1/p' <<<"$line")"; fail=$(( fail + ${n:-0} ))
    n="$(sed -n 's/.* errors="\([0-9]*\)".*/\1/p' <<<"$line")";   err=$(( err + ${n:-0} ))
    n="$(sed -n 's/.* skipped="\([0-9]*\)".*/\1/p' <<<"$line")";  skip=$(( skip + ${n:-0} ))
  done
  if (( tot == 0 )); then echo "##### junit: результатов тестов нет (тесты не запускались)"; shopt -u nullglob; return; fi
  echo "##### junit: tests=$tot passed=$(( tot - fail - err - skip )) failed=$fail errors=$err skipped=$skip"
  for f in "$d"/*.xml; do
    awk '/<testcase /{match($0," classname=\"[^\"]*\""); c=substr($0,RSTART+12,RLENGTH-13); match($0," name=\"[^\"]*\""); n=substr($0,RSTART+7,RLENGTH-8)}
         /<(failure|error) /{m=$0; sub(/.*message="/,"",m); sub(/".*/,"",m); print "##### junit-FAILED " c "." n ": " substr(m,1,200)}' "$f"
  done | head -n 60
  shopt -u nullglob
}

report_jars() { # report_jars <каталог libs>
  local j
  shopt -s nullglob
  for j in "$1"/*.jar; do echo "##### jar: $(basename "$j") $(stat -c %s "$j") bytes sha256=$(sha256sum "$j" | cut -c1-16)"; done
  shopt -u nullglob
}

report_javac() { # report_javac <build.log>: ошибки компиляции (javac), первые 80 строк; полный лог - out/build.log
  local log="$1"
  if grep -qE '\.java:[0-9]+: error:' "$log"; then
    echo "##### javac: ошибки компиляции (первые 80 строк, полный лог out/build.log)"
    grep -E -A2 '\.java:[0-9]+: error:' "$log" | sed -E 's/^#[0-9]+ [0-9.]+ //; s/^--$//' | grep -v '^$' | head -n 80 | sed 's/^/##### javac | /'
    grep -E '^(#[0-9]+ [0-9.]+ )?[0-9]+ errors?$' "$log" | sed -E 's/^#[0-9]+ [0-9.]+ //' | sed 's/^/##### javac | /' | tail -1
  fi
  grep -E 'What went wrong|Execution failed for task|Could not resolve|FAILED$' "$log" | sed -E 's/^#[0-9]+ [0-9.]+ //' | sort -u | head -n 20 | sed 's/^/##### gradle | /'
}

tag="twomcr-$id-java"
echo "##### java-build: сборка (официальный Dockerfile, цель build, тесты в составе gradle build)"
t0=$SECONDS
build_image "$dockerfile" "$tag" "$out/build.log"; brc=$?
echo "##### java-build: docker build rc=$brc ($(( SECONDS - t0 )) с)"
tail -n 25 "$out/build.log" | sed -E 's/^#[0-9]+ [0-9.]+ //' | sed 's/^/    build.log | /'

rc=0
if (( brc == 0 )); then
  extract "$tag" "$out" || echo "##### java-build: не удалось создать контейнер для извлечения"
  report_jars "$out/libs"
  report_tests "$out/test-results"
  compgen -G "$out/libs/*.jar" >/dev/null || { echo "##### java-build: jar не найден в build/libs"; rc=12; }
else
  rc=11
  report_javac "$out/build.log"
  if grep -qE '^RUN gradle ' "$dockerfile"; then
    echo "##### java-build: ДИАГНОСТИЧЕСКАЯ сборка (gradle build --continue || true), jar из неё не годится для выпуска"
    sed -E 's#^(RUN gradle .*)$#\1 --continue || true#' "$dockerfile" > "$ctx/Dockerfile.runner-diag"
    build_image "$ctx/Dockerfile.runner-diag" "$tag-diag" "$out/build-diag.log"; drc=$?
    echo "##### java-build: диагностическая сборка rc=$drc"
    if (( drc == 0 )); then
      extract "$tag-diag" "$out/diag"
      report_jars "$out/diag/libs"
      report_tests "$out/diag/test-results"
    fi
    docker rmi -f "$tag-diag" >/dev/null 2>&1 || true
  fi
fi
docker rmi -f "$tag" >/dev/null 2>&1 || true
echo "##### java-build rc=$rc"
exit "$rc"
