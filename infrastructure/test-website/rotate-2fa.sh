#!/usr/bin/env bash
# Ротация 2FA админа стенда НА СЕРВЕРЕ (от пользователя twomc на хосте стенда). Обычно запускается ЛОКАЛЬНО через run-rotate-2fa.sh.
#   rotate-2fa.sh --dry-run          показать шаги, ничего не менять
#   rotate-2fa.sh --yes              выполнить ротацию
# Что делает: генерирует НОВЫЙ TOTP-секрет и 10 резервных кодов (контейнер twomc-stand-tools, тот же SecretBox/генераторы, что в API),
# пишет в БД стенда; порядок: генерация -> копия .bak-<UTC> (600) -> временный файл .new.* рядом с файлом учёток (600) -> транзакция БД -> атомарный rename. Временный файл удаляется ТОЛЬКО после подтверждённого отката БД (маркер rolled_back от .ts) или после успешного mv; при неизвестном исходе (код != 0 без маркера, обрыв SSH, SIGTERM) он сохраняется (в нём единственная копия новых значений), печатается только путь.
# Копия `<файл>.bak-<UTC>` (600) содержит ещё ДЕЙСТВУЮЩИЙ пароль админа и старые 2FA-значения; строка `admin2fa:` в файле учёток заменяется (600). Ротация НЕ меняет пароль админа (он остаётся в .bak и в файле учёток). Блокировка: тот же flock, что у deploy-stand.sh ($STAND_ROOT/.deploy.lock).
# Коды возврата: 0 ok, 1 откат подтверждён или не начато, 3 БД обновлена, но файл не заменён (сбой mv или сигнал после apply), 4 исход неизвестен, 5 lock занят (деплой или другая ротация), 143 сигнал во время apply (исход неизвестен).
# Если .bak создан, а apply не начат (сбой cp/mktemp/awk) - .bak удаляется (БД не трогали); после старта apply .bak не удаляется никогда.
# В stdout/лог попадают только путь, «ok» и отпечаток (первые 8 hex sha256 секрета). ЗНАЧЕНИЯ НЕ ПЕЧАТАЮТСЯ НИКОГДА.
# Окружение: ADMIN_USERNAME (по умолчанию - ник из строки `admin:` файла учёток), STAND_USER (по умолчанию twomc).
# Тестовые хуки (только при STAND_ROOT != /srv/twomc-stand): ROTATE_2FA_TEST_GEN=<скрипт, пишущий $OUT_FILE>, ROTATE_2FA_TEST_APPLY=<скрипт-заглушка БД, читает $IN_FILE; код возврата != 0 = сбой БД>, ROTATE_2FA_TEST_FAIL_RENAME=1, CREDENTIALS_FILE=<путь>; БД и docker не используются.
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_ROOT=/srv/twomc-stand
STAND_ROOT="${STAND_ROOT:-$REAL_ROOT}"
STAND_USER="${STAND_USER:-twomc}"
TEST_GEN="${ROTATE_2FA_TEST_GEN:-}"
if [[ "$STAND_ROOT" == "$REAL_ROOT" ]]; then
  [[ -z "$TEST_GEN" ]] || { echo "ROTATE_2FA_TEST_GEN недопустим на хосте стенда" >&2; exit 1; }
  CREDENTIALS_FILE=/home/twomc/test-website-credentials.txt
else
  [[ -n "$TEST_GEN" ]] || { echo "Отказ: STAND_ROOT=$STAND_ROOT, ротация выполняется только на хосте стенда ($REAL_ROOT)" >&2; exit 1; }
  CREDENTIALS_FILE="${CREDENTIALS_FILE:?в тестовом режиме нужен CREDENTIALS_FILE}"
fi
DRY=0; YES=0
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; --yes) YES=1 ;; *) echo "Неизвестный аргумент: $a" >&2; exit 2 ;; esac; done
[[ "$DRY" == 1 || "$YES" == 1 ]] || { echo "Укажите --dry-run или --yes" >&2; exit 2; }
[[ "$(id -un)" == "$STAND_USER" ]] || { echo "Отказ: запуск должен быть от пользователя $STAND_USER" >&2; exit 1; }
[[ -f "$CREDENTIALS_FILE" ]] || { echo "Нет файла учёток: $CREDENTIALS_FILE" >&2; exit 2; }

# Серверная блокировка: тот же lock, что deploy-stand.sh (fd 9, не блокирующий).
[[ -d "$STAND_ROOT" ]] || { echo "Нет каталога $STAND_ROOT" >&2; exit 2; }
exec 9>"$STAND_ROOT/.deploy.lock"
flock -n 9 || { echo "Идёт деплой или другая ротация (flock $STAND_ROOT/.deploy.lock занят). Повторите позже." >&2; exit 5; }

# Остатки прошлых запусков рядом с файлом учёток (только пути, содержимое не читается).
list_leftovers() {
  local f
  shopt -s nullglob
  for f in "$CREDENTIALS_FILE".new.* "$CREDENTIALS_FILE".bak-*; do printf '    %s
' "$f"; done
  shopt -u nullglob
}

# Ник админа: из окружения либо второе поле строки `admin:` файла учёток (пароль из строки не используется и не печатается).
ADMIN_USERNAME="${ADMIN_USERNAME:-$(awk '$1=="admin:"{print $2; exit}' "$CREDENTIALS_FILE")}"
[[ "$ADMIN_USERNAME" =~ ^[A-Za-z0-9_.-]{2,64}$ ]] || { echo "Не определён ник админа (задайте ADMIN_USERNAME)" >&2; exit 2; }
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BAK="$CREDENTIALS_FILE.bak-$TS"
if [[ -z "$TEST_GEN" ]]; then
  ENV_FILE="$STAND_ROOT/stand.env"
  [[ -f "$ENV_FILE" && -f "$STAND_ROOT/.release" ]] || { echo "Нет $ENV_FILE или $STAND_ROOT/.release" >&2; exit 2; }
  SHA="$(cat "$STAND_ROOT/.release")"
  [[ "$SHA" =~ ^[0-9a-f]{12,40}$ ]] || { echo "Недопустимый .release" >&2; exit 2; }
  IMAGE="twomc-stand-tools:${SHA:0:12}"
  TS_SRC="${ROTATE_2FA_TS:-$HERE/rotate-2fa.stand.ts}"
  [[ -f "$TS_SRC" ]] || { echo "Нет $TS_SRC" >&2; exit 2; }
fi

echo "План (admin=$ADMIN_USERNAME):"
echo "  1. сгенерировать новый TOTP-секрет и резервные коды на сервере (значения не печатаются)"
echo "  2. записать блок во временный файл рядом с файлом учёток (600), сделать копию $BAK (600)"
echo "  3. транзакция в БД стенда (SecretBox как в API), старые коды удалить, refresh-токены админа отозвать"
echo "  4. при успехе атомарный rename поверх $CREDENTIALS_FILE (600); временный файл удаляется только после подтверждённого отката БД"
if [[ "$DRY" == 1 ]]; then echo "dry-run: изменений нет."; exit 0; fi
LEFT="$(list_leftovers)"
if [[ -n "$LEFT" ]]; then
  echo "ВНИМАНИЕ: рядом с файлом учёток есть остатки прошлых запусков (в них могут быть действующие секреты):" >&2
  printf '%s
' "$LEFT" >&2
  echo "  После проверки входа новыми значениями удалите: rm -f '$CREDENTIALS_FILE'.new.* '$CREDENTIALS_FILE'.bak-*" >&2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rotate2fa.XXXXXX")"
chmod 700 "$WORK"
NEWCRED=""      # временный файл учёток рядом с целевым (тот же каталог/ФС => rename атомарен)
KEEP_NEWCRED=0  # 1 => при сбое rename оставить временный файл (в нём единственная копия новых значений)
APPLY_STARTED=0 # 1 => apply начат: .bak не удаляется никогда
COMMITTED=0     # 1 => apply завершился кодом 0 (БД обновлена)
cleanup() {
  rm -rf "$WORK"
  if [[ -n "$NEWCRED" && "$KEEP_NEWCRED" != 1 ]]; then rm -f "$NEWCRED"; fi
  if [[ "$APPLY_STARTED" != 1 ]]; then rm -f "$BAK"; fi  # БД не трогали: копия не нужна (set -e мог оборвать между .bak и apply)
}
trap cleanup EXIT
BLOCK="$WORK/new-2fa.txt"

# Шаг 1. Генерация значений (БД не трогается). Значения только в файле BLOCK (600).
if [[ -n "$TEST_GEN" ]]; then
  OUT_FILE="$BLOCK" bash "$TEST_GEN" >/dev/null
else
  envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }  # env-файл не source-им (в DATABASE_URL есть '&')
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' "$(envval POSTGRES_USER)" "$(envval POSTGRES_PASSWORD)" "$(envval STAND_PG_PORT)" "$(envval POSTGRES_DB)" > "$WORK/db.env"
  run_tool() {  # $1 = generate|apply, $2 = файл для stdout (маркер/ok; значений в stdout нет)
    docker run --rm --network host --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" --env-file "$ENV_FILE" --env-file "$WORK/db.env" \
      -e NODE_ENV=development -e HOME=/tmp -e TS_NODE_TRANSPILE_ONLY=1 -e ADMIN_USERNAME="$ADMIN_USERNAME" \
      -e ROTATE_MODE="$1" -e OUT_FILE=/out/new-2fa.txt -e IN_FILE=/out/new-2fa.txt \
      -v "$WORK:/out" -v "$TS_SRC:/app/apps/api/rotate-2fa.stand.ts:ro" \
      -w /app/apps/api "$IMAGE" pnpm exec ts-node rotate-2fa.stand.ts > "${2:-/dev/null}"
  }
  run_tool generate || { echo "Ротация не выполнена: генерация не удалась (БД и файл учёток не тронуты)" >&2; exit 1; }
fi
[[ -s "$BLOCK" ]] || { echo "Ротация не выполнена: нет нового блока (БД и файл учёток не тронуты)" >&2; exit 1; }
chmod 600 "$BLOCK"
[[ "$(grep -c '^admin2fa:' "$BLOCK")" == 1 ]] || { echo "Некорректный новый блок (БД и файл учёток не тронуты)" >&2; exit 1; }

# Шаг 2. Копия .bak-<UTC> заранее, затем временный файл учёток РЯДОМ с целевым (umask 077, chmod 600) с уже новым блоком.
cp "$CREDENTIALS_FILE" "$BAK"   # без -p: под umask 077 копия создаётся с 600
chmod 600 "$BAK"
NEWCRED="$(mktemp "$CREDENTIALS_FILE.new.XXXXXX")"
chmod 600 "$NEWCRED"
awk -v rf="$BLOCK" '
  /^admin2fa:/ { if (!done) { while ((getline l < rf) > 0) print l; close(rf); done=1 } next }
  { print }
  END { if (!done) while ((getline l < rf) > 0) print l }
' "$CREDENTIALS_FILE" > "$NEWCRED"
[[ "$(grep -c '^admin2fa:' "$NEWCRED")" == 1 ]] || { echo "Сбой подготовки временного файла (БД и файл учёток не тронуты)" >&2; rm -f "$BAK"; exit 1; }

# Шаг 3. Транзакция в БД. KEEP_NEWCRED=1 выставляется ДО apply: пока откат не подтверждён, временный файл с новыми значениями не удаляется.
# Подтверждение отката - маркер ROTATE_RESULT=rolled_back в stdout .ts (stdout содержит только маркер/ok, значений нет).
APPLY_OUT="$WORK/apply.out"; : > "$APPLY_OUT"
on_signal() {
  # Успех apply: код 0 (COMMITTED) либо маркер committed в stdout .ts (сигнал мог прийти между завершением apply и выставлением COMMITTED).
  if [[ "$COMMITTED" == 1 ]] || grep -qx 'ROTATE_RESULT=committed' "$APPLY_OUT" 2>/dev/null; then
    if [[ -n "$NEWCRED" && -f "$NEWCRED" ]]; then
      echo "ПРЕРВАНО после успешного apply: БД обновлена, новые значения в $NEWCRED. Выполните: mv -f '$NEWCRED' '$CREDENTIALS_FILE' && chmod 600 '$CREDENTIALS_FILE'. Ротацию не повторяйте." >&2
    else
      echo "ПРЕРВАНО после успешного apply: БД обновлена, файл учёток уже заменён. Проверьте вход." >&2
    fi
    echo "Остатки (пути):" >&2; list_leftovers >&2
    exit 3
  fi
  echo "ПРЕРВАНО: исход записи в БД неизвестен. Новые значения сохранены во временном файле: $NEWCRED. Проверьте вход новыми значениями из этого файла; если не входит - повторите --yes." >&2
  echo "Остатки (пути):" >&2; list_leftovers >&2
  exit 143
}
trap on_signal TERM HUP INT
KEEP_NEWCRED=1; APPLY_STARTED=1
if [[ -n "$TEST_GEN" ]]; then
  APPLY_RC=0; IN_FILE="$BLOCK" bash "${ROTATE_2FA_TEST_APPLY:?в тестовом режиме нужен ROTATE_2FA_TEST_APPLY}" > "$APPLY_OUT" || APPLY_RC=$?
else
  APPLY_RC=0; run_tool apply "$APPLY_OUT" || APPLY_RC=$?
fi
if [[ "$APPLY_RC" != 0 ]]; then
  if grep -qx 'ROTATE_RESULT=rolled_back' "$APPLY_OUT"; then
    KEEP_NEWCRED=0; rm -f "$NEWCRED" "$BAK"; NEWCRED=""
    echo "Ротация не выполнена: сбой записи в БД, откат транзакции подтверждён (файл учёток не тронут, 2FA прежняя). Можно повторить --yes." >&2
    exit 1
  fi
  echo "ВНИМАНИЕ: исход записи в БД НЕИЗВЕСТЕН (код $APPLY_RC, подтверждения отката нет). Новые значения сохранены во временном файле: $NEWCRED" >&2
  echo "Проверьте вход новыми значениями из этого файла; если не входит - повторите --yes. Прежний файл: $BAK (значения в нём могут быть ещё действующими, пароль админа - точно). Файл учёток не заменён." >&2
  echo "Остатки (пути):" >&2; list_leftovers >&2
  exit 4
fi
COMMITTED=1

# Шаг 4. БД новая (подтверждено кодом 0): атомарный rename. KEEP_NEWCRED сбрасывается только после успешного mv.
rename_over() {
  if [[ -n "$TEST_GEN" && "${ROTATE_2FA_TEST_FAIL_RENAME:-0}" == 1 ]]; then return 1; fi
  mv -f "$NEWCRED" "$CREDENTIALS_FILE"
}
if ! rename_over; then
  echo "ВНИМАНИЕ: БД обновлена, но замена файла учёток не удалась. Новые значения сохранены ТОЛЬКО во временном файле: $NEWCRED" >&2
  echo "Выполните вручную: mv -f '$NEWCRED' '$CREDENTIALS_FILE' && chmod 600 '$CREDENTIALS_FILE'  (прежний файл: $BAK, 2FA-значения в нём уже недействительны, пароль админа - действующий). Не повторяйте ротацию, пока не заберёте файл." >&2
  echo "Остатки (пути):" >&2; list_leftovers >&2
  exit 3
fi
KEEP_NEWCRED=0
NEWCRED=""
chmod 600 "$CREDENTIALS_FILE"
FP="$(awk '{print $2}' "$BLOCK" | tr -d '\n' | sha256sum | cut -c1-8)"
echo "ok: 2FA админа $ADMIN_USERNAME ротирована. Файл: $CREDENTIALS_FILE; копия: $BAK; отпечаток секрета: $FP"
