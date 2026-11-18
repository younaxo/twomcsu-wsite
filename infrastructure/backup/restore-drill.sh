#!/usr/bin/env bash
# Restore-drill: полный цикл на СИНТЕТИЧЕСКИХ данных в одноразовой БД (проект twomc-restore-drill, 127.0.0.1:55432).
#   DRILL_POSTGRES_PASSWORD=<одноразовое значение> infrastructure/backup/restore-drill.sh
# Цикл: up → синтетика через psql → backup.sh → удаление таблицы → restore.sh → сверка строк и md5 → down -v.
# Настоящие дампы (ПДн) и миграции production-схемы здесь не используются. Нужен Docker и свободное место.
# По умолчанию без шифрования (синтетика); цикл с шифрованием: BACKUP_ENCRYPT=age AGE_RECIPIENT=... AGE_IDENTITY=<путь>.
# Переменные: DRILL_ROWS (10000), DRILL_BACKUP_DIR ($HOME/twomc-backups/drill), DRILL_KEEP=1 (не удалять БД после drill).
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DRILL_POSTGRES_PASSWORD:?задайте DRILL_POSTGRES_PASSWORD (одноразовое значение для БД drill)}"
export DRILL_POSTGRES_PASSWORD
DRILL_ROWS=${DRILL_ROWS:-10000}
DRILL_BACKUP_DIR=${DRILL_BACKUP_DIR:-$HOME/twomc-backups/drill}
[[ "$DRILL_ROWS" =~ ^[0-9]+$ ]] || { echo "DRILL_ROWS некорректно" >&2; exit 1; }

COMPOSE=(docker compose -p twomc-restore-drill -f infrastructure/docker-compose.restore-drill.yml)
psql_drill() { "${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U drill -d drill -Atq -c "$1"; }
FINGERPRINT="SELECT count(*) || ':' || md5(string_agg(id || label || amount::text, ',' ORDER BY id)) FROM drill_items"

# shellcheck disable=SC2329  # вызывается через trap
cleanup() {
  if [[ "${DRILL_KEEP:-0}" != "1" ]]; then "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

echo "→ up (одноразовая БД)"
"${COMPOSE[@]}" up -d --wait

echo "→ синтетические данные ($DRILL_ROWS строк)"
psql_drill "DROP TABLE IF EXISTS drill_items"
psql_drill "CREATE TABLE drill_items (id int PRIMARY KEY, label text NOT NULL, amount numeric NOT NULL)"
psql_drill "INSERT INTO drill_items SELECT g, 'item-' || g, (g * 7) % 1000 FROM generate_series(1, $DRILL_ROWS) g"
before=$(psql_drill "$FINGERPRINT")

echo "→ backup.sh"
BACKUP_DIR=$DRILL_BACKUP_DIR BACKUP_TAG=drill BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-none} BACKUP_ALLOW_UNENCRYPTED=1 \
  BACKUP_COMPOSE_FILE=infrastructure/docker-compose.restore-drill.yml BACKUP_COMPOSE_PROJECT=twomc-restore-drill \
  BACKUP_ENV_FILE='' BACKUP_SKIP_UPLOADS=1 infrastructure/backup/backup.sh
dir=$(find "$DRILL_BACKUP_DIR" -maxdepth 1 -type d -name 'twomc-*-drill' | sort | tail -n 1)
[[ -n "$dir" ]] || { echo "каталог бэкапа не найден" >&2; exit 1; }
size=$(du -sk "$dir"/postgres.dump* | awk '{print $1}')

echo "→ имитация потери данных и restore.sh"
psql_drill "DROP TABLE drill_items"
start=$(date +%s)
infrastructure/backup/restore.sh --target drill "$dir"
secs=$(( $(date +%s) - start ))
after=$(psql_drill "$FINGERPRINT")

echo "--- итог drill ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ---"
echo "размер дампа: ${size} КБ; строк:md5 до: $before; после: $after; время восстановления: ${secs} с"
if [[ "$before" == "$after" ]]; then echo "DRILL OK"; else echo "DRILL FAIL: данные не совпали" >&2; exit 1; fi
