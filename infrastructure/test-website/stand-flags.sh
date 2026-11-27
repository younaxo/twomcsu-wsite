#!/usr/bin/env bash
# Флаги тестового стенда НА СЕРВЕРЕ: идемпотентно выставляет в $STAND_ROOT/stand.env ТОЛЬКО allowlist из stand-flags.defaults
# (PAYMENT_METHODS, QUICK_BUY_ENABLED, STORE_REFUNDS_ENABLED, WALLET_LEDGER_ENABLED, BRIDGE_ENABLED, BRIDGE_STATS_ENABLED, BRIDGE_INVENTORY_ENABLED).
#   stand-flags.sh [--dry-run|--apply]      (по умолчанию --dry-run: только показать различия, файлы не менять)
# Печатает только «имя: было -> стало» для имён из allowlist (значения флагов не секретны; остальные строки stand.env не читаются в вывод).
# Отказ: нет stand.env, права не 600, NODE_ENV в stand.env не равен development.
# --apply: бэкап stand.env.bak.<время> (600) -> замена файла атомарно (права 600) -> пересоздание api тем же способом, что в deploy-stand.sh
#   (docker compose -p twomc-stand, релиз из $STAND_ROOT/.release) под тем же замком .deploy.lock -> проверка health.
# Откат: cp -p $STAND_ROOT/stand.env.bak.<время> $STAND_ROOT/stand.env && повторить пересоздание api (runbook, раздел «Флаги стенда»).
# Обычно запускается ЛОКАЛЬНО через run-stand-flags.sh. STAND_ROOT, FLAGS_FILE переопределяют пути (тесты).
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
FLAGS_FILE="${FLAGS_FILE:-$HERE/stand-flags.defaults}"
ENV_FILE="$STAND_ROOT/stand.env"
MODE=dry
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=dry ;;
    --apply) MODE=apply ;;
    *) echo "Использование: stand-flags.sh [--dry-run|--apply]" >&2; exit 2 ;;
  esac
done

[[ -f "$FLAGS_FILE" && -r "$FLAGS_FILE" ]] || { echo "Нет $FLAGS_FILE" >&2; exit 2; }
[[ -f "$ENV_FILE" && -r "$ENV_FILE" ]] || { echo "Нет $ENV_FILE: сначала gen-env.sh" >&2; exit 1; }
[[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || { echo "Права $ENV_FILE должны быть 600" >&2; exit 1; }
NODE_ENV_NOW="$(grep -E '^NODE_ENV=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"' || true)"
[[ "$NODE_ENV_NOW" == "development" ]] || { echo "Отказ: NODE_ENV в stand.env не development (стенд только в режиме development)" >&2; exit 1; }

# allowlist из файла: строки ИМЯ=ЗНАЧЕНИЕ, остальное игнорируется; формат проверяется строго.
NAMES=(); VALUES=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" =~ ^([A-Z][A-Z0-9_]{2,63})=([A-Za-z0-9_:,.-]*)$ ]] || { echo "Недопустимая строка в $FLAGS_FILE (ожидалось ИМЯ=ЗНАЧЕНИЕ без спецсимволов)" >&2; exit 2; }
  NAMES+=("${BASH_REMATCH[1]}"); VALUES+=("${BASH_REMATCH[2]}")
done < "$FLAGS_FILE"
(( ${#NAMES[@]} > 0 )) || { echo "Пустой allowlist" >&2; exit 2; }
for n in "${NAMES[@]}"; do
  case "$n" in PAYMENT_METHODS|QUICK_BUY_ENABLED|STORE_REFUNDS_ENABLED|WALLET_LEDGER_ENABLED|BRIDGE_ENABLED|BRIDGE_STATS_ENABLED|BRIDGE_INVENTORY_ENABLED) ;; *) echo "Имя $n вне разрешённого списка скрипта" >&2; exit 2 ;; esac
done

WORK="$(mktemp "$STAND_ROOT/.stand.env.XXXXXX")"
trap 'rm -f "$WORK"' EXIT
cp "$ENV_FILE" "$WORK"; chmod 600 "$WORK"
changed=0
for i in "${!NAMES[@]}"; do
  n="${NAMES[$i]}"; want="${VALUES[$i]}"
  cur="$(grep -E "^${n}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
  has=0; grep -qE "^${n}=" "$ENV_FILE" && has=1
  if (( has == 1 )) && [[ "$cur" == "$want" ]]; then
    echo "$n: ${cur:-<пусто>} (без изменений)"
    continue
  fi
  echo "$n: ${cur:-<пусто или не задано>} -> $want"
  changed=1
  if (( has == 1 )); then
    sed -i "s|^${n}=.*|${n}=${want}|" "$WORK"      # значение проверено: только [A-Za-z0-9_:,.-]
  else
    [[ -z "$(tail -c1 "$WORK")" ]] || printf '\n' >> "$WORK"
    printf '%s=%s\n' "$n" "$want" >> "$WORK"
  fi
done

if (( changed == 0 )); then echo "stand.env уже соответствует allowlist: ничего не меняется."; exit 0; fi
if [[ "$MODE" == dry ]]; then echo "Сухой прогон: файлы не менялись. Применить: stand-flags.sh --apply"; exit 0; fi

# --apply: тот же замок, что у deploy-stand.sh (деплой и правка флагов не идут одновременно).
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
echo "Бэкап: $BAK (600). stand.env обновлён."

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
echo "Готово: флаги применены, api перезапущен."
