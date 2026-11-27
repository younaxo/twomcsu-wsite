#!/usr/bin/env bash
# Вход владельца под демо-игроком стенда НА СЕРВЕРЕ (от пользователя twomc). Обычно запускается ЛОКАЛЬНО через run-stand-demo-login.sh.
#   stand-demo-login.sh --dry-run     показать план, ничего не менять
#   stand-demo-login.sh --apply       задать новый случайный пароль demo_ember и записать секцию [демо-игрок] в файл учёток
# Зачем: у тестового игрока стенда настоящий MinecraftAccount, демо-наказания ему не выдаются; демо-наказания (3 шт., 2 обжалования) у demo_ember.
# Что делает: генерирует пароль (openssl rand), через контейнер twomc-stand-tools (bcrypt и BCRYPT_ROUNDS как в AuthService) меняет ТОЛЬКО password и
# mustChangePassword=false у demo_ember (другие пользователи, роли, 2FA не трогаются), затем атомарно (временный файл + mv, 600) заменяет/дописывает
# в /home/twomc/test-website-credentials.txt секцию
#   [демо-игрок]
#   login: demo_ember
#   password: <пароль>
# Остальные строки файла не меняются. Копия .bak-<UTC> (600) создаётся перед заменой (в ней прежние значения, секрет).
# Отказ: NODE_ENV в stand.env != development; DEMO_USERNAME не вида demo_[a-z0-9_]+ (по умолчанию demo_ember).
# В stdout/лог попадают только «пароль задан» и путь файла. ЗНАЧЕНИЯ НЕ ПЕЧАТАЮТСЯ НИКОГДА. Блокировка: flock $STAND_ROOT/.deploy.lock (как deploy-stand.sh).
# Коды: 0 ok, 1 не выполнено (БД не тронута или откат), 2 аргументы/окружение, 3 БД обновлена, файл не заменён (значения во временном файле), 4 исход неизвестен, 5 lock занят.
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_ROOT=/srv/twomc-stand
STAND_ROOT="${STAND_ROOT:-$REAL_ROOT}"
STAND_USER="${STAND_USER:-twomc}"
TEST_MODE="${STAND_DEMO_TEST:-0}"   # 1 - только сухие прогоны вне стенда (подмена путей и docker через PATH)
DEMO_USERNAME="${DEMO_USERNAME:-demo_ember}"
SECTION='[демо-игрок]'
if [[ "$STAND_ROOT" == "$REAL_ROOT" ]]; then
  [[ "$TEST_MODE" != 1 ]] || { echo "STAND_DEMO_TEST недопустим на хосте стенда" >&2; exit 2; }
  CREDENTIALS_FILE=/home/twomc/test-website-credentials.txt
else
  [[ "$TEST_MODE" == 1 ]] || { echo "Отказ: STAND_ROOT=$STAND_ROOT, скрипт работает только на хосте стенда ($REAL_ROOT)" >&2; exit 2; }
  CREDENTIALS_FILE="${CREDENTIALS_FILE:?в тестовом режиме нужен CREDENTIALS_FILE}"
fi
MODE=""
for a in "$@"; do case "$a" in --dry-run) MODE=dry ;; --apply) MODE=apply ;; *) echo "Неизвестный аргумент: $a (допустимо --dry-run | --apply)" >&2; exit 2 ;; esac; done
[[ -n "$MODE" ]] || { echo "Использование: stand-demo-login.sh --dry-run | --apply" >&2; exit 2; }
[[ "$DEMO_USERNAME" =~ ^demo_[a-z0-9_]{1,40}$ ]] || { echo "Отказ: пользователь должен быть demo_* (получено недопустимое имя)" >&2; exit 2; }
[[ "$TEST_MODE" == 1 || "$(id -un)" == "$STAND_USER" ]] || { echo "Отказ: запуск должен быть от пользователя $STAND_USER" >&2; exit 2; }
ENV_FILE="$STAND_ROOT/stand.env"
[[ -f "$ENV_FILE" && -f "$STAND_ROOT/.release" ]] || { echo "Нет $ENV_FILE или $STAND_ROOT/.release" >&2; exit 2; }
[[ -f "$CREDENTIALS_FILE" ]] || { echo "Нет файла учёток: $CREDENTIALS_FILE" >&2; exit 2; }
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }  # env-файл не source-им (в DATABASE_URL есть '&')
[[ "$(envval NODE_ENV)" == development ]] || { echo "Отказ: NODE_ENV в stand.env не development (стенд обязан работать в development)" >&2; exit 2; }
SHA="$(cat "$STAND_ROOT/.release")"
[[ "$SHA" =~ ^[0-9a-f]{12,40}$ ]] || { echo "Недопустимый .release" >&2; exit 2; }
IMAGE="twomc-stand-tools:${SHA:0:12}"
TS_SRC="${STAND_DEMO_TS:-$HERE/stand-demo-login.stand.ts}"
[[ -f "$TS_SRC" ]] || { echo "Нет $TS_SRC" >&2; exit 2; }

echo "План (пользователь=$DEMO_USERNAME):"
echo "  1. сгенерировать случайный пароль на сервере (значение не печатается)"
echo "  2. подготовить временный файл учёток рядом с $CREDENTIALS_FILE (600) с секцией $SECTION, сделать копию .bak-<UTC> (600)"
echo "  3. в БД стенда сменить password и mustChangePassword только у $DEMO_USERNAME (bcrypt как в API)"
echo "  4. атомарный mv временного файла поверх файла учёток"
if [[ "$MODE" == dry ]]; then echo "dry-run: изменений нет."; exit 0; fi

[[ -d "$STAND_ROOT" ]] || { echo "Нет каталога $STAND_ROOT" >&2; exit 2; }
exec 9>"$STAND_ROOT/.deploy.lock"
flock -n 9 || { echo "Идёт деплой или другая операция (flock $STAND_ROOT/.deploy.lock занят). Повторите позже." >&2; exit 5; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/demologin.XXXXXX")"
chmod 700 "$WORK"
NEWCRED=""; KEEP_NEWCRED=0; BAK="$CREDENTIALS_FILE.bak-$(date -u +%Y%m%dT%H%M%SZ)"; APPLY_STARTED=0
cleanup() {
  rm -rf "$WORK"
  if [[ -n "$NEWCRED" && "$KEEP_NEWCRED" != 1 ]]; then rm -f "$NEWCRED"; fi
  if [[ "$APPLY_STARTED" != 1 ]]; then rm -f "$BAK"; fi
}
trap cleanup EXIT

# Шаг 1. Пароль только в файле (600). hex: 32 символа, без пробелов и спецсимволов.
openssl rand -hex 16 > "$WORK/pw"
chmod 600 "$WORK/pw"
[[ "$(wc -c < "$WORK/pw")" -ge 33 ]] || { echo "Не удалось сгенерировать пароль (БД и файл учёток не тронуты)" >&2; exit 1; }

# Шаг 2. Копия .bak, временный файл рядом с целевым: старая секция [демо-игрок] (до следующего заголовка или конца) заменяется, иначе дописывается.
cp "$CREDENTIALS_FILE" "$BAK"
chmod 600 "$BAK"
NEWCRED="$(mktemp "$CREDENTIALS_FILE.new.XXXXXX")"
chmod 600 "$NEWCRED"
awk -v sec="$SECTION" -v user="$DEMO_USERNAME" -v pwf="$WORK/pw" '
  function emit(   p) { getline p < pwf; close(pwf); print sec; print "login: " user; print "password: " p; done=1 }
  { line=$0; sub(/\r$/, "", line) }
  line ~ /^[[:space:]]*\[/ { if (skip) { skip=0; print "" } if (line == sec) { if (!done) emit(); skip=1; next } }
  skip { next }
  { print }
  END { if (!done) { if (NR > 0) print ""; emit() } }
' "$CREDENTIALS_FILE" > "$NEWCRED"
[[ "$(grep -c -F -x "$SECTION" "$NEWCRED")" == 1 ]] || { echo "Сбой подготовки временного файла (БД и файл учёток не тронуты)" >&2; exit 1; }

# Шаг 3. БД. KEEP_NEWCRED=1 ставится ДО apply (в временном файле единственная копия пароля).
printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' "$(envval POSTGRES_USER)" "$(envval POSTGRES_PASSWORD)" "$(envval STAND_PG_PORT)" "$(envval POSTGRES_DB)" > "$WORK/db.env"
KEEP_NEWCRED=1; APPLY_STARTED=1
APPLY_RC=0
docker run --rm --network host --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" --env-file "$ENV_FILE" --env-file "$WORK/db.env" \
  -e NODE_ENV=development -e HOME=/tmp -e TS_NODE_TRANSPILE_ONLY=1 -e DEMO_USERNAME="$DEMO_USERNAME" -e IN_FILE=/out/pw \
  -v "$WORK:/out" -v "$TS_SRC:/app/apps/api/stand-demo-login.stand.ts:ro" \
  -w /app/apps/api "$IMAGE" pnpm exec ts-node stand-demo-login.stand.ts > "$WORK/apply.out" 2>/dev/null || APPLY_RC=$?
if [[ "$APPLY_RC" != 0 ]]; then
  if grep -qxE 'DEMO_LOGIN_RESULT=(refused|not_found)' "$WORK/apply.out"; then
    KEEP_NEWCRED=0; rm -f "$NEWCRED" "$BAK"; NEWCRED=""
    echo "Не выполнено: $(grep -m1 '^DEMO_LOGIN_RESULT=' "$WORK/apply.out") (БД и файл учёток не тронуты). Для not_found выполните seed-demo.sh --seed." >&2
    exit 1
  fi
  echo "ВНИМАНИЕ: исход записи в БД НЕИЗВЕСТЕН (код $APPLY_RC). Новое значение сохранено во временном файле: $NEWCRED; прежний файл: $BAK. Файл учёток не заменён. Повторите --apply." >&2
  exit 4
fi
grep -qx 'DEMO_LOGIN_RESULT=ok' "$WORK/apply.out" || { echo "ВНИМАНИЕ: нет подтверждения (маркер ok); новые значения: $NEWCRED" >&2; exit 4; }

# Шаг 4. Атомарный rename (тот же каталог).
if ! mv -f "$NEWCRED" "$CREDENTIALS_FILE"; then
  echo "ВНИМАНИЕ: БД обновлена, замена файла учёток не удалась. Значения ТОЛЬКО во временном файле: $NEWCRED. Выполните: mv -f '$NEWCRED' '$CREDENTIALS_FILE' && chmod 600 '$CREDENTIALS_FILE'" >&2
  exit 3
fi
KEEP_NEWCRED=0; NEWCRED=""
chmod 600 "$CREDENTIALS_FILE"
echo "ok: пароль $DEMO_USERNAME задан, секция $SECTION записана в $CREDENTIALS_FILE; копия прежнего файла: $BAK (секрет; удалите после проверки входа)"
