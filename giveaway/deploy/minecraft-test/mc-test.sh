#!/usr/bin/env bash
# Управление тестовым Minecraft-сервером на VDS (запускать ПОД пользователем развёртывания, в каталоге релиза или с путём).
#   mc-test.sh up <1.21.4|1.21.11> [--public]   поднять (предыдущую версию остановит); --public: порт наружу (MC_BIND=0.0.0.0)
#   mc-test.sh down                              остановить и убрать контейнер (данные версий остаются)
#   mc-test.sh status | logs [N] | memory
#   mc-test.sh keygen                            выдать ключ сервера mc-test (мастер-секрет читается из api.env, не выводится)
# Порт 25565 открывается наружу только вместе с: sudo bash setup-server.sh mc-port-open 25565 (и закрывается mc-port-close + down).
set -euo pipefail

BASE="${GIVEAWAY_REMOTE_BASE:-/srv/twomc-giveaway}"
MC_BASE="$BASE/mc"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$HERE/docker-compose.yml")

die() { echo "[mc-test][ОШИБКА] $*" >&2; exit 1; }

load_env() {
  [ -f "$MC_BASE/mc.env" ] || die "нет $MC_BASE/mc.env (скопируйте mc.env.example и задайте MC_EULA=TRUE осознанно)"
  set -a
  # shellcheck disable=SC1090,SC1091
  . "$MC_BASE/mc.env"
  set +a
  [ "${MC_EULA:-}" = "TRUE" ] || die "MC_EULA не TRUE в $MC_BASE/mc.env"
}

case "${1:-}" in
  up)
    VER="${2:-}"
    [[ "$VER" =~ ^1\.21\.(4|11)$ ]] || die "версия: 1.21.4 или 1.21.11"
    BIND="127.0.0.1"
    [ "${3:-}" = "--public" ] && BIND="0.0.0.0"
    load_env
    ls "$MC_BASE/plugins/"*.jar > /dev/null 2>&1 || die "положите jar плагина в $MC_BASE/plugins (giveaway/plugin/build/libs/*.jar)"
    [ -f "$BASE/keys/mc-test.v1.key" ] || die "нет ключа: mc-test.sh keygen"
    free_mb="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
    [ "$free_mb" -ge 1800 ] || echo "[mc-test][ВНИМАНИЕ] свободно ${free_mb} МБ ОЗУ (нужно ~1.8 ГБ); не запускайте вместе с e2e-giveaway.sh" >&2
    "${COMPOSE[@]}" down > /dev/null 2>&1 || true
    mkdir -p "$MC_BASE/data-$VER"
    MC_VERSION="$VER" MC_BIND="$BIND" MC_UID="$(id -u)" MC_GID="$(id -g)" "${COMPOSE[@]}" up -d
    echo "[mc-test] версия $VER, привязка порта: $BIND:${MC_PORT:-25565}"
    [ "$BIND" = "0.0.0.0" ] && echo "[mc-test] порт ОТКРЫТ наружу: закройте после теста (down + mc-port-close)"
    ;;
  down)
    MC_VERSION="${MC_VERSION:-1.21.4}" MC_EULA="${MC_EULA:-TRUE}" "${COMPOSE[@]}" down
    ;;
  status) docker ps -a --filter name=twomc-giveaway-mctest --format '{{.Names}}  {{.Status}}  {{.Ports}}' ;;
  logs) docker logs --tail="${2:-100}" twomc-giveaway-mctest ;;
  memory) docker stats --no-stream --format '{{.Name}}  {{.MemUsage}}' twomc-giveaway-mctest twomc-giveaway-api twomc-giveaway-postgres 2> /dev/null ;;
  keygen)
    "$HERE/../tools/giveaway-key.sh" --env-file "$BASE/secrets/api.env" --server-id mc-test --version 1 --out "$BASE/keys/mc-test.v1.key"
    ;;
  *) echo "Использование: $0 up <1.21.4|1.21.11> [--public] | down | status | logs [N] | memory | keygen" >&2; exit 2 ;;
esac
