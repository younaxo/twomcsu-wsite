#!/usr/bin/env bash
# Ротация 2FA админа стенда НА СЕРВЕРЕ (от пользователя twomc на хосте стенда). Обычно запускается ЛОКАЛЬНО через run-rotate-2fa.sh.
#   rotate-2fa.sh --dry-run          показать шаги, ничего не менять
#   rotate-2fa.sh --yes              выполнить ротацию
# Что делает: генерирует НОВЫЙ TOTP-секрет и 10 резервных кодов (контейнер twomc-stand-tools, тот же SecretBox/генераторы, что в API),
# пишет их в БД стенда (старые секрет/коды/lastStep заменяются, refresh-токены админа отзываются), делает копию файла учёток
# `<файл>.bak-<UTC>` (600) и заменяет в файле учёток строку `admin2fa:` (600).
# В stdout/лог попадают только путь, «ok» и отпечаток (первые 8 hex sha256 секрета). ЗНАЧЕНИЯ НЕ ПЕЧАТАЮТСЯ НИКОГДА.
# Окружение: ADMIN_USERNAME (по умолчанию - ник из строки `admin:` файла учёток), STAND_USER (по умолчанию twomc).
# Тестовый хук (только при STAND_ROOT != /srv/twomc-stand): ROTATE_2FA_TEST_GEN=<скрипт, пишущий $OUT_FILE>, CREDENTIALS_FILE=<путь>; БД и docker не используются.
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
echo "  2. записать в БД стенда (SecretBox как в API), удалить старые коды, отозвать refresh-токены админа"
echo "  3. копия $BAK (600)"
echo "  4. заменить строку admin2fa: в $CREDENTIALS_FILE (600)"
if [[ "$DRY" == 1 ]]; then echo "dry-run: изменений нет."; exit 0; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rotate2fa.XXXXXX")"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/new-2fa.txt"
if [[ -n "$TEST_GEN" ]]; then
  OUT_FILE="$OUT" bash "$TEST_GEN" >/dev/null
else
  envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }  # env-файл не source-им (в DATABASE_URL есть '&')
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' "$(envval POSTGRES_USER)" "$(envval POSTGRES_PASSWORD)" "$(envval STAND_PG_PORT)" "$(envval POSTGRES_DB)" > "$WORK/db.env"
  docker run --rm --network host --user "$(id -u):$(id -g)" --env-file "$ENV_FILE" --env-file "$WORK/db.env" \
    -e NODE_ENV=development -e HOME=/tmp -e TS_NODE_TRANSPILE_ONLY=1 -e ADMIN_USERNAME="$ADMIN_USERNAME" -e OUT_FILE=/out/new-2fa.txt \
    -v "$WORK:/out" -v "$TS_SRC:/app/apps/api/rotate-2fa.stand.ts:ro" \
    -w /app/apps/api "$IMAGE" pnpm exec ts-node rotate-2fa.stand.ts >/dev/null
fi
[[ -s "$OUT" ]] || { echo "Ротация не выполнена: нет нового блока (файл учёток не тронут)" >&2; exit 1; }
chmod 600 "$OUT"
[[ "$(grep -c '^admin2fa:' "$OUT")" == 1 ]] || { echo "Некорректный новый блок (файл учёток не тронут)" >&2; exit 1; }

# Копия и замена блока (во временный файл 600, затем mv; права не расширяются).
cp -p "$CREDENTIALS_FILE" "$BAK"
chmod 600 "$BAK"
NEW="$WORK/credentials.new"
awk -v rf="$OUT" '
  /^admin2fa:/ { if (!done) { while ((getline l < rf) > 0) print l; close(rf); done=1 } next }
  { print }
  END { if (!done) while ((getline l < rf) > 0) print l }
' "$CREDENTIALS_FILE" > "$NEW"
chmod 600 "$NEW"
mv "$NEW" "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"
FP="$(awk '{print $2}' "$OUT" | tr -d '\n' | sha256sum | cut -c1-8)"
echo "ok: 2FA админа $ADMIN_USERNAME ротирована. Файл: $CREDENTIALS_FILE; копия: $BAK; отпечаток секрета: $FP"
