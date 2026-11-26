#!/usr/bin/env bash
# ЛОКАЛЬНО: синхронизация публичных картинок сайта на CDN ОДНОЙ командой.
#   infrastructure/cdn/sync-cdn.sh [--ref <git-ref>] [--dry-run]
# Источник: apps/web/public (tracked-файлы рабочей копии; с --ref - содержимое коммита). Путь на CDN = путь внутри apps/web/public:
#   apps/web/public/assets/a.png -> https://cdn-files.twomc.su/assets/a.png
# В выкладку попадают ТОЛЬКО публичные изображения: png, jpg, jpeg, webp, avif, svg, ico - с проверкой типа по сигнатуре, лимитом размера
# (8 МБ), безопасным именем и без «приватных» имён (secret, private, credential, password, token, .env, backup, dump, key, pem, .map).
# SVG со скриптами/обработчиками/внешними ссылками отклоняются. Прочее пропускается с причиной.
# Транспорт: один scp + один ssh под общей блокировкой (lib/vds-lock.sh), доступ только twomc@VDS по ключу.
# На сервере: проверка sha256, мягкая квота, rsync, удаление только прежде выложенных этой же синхронизацией файлов.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../vds-runner/lib/vds-ssh.sh
source "$HERE/../vds-runner/lib/vds-ssh.sh"
trap vds_exit_cleanup EXIT
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
CDN_DOMAIN="${CDN_DOMAIN:-cdn-files.twomc.su}"
MAX_BYTES=$(( 8 * 1048576 ))
REF=""; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

vds_stage_new
mkdir -p "$STAGE_TMP/src" "$STAGE_TMP/stage"
PUB="apps/web/public"

# ---- источник
if [[ -n "$REF" ]]; then
  git -C "$REPO" archive "$REF" "$PUB" | tar -x -C "$STAGE_TMP/src"
  DESC="$REF"
else
  ( cd "$REPO" && git ls-files -z -- "$PUB" | tr '\0' '\n' | while IFS= read -r f; do [[ -f "$f" ]] && printf '%s\n' "$f"; done > "$STAGE_TMP/list.txt" )
  ( cd "$REPO" && tar -cf - -T "$STAGE_TMP/list.txt" ) | tar -x -C "$STAGE_TMP/src"
  DESC="worktree"
fi
[[ -d "$STAGE_TMP/src/$PUB" ]] || { echo "Нет $PUB в источнике" >&2; exit 1; }

# ---- фильтр
hex() { od -An -tx1 -N12 "$1" | tr -d ' \n'; }
check_sig() {   # $1 файл, $2 расширение (нижний регистр)
  local h; h="$(hex "$1")"
  case "$2" in
    png) [[ "$h" == 89504e470d0a1a0a* ]] ;;
    jpg|jpeg) [[ "$h" == ffd8ff* ]] ;;
    webp) [[ "${h:0:8}" == 52494646 && "${h:16:8}" == 57454250 ]] ;;
    avif) [[ "${h:8:8}" == 66747970 ]] && head -c 32 "$1" | grep -aqE 'avif|avis' ;;
    ico) [[ "$h" == 00000100* ]] ;;
    svg) head -c 1024 "$1" | grep -aqiE '<svg' ;;
    *) return 1 ;;
  esac
}
SVG_BAD='<script|<foreignObject|<iframe|<!ENTITY|javascript:|[[:space:]]on[a-z]+[[:space:]]*=|href[[:space:]]*=[[:space:]]*["'"'"'][[:space:]]*(https?:|//|data:text/html)'
PRIVATE_RE='(secret|private|credential|password|passwd|token|\.env|backup|dump|\.key|\.pem|\.map$|\.sql|\.zip|\.tar)'
kept=0; skipped=0; : > "$STAGE_TMP/skipped.txt"
while IFS= read -r -d '' abs; do
  rel="${abs#"$STAGE_TMP/src/$PUB/"}"
  ext="${rel##*.}"   # регистр НЕ меняем: сервер (cdn-apply.sh) принимает только расширения в нижнем регистре
  reason=""
  if [[ ! "$ext" =~ ^(png|jpg|jpeg|webp|avif|svg|ico)$ ]]; then reason="не изображение из белого списка (расширение только в нижнем регистре)"
  elif [[ ! "$rel" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then reason="небезопасное имя"
  elif [[ "$rel" =~ (^|/)\.\.?(/|$) ]]; then reason="точечный сегмент"
  elif printf '%s' "$rel" | grep -qiE "$PRIVATE_RE"; then reason="похоже на приватное"
  elif (( $(wc -c < "$abs") > MAX_BYTES )); then reason="больше 8 МБ"
  elif ! check_sig "$abs" "$ext"; then reason="сигнатура не соответствует расширению"
  elif [[ "$ext" == svg ]] && grep -aqiE "$SVG_BAD" "$abs"; then reason="SVG с активным содержимым"
  fi
  if [[ -n "$reason" ]]; then printf '%s\t%s\n' "$rel" "$reason" >> "$STAGE_TMP/skipped.txt"; skipped=$((skipped+1)); continue; fi
  mkdir -p "$STAGE_TMP/stage/$(dirname "$rel")"; cp -- "$abs" "$STAGE_TMP/stage/$rel"; kept=$((kept+1))
done < <(find "$STAGE_TMP/src/$PUB" -type f -print0)

echo "Источник: $DESC; к выкладке: $kept, пропущено: $skipped"
if [[ -s "$STAGE_TMP/skipped.txt" ]]; then echo "Пропущены (не публичные изображения или не прошли проверку):"; sed 's/^/  /' "$STAGE_TMP/skipped.txt"; fi
(( kept > 0 )) || { echo "Нечего выкладывать (пустой набор не отправляется: он бы удалил прежние файлы)" >&2; exit 1; }
( cd "$STAGE_TMP/stage" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | sed 's/^/  + /' )
if [[ "$DRY" == 1 ]]; then echo "--dry-run: на сервер ничего не отправлено"; exit 0; fi

# ---- бандл и отправка
ID="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
mkdir -p "$STAGE_TMP/bundle"
( cd "$STAGE_TMP/stage" && tar -czf "$STAGE_TMP/bundle/files.tar.gz" . && find . -type f | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum > "$STAGE_TMP/bundle/files.sha256" )
cp -r "$HERE/server" "$STAGE_TMP/bundle/ops"
tar -cf "$STAGE_TMP/cdn-$ID.tar" -C "$STAGE_TMP/bundle" .
vds_put_inbox "$STAGE_TMP/cdn-$ID.tar" "twomc-cdn-$ID.tar"
vds_ssh_script "$HERE/server/remote-entry.sh" "$ID" sync

# ---- проверка снаружи (не под SSH-блокировкой, это обычный HTTPS)
first="$(cd "$STAGE_TMP/stage" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | head -1)"
echo "Проверка: https://$CDN_DOMAIN/$first"
curl -sS -o /dev/null -w 'HTTP %{http_code}, %{content_type}\n' -I "https://$CDN_DOMAIN/$first" || echo "(curl не удался - проверьте DNS/сертификат)"
