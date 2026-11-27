#!/usr/bin/env bash
export LC_ALL=C
# Общие функции для скриптов dev-srv, которым нужен СТЕНД (БД и tools-образ): register-dev-srv.sh, link-account.sh.
# Подключается через `source` (run-on-vds.sh добавляет её в пакет перед скриптом). Запускается ТОЛЬКО на VDS от пользователя twomc.
# Секреты: stand.env читается только построчно через stand_env_get (значения нигде не печатаются), в docker уходит как --env-file.
# Ничего не читает из stdin (docker с </dev/null), чтобы не съесть скрипт, поданный через `bash -s`.
# Тестовый режим STAND_TEST=1 (только для сухих прогонов на фиктивных файлах): STAND_ROOT и STAND_CRED_FILE берутся из окружения,
# проверка пользователя пропускается. В боевом режиме эти переменные игнорируются.

stand_die() { echo "stand: $*" >&2; return 1; }

# Проверка файла с секретами перед чтением: обычный файл (не ссылка), права РОВНО 600, владелец - текущий пользователь; иначе отказ.
twomc_secure_file() {
  local f="$1" perm own
  [[ -f "$f" && ! -L "$f" ]] || { echo "ОТКАЗ: $f не обычный файл (или ссылка)" >&2; return 1; }
  perm="$(stat -c %a -- "$f" 2>/dev/null || echo ?)"; own="$(stat -c %u -- "$f" 2>/dev/null || echo ?)"
  [[ "$perm" == 600 ]] || { echo "ОТКАЗ: права $f: $perm (нужно ровно 600; chmod 600)" >&2; return 1; }
  [[ "$own" == "$(id -u)" ]] || { echo "ОТКАЗ: владелец $f не текущий пользователь" >&2; return 1; }
  return 0
}

stand_init() {
  umask 077
  STAND_REAL_ROOT=/srv/twomc-stand
  if [[ "${STAND_TEST:-0}" == 1 ]]; then
    # тестовый режим - только если ptero.sh его подтвердил (_PT_TEST=1) и пути лежат внутри PTERO_TEST_ROOT
    [[ "${_PT_TEST:-0}" == 1 ]] || { stand_die "STAND_TEST=1 не подтверждён (нужен PTERO_TEST_ROOT с маркером .ptero-test-root)"; return 1; }
    STAND_ROOT="${STAND_ROOT:?STAND_TEST=1 требует STAND_ROOT}"; STAND_CRED_FILE="${STAND_CRED_FILE:?STAND_TEST=1 требует STAND_CRED_FILE}"
    [[ "$STAND_ROOT" == "$PTERO_TEST_ROOT"/* && "$STAND_CRED_FILE" == "$PTERO_TEST_ROOT"/* && "$STAND_ROOT$STAND_CRED_FILE" != *..* ]] || { stand_die "STAND_ROOT и STAND_CRED_FILE должны лежать внутри PTERO_TEST_ROOT"; return 1; }
  else
    STAND_ROOT="$STAND_REAL_ROOT"; STAND_CRED_FILE=/home/twomc/test-website-credentials.txt
    [[ "$(id -un)" == "${STAND_USER:-twomc}" ]] || { stand_die "запуск только от пользователя ${STAND_USER:-twomc}"; return 1; }
  fi
  STAND_ENV_FILE="$STAND_ROOT/stand.env"
  [[ -d "$STAND_ROOT" && -f "$STAND_ENV_FILE" && -f "$STAND_ROOT/.release" ]] || { stand_die "нет $STAND_ROOT/stand.env или .release (стенд не развёрнут?)"; return 1; }
  local sha; sha="$(cat "$STAND_ROOT/.release")"
  [[ "$sha" =~ ^[0-9a-f]{12,40}$ ]] || { stand_die ".release: неверный формат sha"; return 1; }
  STAND_IMAGE="twomc-stand-tools:${sha:0:12}"
  STAND_WORK="$(mktemp -d "${TMPDIR:-/tmp}/dev-srv-stand.XXXXXX")" || return 1
  chmod 700 "$STAND_WORK"
  return 0
}

# Вызывать из trap EXIT: рабочий каталог содержит только свои временные файлы (ключ затирается перед удалением).
stand_cleanup() {
  [[ -n "${STAND_WORK:-}" && -d "$STAND_WORK" ]] || return 0
  local f; for f in "$STAND_WORK"/*; do [[ -f "$f" ]] && : > "$f"; done
  rm -rf -- "$STAND_WORK"
}

# Значение ключа из stand.env (только для внутренних проверок; env-файл не source-им, в нём есть '&').
stand_env_get() { grep -E "^$1=" "$STAND_ENV_FILE" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# Тот же lock, что у deploy-stand.sh и rotate-2fa.sh (fd 9, не блокирующий).
stand_lock() {
  exec 9>"$STAND_ROOT/.deploy.lock"
  flock -n 9 || { stand_die "идёт деплой или другая операция стенда (flock $STAND_ROOT/.deploy.lock занят), повторите позже"; return 5; }
}

# db.env: DATABASE_URL для запуска с --network host (как в rotate-2fa.sh). Файл 600 в рабочем каталоге.
stand_write_db_env() {
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' "$(stand_env_get POSTGRES_USER)" "$(stand_env_get POSTGRES_PASSWORD)" \
    "$(stand_env_get STAND_PG_PORT)" "$(stand_env_get POSTGRES_DB)" > "$STAND_WORK/db.env"
  chmod 600 "$STAND_WORK/db.env"
}

# stand_tools <файл-ts-или-пусто> <ENV=VAL ...> -- <аргументы ts-node...>
# Запуск в tools-образе (cwd /app/apps/api). stdout/stderr отдаются вызывающему: он решает, что показывать (значения не печатать).
# Если задан файл-ts, он монтируется как /app/apps/api/<базовое имя> (ro). Переменные -e передаются через env-file в рабочем каталоге.
stand_tools() {
  local ts="$1"; shift
  local envs=() a
  while [[ $# -gt 0 && "$1" != -- ]]; do envs+=("$1"); shift; done
  shift
  : > "$STAND_WORK/extra.env"; chmod 600 "$STAND_WORK/extra.env"
  for a in ${envs[@]+"${envs[@]}"}; do printf '%s\n' "$a" >> "$STAND_WORK/extra.env"; done
  local mount=()
  if [[ -n "$ts" ]]; then mount=(-v "$ts:/app/apps/api/$(basename "$ts"):ro"); fi
  docker run --rm --network host --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --env-file "$STAND_ENV_FILE" --env-file "$STAND_WORK/db.env" --env-file "$STAND_WORK/extra.env" \
    -e HOME=/tmp -e TS_NODE_TRANSPILE_ONLY=1 ${mount[@]+"${mount[@]}"} \
    -w /app/apps/api "$STAND_IMAGE" pnpm exec ts-node "$@" </dev/null
}
