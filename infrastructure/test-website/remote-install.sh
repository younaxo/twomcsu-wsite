#!/usr/bin/env bash
# НА СЕРВЕРЕ, вызывается push-release.sh из распакованного бандла: remote-install.sh <bundle_dir> <sha12> [deploy,seed,verify]
# Распаковывает релиз и ops-файлы в $STAND_ROOT, затем (если заданы шаги) выполняет их в фоне с логом, так что обрыв SSH
# не прерывает сборку: повторный запуск release.sh подхватит (deploy-stand.sh держит flock).
# Окончательный файл учётных данных /home/twomc/test-website-credentials.txt этот скрипт НЕ пишет и не изменяет (правило стенда).
set -eu
BUNDLE="${1:?bundle}"; SHA="${2:?sha}"; ACTIONS="${3:-}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
case "$STAND_ROOT" in /srv/twomc-stand|/srv/twomc-stand[A-Za-z0-9._-]*) ;; *) echo "Недопустимый STAND_ROOT" >&2; exit 1 ;; esac
case "$SHA" in *[!0-9a-f]*|"") echo "Недопустимый sha" >&2; exit 1 ;; esac

# Права только на конкретные каталоги, без рекурсивного chown.
U="$(id -un)"; G="$(id -gn)"
sudo install -d -o "$U" -g "$G" -m 755 "$STAND_ROOT" "$STAND_ROOT/releases" "$STAND_ROOT/ops"

d="$STAND_ROOT/releases/$SHA"
rm -rf "$d.tmp"; mkdir -p "$d.tmp"
tar -xzf "$BUNDLE/release.tar.gz" -C "$d.tmp"
rm -rf "$d"; mv "$d.tmp" "$d"
cp -f "$BUNDLE"/ops/* "$STAND_ROOT/ops/"
( cd "$STAND_ROOT/ops" && sed -i 's/\r$//' ./*.sh ./*.template ./*.conf ./*.yml ./stand-flags.defaults && chmod +x ./*.sh )
echo "Выгружено: $SHA -> $d"

[ -n "$ACTIONS" ] || { echo "Дальше на сервере: $STAND_ROOT/ops/deploy-stand.sh $SHA"; exit 0; }

LOG="$STAND_ROOT/release.log"; ST="$STAND_ROOT/.release.status"
rm -f "$ST"; : > "$LOG"
nohup setsid bash -c '
  rc=0
  for a in $(echo "$1" | tr "," " "); do
    case "$a" in
      deploy) "$2/ops/deploy-stand.sh" "$3" || { rc=$?; break; } ;;
      seed)   "$2/ops/seed-demo.sh" "$3" || { rc=$?; break; } ;;
      verify) "$2/ops/verify.sh" || rc=$? ;;
    esac
  done
  echo $rc > "$2/.release.status"
' _ "$ACTIONS" "$STAND_ROOT" "$SHA" >> "$LOG" 2>&1 < /dev/null &
BG=$!
tail -n +1 -f "$LOG" --pid="$BG" &
TP=$!
wait "$BG" 2>/dev/null || true
# Фоновый setsid-процесс может быть не дочерним; ждём файл статуса.
for _ in $(seq 1 360); do [ -f "$ST" ] && break; sleep 5; done
sleep 1; kill "$TP" 2>/dev/null || true
RC="$(cat "$ST" 2>/dev/null || echo 1)"
echo "Итог шагов ($ACTIONS): код $RC (лог: $LOG)"
exit "$RC"
