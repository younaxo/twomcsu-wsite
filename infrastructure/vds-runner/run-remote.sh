#!/usr/bin/env bash
# ЛОКАЛЬНО: поставить тяжёлое задание в очередь раннера на VDS, дождаться и забрать итог (лог, сводка, код возврата).
#   run-remote.sh <unit|api-e2e|web-build|docker-build> [--ref <git-ref> | --worktree <путь>] [--include-untracked] [--out <каталог>] [--no-wait] [--timeout <мин>]
#   run-remote.sh --attach <id> [--out <каталог>] [--timeout <мин>]     # дождаться/забрать ранее поставленное задание
# По умолчанию снимок = git archive origin/main (после git fetch). --worktree: ТОЛЬКО tracked-файлы рабочей копии (с незакоммиченными правками;
# новые файлы - `git add -N <файл>` или флаг --include-untracked); denylist секретов/дампов/мусора - lib/wt-filter.sh; список исключённого и неотслеживаемого печатается.
# Код возврата: код задания на сервере (0 = успех); 70 - тайм-аут ожидания (задание продолжает работать; используйте --attach);
# 255 - сбой SSH (НЕ повторять подряд: остановитесь и разберитесь).
# Доступ к VDS: только через lib/vds-ssh.sh (блокировка, twomc@VDS_HOST, ключ, BatchMode, StrictHostKeyChecking=yes).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vds-ssh.sh
source "$HERE/lib/vds-ssh.sh"
# shellcheck source=lib/wt-filter.sh
source "$HERE/lib/wt-filter.sh"
trap vds_exit_cleanup EXIT

JOB=""; REF=""; WT=""; OUT=""; INCLUDE_UNTRACKED=0; NOWAIT=0; ATTACH=""; TIMEOUT_MIN=60
usage() { sed -n '2,14p' "${BASH_SOURCE[0]}" >&2; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?}"; shift 2 ;;
    --worktree) WT="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --include-untracked) INCLUDE_UNTRACKED=1; shift ;;
    --no-wait) NOWAIT=1; shift ;;
    --attach) ATTACH="${2:?}"; shift 2 ;;
    --timeout) TIMEOUT_MIN="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Неизвестный флаг: $1" >&2; usage ;;
    *) [[ -z "$JOB" ]] || usage; JOB="$1"; shift ;;
  esac
done
[[ "$TIMEOUT_MIN" =~ ^[0-9]+$ ]] || { echo "--timeout: число минут" >&2; exit 2; }
if [[ -z "$ATTACH" ]]; then
  [[ "$JOB" =~ ^(unit|api-e2e|web-build|docker-build)$ ]] || { echo "Задание: unit | api-e2e | web-build | docker-build" >&2; usage; }
  [[ -z "$REF" || -z "$WT" ]] || { echo "--ref и --worktree взаимоисключающие" >&2; exit 2; }
fi

REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
vds_stage_new   # STAGE_TMP=twomc-stage.*; системные TMP/TEMP/TMPDIR не трогаются и не переопределяются

if [[ -z "$ATTACH" ]]; then
  # ---- снимок кода
  if [[ -n "$WT" ]]; then
    [[ -d "$WT" ]] || { echo "Нет каталога $WT" >&2; exit 2; }
    SRC_REPO="$(git -C "$WT" rev-parse --show-toplevel)"
    REF_DESC="worktree-$(git -C "$SRC_REPO" rev-parse --short=8 HEAD)"
    # tracked-файлы + (только с --include-untracked) неотслеживаемые не игнорируемые; удалённые на диске пропускаются; denylist - lib/wt-filter.sh.
    : > "$STAGE_TMP/files.txt"; : > "$STAGE_TMP/untracked.txt"; : > "$STAGE_TMP/denied.txt"
    while IFS= read -r -d '' f; do
      [[ -f "$SRC_REPO/$f" ]] || continue
      if wt_denied "$f"; then echo "$f" >> "$STAGE_TMP/denied.txt"; else echo "$f" >> "$STAGE_TMP/files.txt"; fi
    done < <(cd "$SRC_REPO" && git ls-files -z --cached)
    while IFS= read -r -d '' f; do
      [[ -f "$SRC_REPO/$f" ]] || continue
      if wt_denied "$f"; then echo "$f" >> "$STAGE_TMP/denied.txt"
      else
        echo "$f" >> "$STAGE_TMP/untracked.txt"
        if [[ "$INCLUDE_UNTRACKED" == 1 ]]; then echo "$f" >> "$STAGE_TMP/files.txt"; fi
      fi
    done < <(cd "$SRC_REPO" && git ls-files -z --others --exclude-standard)
    if [[ -s "$STAGE_TMP/denied.txt" ]]; then echo "Исключено denylist-ом (секреты/дампы/мусор): $(wc -l < "$STAGE_TMP/denied.txt") файл(ов)"; head -n 20 "$STAGE_TMP/denied.txt" | sed 's/^/  - /'; fi
    if [[ -s "$STAGE_TMP/untracked.txt" ]]; then
      if [[ "$INCLUDE_UNTRACKED" == 1 ]]; then echo "ВКЛЮЧЕНЫ неотслеживаемые файлы ($(wc -l < "$STAGE_TMP/untracked.txt")):"
      else echo "НЕ включены неотслеживаемые файлы ($(wc -l < "$STAGE_TMP/untracked.txt")); нужные - 'git add -N <файл>' или флаг --include-untracked:"; fi
      head -n 50 "$STAGE_TMP/untracked.txt" | sed 's/^/  ? /'
    fi
    [[ -s "$STAGE_TMP/files.txt" ]] || { echo "Список файлов пуст" >&2; exit 2; }
    ( cd "$SRC_REPO" && tar -czf "$STAGE_TMP/code.tar.gz" -T "$STAGE_TMP/files.txt" )
  else
    REF="${REF:-origin/main}"
    git -C "$REPO" fetch origin --quiet || echo "предупреждение: git fetch не удался, используется локальный $REF" >&2
    SHA="$(git -C "$REPO" rev-parse --short=8 "$REF^{commit}")"
    REF_DESC="$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._/-' '-' | cut -c1-40)@$SHA"
    git -C "$REPO" archive --format=tar.gz -o "$STAGE_TMP/code.tar.gz" "$REF"
  fi
  # ---- бандл: meta.env + code.tar.gz + ops (скрипты раннера этой версии)
  ID="$(date -u +%Y%m%dT%H%M%SZ)-$JOB-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
  mkdir -p "$STAGE_TMP/bundle"
  { echo "JOB=$JOB"; echo "REF_DESC=$REF_DESC"; echo "CREATED=$(date -u +%FT%TZ)"; } > "$STAGE_TMP/bundle/meta.env"
  mv "$STAGE_TMP/code.tar.gz" "$STAGE_TMP/bundle/code.tar.gz"
  cp -r "$HERE/server/ops" "$STAGE_TMP/bundle/ops"
  tar -cf "$STAGE_TMP/bundle-$ID.tar" -C "$STAGE_TMP/bundle" .
  SIZE_MB="$(( $(wc -c < "$STAGE_TMP/bundle-$ID.tar") / 1048576 ))"
  echo "Задание $JOB, id=$ID, снимок $REF_DESC (~${SIZE_MB} МБ)"
  # ---- загрузка (один ssh в приватный ~/.twomc-inbox) и постановка в очередь (один ssh)
  vds_put_inbox "$STAGE_TMP/bundle-$ID.tar" "twomcr-$ID.tar"
  vds_ssh_script "$HERE/server/remote/enqueue.sh" "$ID"
  echo "$ID" > "$STAGE_TMP/last-id"
  [[ "$NOWAIT" == 0 ]] || { echo "Поставлено в очередь. Забрать позже: run-remote.sh --attach $ID"; exit 0; }
else
  ID="$ATTACH"
  [[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
fi

# ---- ожидание: короткие опросы (блокировка только на время опроса), интервал растёт 10 -> 45 с
OUT="${OUT:-$PWD/vds-runner-out/$ID}"
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 )); interval=10; last_state=""
while :; do
  vds_ssh_script "$HERE/server/remote/status.sh" "$ID" > "$STAGE_TMP/status.txt"
  state="$(sed -n 's/^STATE=//p' "$STAGE_TMP/status.txt" | head -1)"
  detail="$( { grep -E '^(POSITION|LAST|NOTE)=' "$STAGE_TMP/status.txt" || true; } | tr '\n' ' ' | cut -c1-220)"
  if [[ "$state $detail" != "$last_state" ]]; then echo "[$(date +%H:%M:%S)] $state $detail"; last_state="$state $detail"; fi
  case "$state" in
    done) break ;;
    queued|running|orphaned) ;;
    missing|invalid|"") echo "Задание $ID не найдено на сервере" >&2; exit 3 ;;
  esac
  if (( $(date +%s) >= deadline )); then
    echo "Тайм-аут ожидания (${TIMEOUT_MIN} мин). Задание продолжает работу; забрать: run-remote.sh --attach $ID" >&2; exit 70
  fi
  sleep "$interval"; (( interval < 45 )) && interval=$(( interval + 5 ))
done

# ---- забор итога (один ssh, tar.gz в stdout)
mkdir -p "$OUT"
vds_ssh_script "$HERE/server/remote/fetch.sh" "$ID" > "$STAGE_TMP/result.tar.gz"
tar -xzf "$STAGE_TMP/result.tar.gz" -C "$OUT"
EXIT_CODE="$(sed -n 's/^EXIT=//p' "$OUT/result.env" | head -1)"; EXIT_CODE="${EXIT_CODE:-99}"
echo
echo "================ СВОДКА ================"
cat "$OUT/summary.txt"
echo "========================================"
echo "Артефакты: $OUT (result.env, summary.txt, job.log). Код возврата задания: $EXIT_CODE"
if [[ "$EXIT_CODE" != 0 ]]; then echo "---- хвост лога ----"; tail -n 40 "$OUT/job.log"; fi
exit "$EXIT_CODE"
