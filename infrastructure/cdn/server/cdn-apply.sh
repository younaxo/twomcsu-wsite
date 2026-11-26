#!/usr/bin/env bash
# СЕРВЕР: применение синхронизации (вызывается из remote-entry.sh с каталогом бандла W: files.tar.gz, files.sha256).
# Проверяет контрольные суммы, квоту (мягкая: CDN_QUOTA_MB / CDN_MAX_FILE_MB / CDN_MAX_FILES из /etc/cdn-files.conf), затем копирует файлы
# и удаляет только те, что раньше были выложены этой же синхронизацией (манифест /srv/cdn-state/site.manifest), чужие каталоги не трогает.
set -euo pipefail
W="${1:?bundle dir}"
ROOT=/srv/cdn-files
STATE=/srv/cdn-state
MANIFEST="$STATE/site.manifest"
CDN_QUOTA_MB=2048; CDN_MAX_FILE_MB=8; CDN_MAX_FILES=5000
# shellcheck disable=SC1091
[[ -f /etc/cdn-files.conf ]] && source /etc/cdn-files.conf
[[ -d "$ROOT" && -d "$STATE" ]] || { echo "CDN не установлен (нет $ROOT): запустите install-cdn.sh" >&2; exit 4; }

stage="$W/stage"; mkdir -p "$stage"
tar -xzf "$W/files.tar.gz" -C "$stage"
( cd "$stage" && sha256sum -c --quiet "$W/files.sha256" ) || { echo "Контрольные суммы не совпали" >&2; exit 5; }
( cd "$stage" && find . -type f | sed 's|^\./||' | LC_ALL=C sort ) > "$W/new.list"
n_new="$(wc -l < "$W/new.list")"
bytes_new="$(cd "$stage" && find . -type f -printf '%s\n' | awk '{s+=$1} END{print s+0}')"
biggest="$(cd "$stage" && find . -type f -printf '%s\n' | sort -n | tail -1)"
(( n_new <= CDN_MAX_FILES )) || { echo "Файлов $n_new > лимита $CDN_MAX_FILES" >&2; exit 6; }
(( ${biggest:-0} <= CDN_MAX_FILE_MB * 1048576 )) || { echo "Есть файл больше ${CDN_MAX_FILE_MB} МБ" >&2; exit 6; }
# Паранойя: имена только из безопасного набора, без точечных сегментов.
if grep -vE '^[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|jpg|jpeg|webp|avif|svg|ico)$' "$W/new.list" | grep -q .; then echo "Недопустимые имена файлов" >&2; exit 6; fi
if grep -qE '(^|/)\.\.?(/|$)|//' "$W/new.list"; then echo "Недопустимые сегменты пути" >&2; exit 6; fi

# Квота: текущее содержимое минус заменяемые/удаляемые файлы плюс новые.
used="$(du -sb "$ROOT" | cut -f1)"
freed=0
while IFS= read -r f; do [[ -f "$ROOT/$f" ]] && freed=$(( freed + $(stat -c %s "$ROOT/$f") )); done < <(cat "$W/new.list"; [[ -f "$MANIFEST" ]] && cut -f2- "$MANIFEST")
after=$(( used - freed + bytes_new ))
echo "квота: сейчас $((used/1048576)) МБ, после ~$((after/1048576)) МБ из $CDN_QUOTA_MB МБ; файлов к выкладке: $n_new"
(( after <= CDN_QUOTA_MB * 1048576 )) || { echo "Превышена квота CDN ($CDN_QUOTA_MB МБ): синхронизация отклонена, ничего не изменено" >&2; exit 7; }

# Копирование (rsync пишет во временный файл и переименовывает: читатели не видят частичных файлов).
# Вывод - в файл (без конвейера: SIGPIPE не обрывает копирование, код rsync не маскируется). Удаление и манифест - только при успехе.
rc=0
rsync -a --files-from="$W/new.list" --chmod=D755,F644 --itemize-changes "$stage/" "$ROOT/" > "$W/rsync.log" 2>&1 || rc=$?
sed 's/^/  rsync: /' "$W/rsync.log" | head -n 50 || true
if (( rc != 0 )); then
  echo "rsync завершился с кодом $rc: удаление устаревших и обновление манифеста НЕ выполнены (повторите синхронизацию)" >&2
  exit 8
fi
# Удаление файлов, выложенных прежней синхронизацией, но отсутствующих сейчас.
deleted=0
if [[ -f "$MANIFEST" ]]; then
  while IFS= read -r old; do
    [[ -n "$old" ]] || continue
    if ! grep -qxF -- "$old" "$W/new.list" && [[ -f "$ROOT/$old" ]]; then rm -f -- "$ROOT/$old"; deleted=$((deleted+1)); fi
  done < <(cut -f2- "$MANIFEST" | sed 's/^\t//')
  find "$ROOT" -mindepth 1 -type d -empty -not -path "$ROOT/.*" -delete 2>/dev/null || true
fi
# Манифест: sha256<TAB>путь
awk '{h=$1; $1=""; sub(/^ +\*?/,""); print h "\t" $0}' "$W/files.sha256" | LC_ALL=C sort -k2 > "$MANIFEST.new"
mv "$MANIFEST.new" "$MANIFEST"
echo "готово: файлов выложено $n_new ($((bytes_new/1024)) КБ), удалено устаревших $deleted; в манифесте $(wc -l < "$MANIFEST")"
