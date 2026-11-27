#!/usr/bin/env bash
# Задание java-build: сборка по Dockerfile из каталога снимка (--path, например plugins/bridge), целевая стадия `build`
# (в Dockerfile плагина тесты JUnit идут в составе `gradle build`). Из образа извлекаются *.jar, XML-результаты и HTML-отчёт тестов в $dir/out
# (забирает run-remote.sh в --out/out). Исходный Dockerfile НЕ меняется; при отсутствии тега gradle на реестре используется копия Dockerfile.runner
# с ближайшим существующим тегом (Docker Hub, затем зеркало ECR), отметка пишется в сводку.
# Если официальная сборка упала, запускается диагностическая (`gradle build --continue || true`), чтобы получить отчёт тестов и число упавших;
# её jar НЕ годится для выпуска (лежит в out/diag/, код возврата задания остаётся ненулевым). Отклонённый архив диагностики удаляется так же (код 13).
# Коды: 0 успех, 10 нет/недопустим --path или Dockerfile, 11 официальная сборка упала, 12 сборка успешна, но jar не найден.
#       14 только в диагностической ветке: docker create не удался, отчёт тестов недоступен (официальная сборка при этом упала).
#       13 архив из контейнера ОТКЛОНЁН проверкой (симлинк, жёсткая ссылка, спецфайл, `..`, абсолютный путь, нечитаемый tar-листинг) - артефактам не доверять (M-3).
# Песочница: docker build не умеет --cap-drop/no-new-privileges (RUN-шаги идут с набором прав по умолчанию); лимиты --memory/--cpu-shares/--cpu-quota
# передаются, но BuildKit их может игнорировать (см. docs/runbooks/vds-runner.md). Извлечение идёт через `docker create` (код не запускается)
# с --cap-drop ALL, no-new-privileges, --network none; файлы забираются `docker cp ... -` в tar, имена и типы проверяются (без симлинков, `..`, абсолютных путей), распаковка в новый пустой каталог. Сеть сборки - стандартная bridge (нужна только для скачивания зависимостей).
set -uo pipefail
id="$1"; src="$2"; dir="$3"
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"

path="${JOB_PATH:-}"
valid_rel_path "$path" || { echo "##### java-build: недопустимый --path '$path'"; exit 10; }
ctx="$src/$path"
[[ ! -L "$ctx" && ! -L "$ctx/Dockerfile" && "$(realpath -e "$ctx" 2>/dev/null)/" == "$(realpath "$src")/"* ]] || { echo "##### java-build: --path или Dockerfile - симлинк либо выходит за снимок"; exit 10; }
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
    rm -f "$ctx/Dockerfile.runner"   # L2: в снимке может лежать симлинк с этим именем - запись пошла бы по нему
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

REJECTED=0   # 1, если extract_dir отклонил архив (итоговый код 13)
EXTRACT_MAX_BYTES=$(( 1024 * 1024 * 1024 ))   # предел размера одного tar-потока из контейнера

# extract_dir <cid> <путь-в-контейнере> <dest>: `docker cp ... -` в tar-файл, проверка имён и типов, распаковка в НОВЫЙ пустой каталог dest.
# Отклоняется весь архив (код 13, REJECTED=1): абсолютные пути, `..`, симлинки, жёсткие ссылки, спецфайлы, либо `tar -t`/`tar -tv` завершился с ошибкой (L-4). Прочие сбои (размер, mktemp) - код 1. Отсутствие пути в образе - не ошибка (код 0, dest пуст).
# После распаковки (запасная мера) в dest удаляются все не обычные файлы и не каталоги; симлинков к моменту report_* нет.
extract_dir() {
  local cid="$1" cpath="$2" dest="$3" tmp
  rm -rf "$dest"; mkdir -p "$dest"
  tmp="$(mktemp -p "$dir" extract.XXXXXX)" || return 1
  docker cp "$cid:$cpath" - 2>/dev/null | head -c "$EXTRACT_MAX_BYTES" > "$tmp" || true
  if [[ ! -s "$tmp" ]]; then rm -f "$tmp"; return 0; fi
  if (( $(stat -c %s "$tmp") >= EXTRACT_MAX_BYTES )); then echo "##### java-build: $cpath превышает $(( EXTRACT_MAX_BYTES / 1048576 )) МБ, пропущено"; rm -f "$tmp"; return 1; fi
  local names types
  if ! names="$(tar -tf "$tmp" 2>/dev/null)"; then
    echo "##### java-build: $cpath ОТКЛОНЁН (tar -t завершился с ошибкой: архив повреждён или нечитаем)"; REJECTED=1; rm -f "$tmp"; return 13
  fi
  if grep -qE '^/|(^|/)\.\.(/|$)' <<<"$names"; then
    echo "##### java-build: $cpath ОТКЛОНЁН (абсолютные пути или '..' в архиве)"; REJECTED=1; rm -f "$tmp"; return 13
  fi
  if ! types="$(tar -tvf "$tmp" 2>/dev/null)"; then
    echo "##### java-build: $cpath ОТКЛОНЁН (tar -tv завершился с ошибкой: типы файлов не проверены)"; REJECTED=1; rm -f "$tmp"; return 13
  fi
  if cut -c1 <<<"$types" | grep -qv '[-d]'; then
    echo "##### java-build: $cpath ОТКЛОНЁН (симлинки, жёсткие ссылки или спецфайлы в архиве)"; REJECTED=1; rm -f "$tmp"; return 13
  fi
  tar -xf "$tmp" -C "$dest" --no-same-owner --no-same-permissions 2>/dev/null || echo "##### java-build: предупреждение: tar завершился с ошибкой для $cpath"
  rm -f "$tmp"
  find "$dest" -mindepth 1 ! -type f ! -type d -delete 2>/dev/null || true
  chmod -R u+rwX,go-w "$dest" 2>/dev/null || true
  return 0
}

extract() { # extract <image> <dest>: libs, test-results, reports из рабочего каталога образа (без запуска кода)
  local img="$1" dest="$2" cid wd rc=0
  mkdir -p "$dest"
  wd="$(docker image inspect -f '{{.Config.WorkingDir}}' "$img" 2>/dev/null)"; wd="${wd:-/home/gradle/src}"
  cid="$(docker create --cap-drop ALL --security-opt no-new-privileges --network none --label "twomc-runner-job=$id" "$img" true 2>/dev/null)" || { rmdir "$dest" 2>/dev/null; return 14; }   # 14: контейнер не создан, ничего не извлечено
  extract_dir "$cid" "$wd/build/libs/." "$dest/libs" || rc=1
  extract_dir "$cid" "$wd/build/test-results/test/." "$dest/test-results" || rc=1
  extract_dir "$cid" "$wd/build/reports/tests/test/." "$dest/reports" || rc=1
  docker rm -f "$cid" >/dev/null 2>&1 || true
  return $rc
}

# diag_collect <image>: извлечение и отчёт диагностической сборки. Коды: 0 готово, 13 архив ОТКЛОНЁН (out/diag удалён, report_* не вызываются),
# 14 docker create не удался (out/diag удалён, ничего не читается; код задания 14).
diag_collect() {
  local erc=0
  extract "$1" "$out/diag" || erc=$?
  if (( REJECTED )); then
    echo "##### java-build: архив диагностической сборки ОТКЛОНЁН проверкой - out/diag удалён, артефактам не доверять (код 13)"
    rm -rf "$out/diag"; return 13
  fi
  if (( erc == 14 )); then
    echo "##### java-build: диагностическая сборка: docker create не удался, отчёт тестов недоступен (код 14)"
    rm -rf "$out/diag"; return 14
  fi
  report_jars "$out/diag/libs"
  report_tests "$out/diag/test-results"
  return 0
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
  done | head -n 60 | sed 's/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&amp;/\&/g'
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

tag="twomcr-${id,,}-java"      # docker требует нижний регистр в имени образа (id содержит заглавные T и Z)
echo "##### java-build: сборка (официальный Dockerfile, цель build, тесты в составе gradle build)"
t0=$SECONDS
build_image "$dockerfile" "$tag" "$out/build.log"; brc=$?
echo "##### java-build: docker build rc=$brc ($(( SECONDS - t0 )) с)"
tail -n 25 "$out/build.log" | sed -E 's/^#[0-9]+ [0-9.]+ //' | sed 's/^/    build.log | /'

rc=0
if (( brc == 0 )); then
  extract "$tag" "$out" || echo "##### java-build: извлечение не удалось или архив отклонён (см. выше)"
  if (( REJECTED )); then
    echo "##### java-build: архив из контейнера ОТКЛОНЁН проверкой - артефакты не использовать (код 13)"
    rm -rf "$out/libs" "$out/test-results" "$out/reports"; rc=13
  else
    report_jars "$out/libs"; report_tests "$out/test-results"
    compgen -G "$out/libs/*.jar" >/dev/null || { echo "##### java-build: jar не найден в build/libs"; rc=12; }
  fi
else
  rc=11; dcr=0
  report_javac "$out/build.log"
  if grep -qE '^RUN gradle ' "$dockerfile"; then
    echo "##### java-build: ДИАГНОСТИЧЕСКАЯ сборка (gradle build --continue || true), jar из неё не годится для выпуска"
    rm -f "$ctx/Dockerfile.runner-diag"
    sed -E 's#^(RUN gradle .*)$#\1 --continue || true#' "$dockerfile" > "$ctx/Dockerfile.runner-diag"
    build_image "$ctx/Dockerfile.runner-diag" "$tag-diag" "$out/build-diag.log"; drc=$?
    echo "##### java-build: диагностическая сборка rc=$drc"
    if (( drc == 0 )); then
      diag_collect "$tag-diag"; dcr=$?
      (( dcr == 13 )) && rc=13   # как в ветке успеха: отклонение архива меняет код задания на 13
      (( dcr == 14 )) && rc=14   # docker create не удался: отдельный код, официальная сборка по-прежнему упала (см. build.log)
    fi
    docker rmi -f "$tag-diag" >/dev/null 2>&1 || true
  fi
fi
docker rmi -f "$tag" >/dev/null 2>&1 || true
echo "##### java-build rc=$rc"
exit "$rc"
