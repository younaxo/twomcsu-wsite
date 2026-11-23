#!/usr/bin/env bash
# ЛОКАЛЬНО: поставить тяжёлое задание в очередь раннера на VDS, дождаться и забрать итог (лог, сводка, код возврата).
#   run-remote.sh <unit|api-e2e|web-build|docker-build> [--ref <git-ref> | --worktree <путь>] [--out <каталог>] [--no-wait] [--timeout <мин>]
#   run-remote.sh --attach <id> [--out <каталог>] [--timeout <мин>]     # дождаться/забрать ранее поставленное задание
# По умолчанию снимок = git archive origin/main (после git fetch). --worktree: tracked + неотслеживаемые, не игнорируемые файлы рабочей
# копии с незакоммиченными правками; без .env*, node_modules, .next, dist, ключей/credentials.
# Код возврата: код задания на сервере (0 = успех); 70 - тайм-аут ожидания (задание продолжает работать; используйте --attach);
# 255 - сбой SSH (НЕ повторять подряд: остановитесь и разберитесь).
# Доступ к VDS: только через lib/vds-ssh.sh (блокировка, twomc@VDS_HOST, ключ, BatchMode, StrictHostKeyChecking=yes).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vds-ssh.sh
source "$HERE/lib/vds-ssh.sh"
trap vds_lock_release EXIT

JOB=""; REF=""; WT=""; OUT=""; NOWAIT=0; ATTACH=""; TIMEOUT_MIN=60
usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" >&2; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?}"; shift 2 ;;
    --worktree) WT="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
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
TMP="$(mktemp -d)"
trap 'vds_lock_release; rm -rf "$TMP"' EXIT

if [[ -z "$ATTACH" ]]; then
  # ---- снимок кода
  if [[ -n "$WT" ]]; then
    [[ -d "$WT" ]] || { echo "Нет каталога $WT" >&2; exit 2; }
    SRC_REPO="$(git -C "$WT" rev-parse --show-toplevel)"
    REF_DESC="worktree-$(git -C "$SRC_REPO" rev-parse --short=8 HEAD)"
    # tracked + untracked-не-ignored; удалённые на диске файлы пропускаются; жёсткий фильтр секретов и сборочного мусора.
    ( cd "$SRC_REPO" && git ls-files -z --cached --others --exclude-standard ) \
      | tr '\0' '\n' \
      | grep -vE '(^|/)(\.env[^/]*|node_modules|\.next|dist|\.turbo|coverage)(/|$)|(^|/)[^/]*(\.pem|\.key|\.p12|\.pfx|credentials[^/]*|secrets?)(/|$)|\.tsbuildinfo$' \
      | while IFS= read -r f; do [[ -f "$SRC_REPO/$f" ]] && printf '%s\n' "$f"; done > "$TMP/files.txt" || true
    [[ -s "$TMP/files.txt" ]] || { echo "Список файлов пуст" >&2; exit 2; }
    ( cd "$SRC_REPO" && tar -czf "$TMP/code.tar.gz" -T "$TMP/files.txt" )
  else
    REF="${REF:-origin/main}"
    git -C "$REPO" fetch origin --quiet || echo "предупреждение: git fetch не удался, используется локальный $REF" >&2
    SHA="$(git -C "$REPO" rev-parse --short=8 "$REF^{commit}")"
    REF_DESC="$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._/-' '-' | cut -c1-40)@$SHA"
    git -C "$REPO" archive --format=tar.gz -o "$TMP/code.tar.gz" "$REF"
  fi
  # ---- бандл: meta.env + code.tar.gz + ops (скрипты раннера этой версии)
  ID="$(date -u +%Y%m%dT%H%M%SZ)-$JOB-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
  mkdir -p "$TMP/bundle"
  { echo "JOB=$JOB"; echo "REF_DESC=$REF_DESC"; echo "CREATED=$(date -u +%FT%TZ)"; } > "$TMP/bundle/meta.env"
  mv "$TMP/code.tar.gz" "$TMP/bundle/code.tar.gz"
  cp -r "$HERE/server/ops" "$TMP/bundle/ops"
  tar -cf "$TMP/bundle-$ID.tar" -C "$TMP/bundle" .
  SIZE_MB="$(( $(wc -c < "$TMP/bundle-$ID.tar") / 1048576 ))"
  echo "Задание $JOB, id=$ID, снимок $REF_DESC (~${SIZE_MB} МБ)"
  # ---- загрузка (один scp) и постановка в очередь (один ssh)
  ( cd "$TMP" && vds_scp_put "bundle-$ID.tar" "/tmp/twomcr-$ID.tar" )
  vds_ssh_script "$HERE/server/remote/enqueue.sh" "$ID"
  echo "$ID" > "$TMP/last-id"
  [[ "$NOWAIT" == 0 ]] || { echo "Поставлено в очередь. Забрать позже: run-remote.sh --attach $ID"; exit 0; }
else
  ID="$ATTACH"
  [[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
fi

# ---- ожидание: короткие опросы (блокировка только на время опроса), интервал растёт 10 -> 45 с
OUT="${OUT:-$PWD/vds-runner-out/$ID}"
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 )); interval=10; last_state=""
while :; do
  vds_ssh_script "$HERE/server/remote/status.sh" "$ID" > "$TMP/status.txt"
  state="$(sed -n 's/^STATE=//p' "$TMP/status.txt" | head -1)"
  detail="$( { grep -E '^(POSITION|LAST|NOTE)=' "$TMP/status.txt" || true; } | tr '\n' ' ' | cut -c1-220)"
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
vds_ssh_script "$HERE/server/remote/fetch.sh" "$ID" > "$TMP/result.tar.gz"
tar -xzf "$TMP/result.tar.gz" -C "$OUT"
EXIT_CODE="$(sed -n 's/^EXIT=//p' "$OUT/result.env" | head -1)"; EXIT_CODE="${EXIT_CODE:-99}"
echo
echo "================ СВОДКА ================"
cat "$OUT/summary.txt"
echo "========================================"
echo "Артефакты: $OUT (result.env, summary.txt, job.log). Код возврата задания: $EXIT_CODE"
if [[ "$EXIT_CODE" != 0 ]]; then echo "---- хвост лога ----"; tail -n 40 "$OUT/job.log"; fi
exit "$EXIT_CODE"
