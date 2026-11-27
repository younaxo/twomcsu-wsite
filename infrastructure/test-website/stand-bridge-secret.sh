#!/usr/bin/env bash
# Мастер-секрет Bridge тестового стенда НА СЕРВЕРЕ: создаёт $STAND_ROOT/bridge-master.secret (600), если его нет,
# и идемпотентно записывает BRIDGE_MASTER_SECRET в $STAND_ROOT/stand.env из этого файла.
#   stand-bridge-secret.sh [--dry-run|--apply]      (по умолчанию --dry-run: файлы не создаются и не меняются)
# Формат секрета (apps/api/src/modules/bridge/bridge.constants.ts, isStrongMasterSecret): >= 32 байт UTF-8 и >= 16 различных
# байт. Генерация: 64 символа [A-Za-z0-9] из openssl rand (hex не годится: 64 hex-символа содержат все 16 цифр лишь с ~74%).
# Значение секрета НИКОГДА не печатается: только «создан/уже есть» и «stand.env: обновлён/без изменений».
# Отказ: нет stand.env, права не 600, NODE_ENV в stand.env не development, секрет-файл с правами не 600 или негодным форматом.
# --apply: бэкап stand.env.bak.<время> (600) -> атомарная замена -> пересоздание api как в stand-flags.sh/deploy-stand.sh
#   под замком .deploy.lock -> проверка health. Ротация: удалить bridge-master.secret, запустить скрипт, перерегистрировать ключи серверов.
# Секрет читает только главный агент/владелец. STAND_ROOT переопределяет путь (тесты).
set -euo pipefail
umask 077

STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
ENV_FILE="$STAND_ROOT/stand.env"
SECRET_FILE="$STAND_ROOT/bridge-master.secret"
MODE=dry
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=dry ;;
    --apply) MODE=apply ;;
    *) echo "Использование: stand-bridge-secret.sh [--dry-run|--apply]" >&2; exit 2 ;;
  esac
done

[[ -f "$ENV_FILE" && -r "$ENV_FILE" ]] || { echo "Нет $ENV_FILE: сначала gen-env.sh" >&2; exit 1; }
[[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || { echo "Права $ENV_FILE должны быть 600" >&2; exit 1; }
NODE_ENV_NOW="$(grep -E '^NODE_ENV=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"' || true)"
[[ "$NODE_ENV_NOW" == "development" ]] || { echo "Отказ: NODE_ENV в stand.env не development (стенд только в режиме development)" >&2; exit 1; }

valid_secret() {  # годность: только [A-Za-z0-9_.:-], >= 32 символов, >= 16 различных (значение не выводится)
  local v="$1"
  [[ "$v" =~ ^[A-Za-z0-9_.:-]{32,128}$ ]] || return 1
  (( $(printf '%s' "$v" | fold -w1 | sort -u | wc -l) >= 16 ))
}
gen_secret() {
  local v
  for _ in 1 2 3 4 5; do
    v="$(openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | head -c 64)"
    if valid_secret "$v"; then printf '%s' "$v"; return 0; fi
  done
  return 1
}

# 1) секрет-файл
secret_state=exists
if [[ -e "$SECRET_FILE" ]]; then
  [[ -f "$SECRET_FILE" && "$(stat -c %a "$SECRET_FILE")" == "600" ]] || { echo "Права $SECRET_FILE должны быть 600 (обычный файл)" >&2; exit 1; }
  valid_secret "$(tr -d '\r\n' < "$SECRET_FILE")" || { echo "Содержимое $SECRET_FILE негодно (нужно >= 32 символов [A-Za-z0-9_.:-], >= 16 различных). Ротация: удалить файл и перезапустить." >&2; exit 1; }
  echo "bridge-master.secret: уже есть"
else
  secret_state=missing
  if [[ "$MODE" == dry ]]; then
    echo "bridge-master.secret: будет создан (сухой прогон: не создан)"
  else
    command -v openssl >/dev/null || { echo "Нужен openssl" >&2; exit 1; }
    TMP_SECRET="$(mktemp "$STAND_ROOT/.bridge-secret.XXXXXX")"
    trap 'rm -f "$TMP_SECRET" "${WORK:-}"' EXIT
    gen_secret > "$TMP_SECRET" || { echo "Не удалось сгенерировать годный секрет" >&2; exit 1; }
    chmod 600 "$TMP_SECRET"
    mv "$TMP_SECRET" "$SECRET_FILE"
    echo "bridge-master.secret: создан (600)"
  fi
fi

# 2) stand.env: нужно ли менять (сравнение без вывода значения)
if [[ "$secret_state" == missing && "$MODE" == dry ]]; then
  echo "stand.env: будет обновлён"
  echo "Сухой прогон: файлы не менялись. Применить: stand-bridge-secret.sh --apply"
  exit 0
fi
SECRET="$(tr -d '\r\n' < "$SECRET_FILE")"
cur="$(grep -E '^BRIDGE_MASTER_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"' || true)"
if [[ "$cur" == "$SECRET" ]]; then
  unset SECRET cur
  echo "stand.env: без изменений"
  exit 0
fi
unset cur
if [[ "$MODE" == dry ]]; then
  unset SECRET
  echo "stand.env: будет обновлён"
  echo "Сухой прогон: файлы не менялись. Применить: stand-bridge-secret.sh --apply"
  exit 0
fi

WORK="$(mktemp "$STAND_ROOT/.stand.env.XXXXXX")"
trap 'rm -f "${TMP_SECRET:-}" "$WORK"' EXIT
grep -vE '^BRIDGE_MASTER_SECRET=' "$ENV_FILE" > "$WORK" || true
[[ ! -s "$WORK" || -z "$(tail -c1 "$WORK")" ]] || printf '\n' >> "$WORK"
printf 'BRIDGE_MASTER_SECRET=%s\n' "$SECRET" >> "$WORK"
unset SECRET
chmod 600 "$WORK"

# --apply: тот же замок, что у deploy-stand.sh и stand-flags.sh.
exec 9>"$STAND_ROOT/.deploy.lock"
flock -n 9 || { echo "Другой деплой уже выполняется (flock $STAND_ROOT/.deploy.lock)" >&2; exit 1; }
[[ -f "$STAND_ROOT/.release" ]] || { echo "Нет $STAND_ROOT/.release: стенд не развёрнут" >&2; exit 1; }
SHA="$(cat "$STAND_ROOT/.release")"
[[ "$SHA" =~ ^[0-9a-f]{12,40}$ ]] || { echo "Недопустимый .release" >&2; exit 1; }
REL_DIR="$STAND_ROOT/releases/$SHA"
[[ -f "$REL_DIR/infrastructure/docker-compose.prod.yml" ]] || { echo "Нет релиза $REL_DIR" >&2; exit 1; }

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BAK="$ENV_FILE.bak.$TS"
cp -p "$ENV_FILE" "$BAK"; chmod 600 "$BAK"
mv "$WORK" "$ENV_FILE"; chmod 600 "$ENV_FILE"
echo "stand.env: обновлён (бэкап: $BAK, 600)"

export RELEASE="${SHA:0:12}"
export STAND_ENV_FILE="$ENV_FILE"
DC=(docker compose -p twomc-stand --env-file "$ENV_FILE" -f "$REL_DIR/infrastructure/docker-compose.prod.yml" -f "$STAND_ROOT/ops/docker-compose.stand.yml")
"${DC[@]}" config --quiet </dev/null
echo "== пересоздание api (как в deploy-stand.sh)"
"${DC[@]}" up -d --force-recreate --no-deps api </dev/null

api_port="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '\r')"; api_port="${api_port:-4000}"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${api_port}/health" </dev/null; then ok=1; break; fi
  sleep 4
done
if (( ok != 1 )); then
  echo "Health api не пройден. Логи: docker logs --tail=100 twomc-stand-api. Откат: cp -p $BAK $ENV_FILE и повторить пересоздание api." >&2
  exit 1
fi
echo "Готово: BRIDGE_MASTER_SECRET применён, api перезапущен."
