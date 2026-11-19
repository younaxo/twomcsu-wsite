#!/usr/bin/env bash
# Первичная настройка VDS (Ubuntu/Debian) под мини-выкладку розыгрыша. Идемпотентно: каждый шаг проверяет «уже сделано».
# Запускается НА СЕРВЕРЕ ОДИН РАЗ от пользователя с sudo (sudo bash setup-server.sh ...). Без интерактивных вопросов.
# Секреты не выводятся: пароли и GIVEAWAY_MASTER_SECRET создаются openssl rand прямо в файлы (umask 077, права 600),
# только если файла ещё нет. Файлы и значения в stdout/stderr/логи не попадают.
#
# Команды:
#   setup           первичная настройка (по умолчанию):
#                     --deploy-user NAME   пользователь без root (по умолчанию gw)
#                     --pubkey-file PATH   файл с ПУБЛИЧНЫМ ключом агента (одна строка ssh-ed25519/ssh-rsa/ecdsa)
#                     --ssh-port N         порт sshd (по умолчанию 22)
#                     --mc-port N          (необязательно) открыть в ufw порт тестового Minecraft-сервера
#                     --domain NAME        домен розыгрыша (по умолчанию giveaway.twomc.su; нужен для хуков certbot)
#   issue-cert      выпуск сертификата Let's Encrypt (после того, как DNS указывает на этот сервер):
#                     --domain NAME  --email ADDR  --agree-le-tos  [--staging] [--force-dns]
#   mc-port-open N  разрешить порт тестового MC в ufw (на время теста)
#   mc-port-close N закрыть этот порт
#   verify          проверки без секретов (sshd, ufw, fail2ban, время, docker, права, порты)
#
# Docker и ufw: Docker публикует порты через iptables в обход ufw. Поэтому compose мини-выкладки публикует наружу только
# 80/443, а тестовый Minecraft (minecraft-test/) по умолчанию привязан к 127.0.0.1 и выставляется наружу только
# параметром MC_BIND (см. minecraft-test/README.md). Проверка с внешней машины: nmap -Pn <ip>.
set -euo pipefail
umask 022

BASE=/srv/twomc-giveaway
DEPLOY_USER=gw
PUBKEY_FILE=""
SSH_PORT=22
MC_PORT=""
DOMAIN=giveaway.twomc.su
EMAIL=""
AGREE_TOS=0
STAGING=0
FORCE_DNS=0
NGINX_CONTAINER=twomc-giveaway-nginx

log() { printf '[setup] %s\n' "$*"; }
warn() { printf '[setup][ВНИМАНИЕ] %s\n' "$*" >&2; }
die() { printf '[setup][ОШИБКА] %s\n' "$*" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive

CMD="setup"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then CMD="$1"; shift; fi
POSITIONAL=""
if [ "$CMD" = "mc-port-open" ] || [ "$CMD" = "mc-port-close" ]; then
  POSITIONAL="${1:-}"; [ $# -gt 0 ] && shift
fi
while [ $# -gt 0 ]; do
  case "$1" in
    --deploy-user) DEPLOY_USER="${2:-}"; shift 2 ;;
    --pubkey-file) PUBKEY_FILE="${2:-}"; shift 2 ;;
    --ssh-port) SSH_PORT="${2:-}"; shift 2 ;;
    --mc-port) MC_PORT="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --agree-le-tos) AGREE_TOS=1; shift ;;
    --staging) STAGING=1; shift ;;
    --force-dns) FORCE_DNS=1; shift ;;
    *) die "Неизвестный параметр: $1" ;;
  esac
done

# ---- Проверки окружения -------------------------------------------------------------------------------------------
check_env() {
  [ "$(id -u)" -eq 0 ] || die "Нужны права root: запустите через sudo."
  [ -r /etc/os-release ] || die "Нет /etc/os-release."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in ubuntu | debian) ;; *) die "Поддерживаются только Ubuntu/Debian (ID=${ID:-?})." ;; esac
  OS_ID="$ID"
  OS_CODENAME="${VERSION_CODENAME:-}"
  [ -n "$OS_CODENAME" ] || die "Не определён VERSION_CODENAME."
  command -v apt-get > /dev/null || die "Нужен apt-get."
  command -v systemctl > /dev/null || die "Нужен systemd."
  [[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] || die "--deploy-user: недопустимое имя."
  [ "$DEPLOY_USER" != "root" ] || die "--deploy-user не может быть root."
  [[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] && [ "$SSH_PORT" -ge 1 ] && [ "$SSH_PORT" -le 65535 ] || die "--ssh-port: 1..65535."
  if [ -n "$MC_PORT" ]; then
    [[ "$MC_PORT" =~ ^[0-9]{1,5}$ ]] && [ "$MC_PORT" -ge 1024 ] && [ "$MC_PORT" -le 65535 ] || die "--mc-port: 1024..65535."
  fi
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "--domain: недопустимое значение."
}

apt_install() {
  local missing=() p
  for p in "$@"; do dpkg -s "$p" > /dev/null 2>&1 || missing+=("$p"); done
  if [ "${#missing[@]}" -gt 0 ]; then
    log "apt: устанавливаю ${missing[*]}"
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends "${missing[@]}"
  fi
}

# ---- 1. Пользователь и SSH-ключ -----------------------------------------------------------------------------------
step_user() {
  if id "$DEPLOY_USER" > /dev/null 2>&1; then
    log "пользователь $DEPLOY_USER уже есть"
  else
    log "создаю пользователя $DEPLOY_USER (без пароля, без sudo)"
    adduser --disabled-password --gecos "" "$DEPLOY_USER" > /dev/null
  fi
  passwd -l "$DEPLOY_USER" > /dev/null 2>&1 || true   # пароль заблокирован: вход только по ключу

  local home ssh_dir ak
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  ssh_dir="$home/.ssh"
  ak="$ssh_dir/authorized_keys"
  install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ssh_dir"
  [ -e "$ak" ] || install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$ak"
  if [ -n "$PUBKEY_FILE" ]; then
    [ -r "$PUBKEY_FILE" ] || die "--pubkey-file не читается."
    [ "$(grep -c . "$PUBKEY_FILE")" -eq 1 ] || die "--pubkey-file: ожидается ровно одна строка публичного ключа."
    grep -Eq '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh.com) [A-Za-z0-9+/=]+( .*)?$' "$PUBKEY_FILE" \
      || die "--pubkey-file: не похоже на публичный ключ (приватный ключ сюда передавать нельзя)."
    if ssh-keygen -lf "$PUBKEY_FILE" > /dev/null 2>&1; then
      local line
      line="$(sed -n '1p' "$PUBKEY_FILE")"
      if grep -qxF "$line" "$ak"; then
        log "публичный ключ уже в authorized_keys"
      else
        printf '%s\n' "$line" >> "$ak"
        log "публичный ключ добавлен в authorized_keys"
      fi
    else
      die "--pubkey-file: ssh-keygen не распознал ключ."
    fi
  fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$ak"
  chmod 0600 "$ak"
  grep -Eq '^(ssh-|ecdsa-|sk-)' "$ak" || warn "в authorized_keys пока нет ключей: sshd НЕ будет ужесточён (передайте --pubkey-file)."
}

# ---- 2. sshd: запрет пароля и root --------------------------------------------------------------------------------
step_sshd() {
  local home ak dropin="/etc/ssh/sshd_config.d/10-twomc-hardening.conf"
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  ak="$home/.ssh/authorized_keys"
  if ! grep -Eq '^(ssh-|ecdsa-|sk-)' "$ak" 2> /dev/null; then
    warn "пропуск ужесточения sshd: у $DEPLOY_USER нет ключа (защита от потери доступа)."
    return 0
  fi
  apt_install openssh-server
  command -v sshd > /dev/null || die "sshd не найден."
  install -d -m 0755 /etc/ssh/sshd_config.d
  if ! grep -Eqi '^\s*Include\s+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config; then
    log "в sshd_config нет Include для sshd_config.d: добавляю в начало (копия: sshd_config.twomc-bak)"
    [ -e /etc/ssh/sshd_config.twomc-bak ] || cp -p /etc/ssh/sshd_config /etc/ssh/sshd_config.twomc-bak
    sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
  fi
  local want
  want="# Управляется setup-server.sh (twomc-giveaway). 10- идёт раньше cloud-init (50-*): первое значение побеждает.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
"
  if [ -f "$dropin" ] && [ "$(cat "$dropin")" = "$(printf '%s' "$want")" ]; then
    log "sshd: ужесточение уже применено"
    return 0
  fi
  local backup=""
  [ -f "$dropin" ] && { backup="$(mktemp)"; cp -p "$dropin" "$backup"; }
  printf '%s' "$want" > "$dropin"
  chmod 0644 "$dropin"
  if sshd -t; then
    systemctl reload ssh 2> /dev/null || systemctl reload sshd
    log "sshd: пароль и root-вход отключены (sshd -t прошёл, конфигурация перечитана)"
    warn "НЕ закрывайте текущую сессию: проверьте вход пользователем $DEPLOY_USER по ключу из второго окна."
  else
    if [ -n "$backup" ]; then cp -p "$backup" "$dropin"; else rm -f "$dropin"; fi
    die "sshd -t не прошёл; изменения откатаны, sshd не перезапускался."
  fi
  [ -z "$backup" ] || rm -f "$backup"
}

# ---- 3. ufw ------------------------------------------------------------------------------------------------------
step_ufw() {
  apt_install ufw
  ufw default deny incoming > /dev/null
  ufw default allow outgoing > /dev/null
  ufw allow "${SSH_PORT}/tcp" comment 'ssh' > /dev/null
  ufw allow 80/tcp comment 'giveaway http (acme, redirect)' > /dev/null
  ufw allow 443/tcp comment 'giveaway https' > /dev/null
  if [ -n "$MC_PORT" ]; then
    ufw allow "${MC_PORT}/tcp" comment 'minecraft test (временно)' > /dev/null
    log "ufw: открыт порт тестового MC ${MC_PORT}/tcp (закрыть: mc-port-close ${MC_PORT})"
  fi
  if ufw status | grep -q '^Status: active'; then
    log "ufw уже включён; правила обновлены"
  else
    ufw --force enable > /dev/null
    log "ufw включён: 22/80/443"
  fi
  # Docker обходит ufw: БД/Redis/API не публикуются compose, а 25565 привязан к 127.0.0.1 по умолчанию.
  log "заметка: Docker обходит ufw; публикуются только порты из compose (80/443), см. заголовок скрипта"
}

# ---- 4. fail2ban -------------------------------------------------------------------------------------------------
step_fail2ban() {
  apt_install fail2ban
  if apt-cache show python3-systemd > /dev/null 2>&1; then apt_install python3-systemd; fi
  local jail=/etc/fail2ban/jail.d/twomc-sshd.local want
  want="[sshd]
enabled = true
backend = systemd
port = ${SSH_PORT}
maxretry = 5
findtime = 10m
bantime = 1h
"
  if [ -f "$jail" ] && [ "$(cat "$jail")" = "$(printf '%s' "$want")" ]; then
    log "fail2ban: jail sshd уже настроен"
  else
    printf '%s' "$want" > "$jail"
    log "fail2ban: jail sshd записан"
  fi
  systemctl enable --now fail2ban > /dev/null 2>&1
  systemctl reload fail2ban > /dev/null 2>&1 || systemctl restart fail2ban
}

# ---- 5. Время ----------------------------------------------------------------------------------------------------
step_time() {
  if [ "$(timedatectl show -p Timezone --value)" != "UTC" ]; then
    timedatectl set-timezone UTC
    log "часовой пояс: UTC"
  else
    log "часовой пояс уже UTC"
  fi
  if ! systemctl is-active --quiet systemd-timesyncd && ! systemctl is-active --quiet chrony && ! systemctl is-active --quiet chronyd; then
    log "служба синхронизации времени не активна: ставлю chrony"
    apt_install chrony
    systemctl enable --now chrony > /dev/null 2>&1 || true
  fi
  timedatectl set-ntp true 2> /dev/null || true
  local i
  for i in $(seq 1 30); do
    [ "$(timedatectl show -p NTPSynchronized --value)" = "yes" ] && break
    sleep 2
  done
  if [ "$(timedatectl show -p NTPSynchronized --value)" = "yes" ]; then
    log "время синхронизировано (NTPSynchronized=yes)"
  else
    warn "NTPSynchronized != yes: подпись событий (окно +-300 с) может отказывать; проверьте timedatectl и повторите verify."
  fi
}

# ---- 6. Docker Engine + compose plugin ---------------------------------------------------------------------------
DOCKER_GPG_FPR="9DC858229FC7DD38854AE2D88D81803C0EBFCD88"   # официальный ключ Docker (docs.docker.com)

step_docker() {
  apt_install ca-certificates curl gnupg
  local key=/etc/apt/keyrings/docker.asc list=/etc/apt/sources.list.d/docker.list
  install -d -m 0755 /etc/apt/keyrings
  if [ ! -s "$key" ]; then
    local tmp
    tmp="$(mktemp)"
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" -o "$tmp"
    local fpr
    fpr="$(gpg --show-keys --with-colons "$tmp" 2> /dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
    if [ "$fpr" != "$DOCKER_GPG_FPR" ]; then
      rm -f "$tmp"
      die "отпечаток ключа Docker не совпал с ожидаемым; установка прервана."
    fi
    install -m 0644 "$tmp" "$key"
    rm -f "$tmp"
    log "ключ репозитория Docker проверен по отпечатку"
  else
    log "ключ репозитория Docker уже установлен"
  fi
  local line
  line="deb [arch=$(dpkg --print-architecture) signed-by=${key}] https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable"
  if [ ! -f "$list" ] || [ "$(cat "$list")" != "$line" ]; then
    printf '%s\n' "$line" > "$list"
    apt-get update -qq
  fi
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker > /dev/null 2>&1
  if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
    log "$DEPLOY_USER уже в группе docker"
  else
    usermod -aG docker "$DEPLOY_USER"
    log "$DEPLOY_USER добавлен в группу docker (эквивалент root для хоста: принятое решение, RUNBOOK п.1)"
  fi
  docker compose version > /dev/null || die "docker compose plugin недоступен."
}

# ---- 7. Каталоги и секреты ---------------------------------------------------------------------------------------
read_var() { grep -E "^$2=" "$1" | tail -n 1 | cut -d= -f2-; }   # значение не печатается

step_dirs() {
  install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE"
  local d
  for d in secrets keys backups; do
    install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE/$d"
  done
  for d in data releases state mc; do
    install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE/$d"
  done
  # nginx-unprivileged работает под uid 101: certs root:101 0750, privkey 0640, fullchain 0644 (RUNBOOK п.3).
  install -d -m 0750 -o root -g 101 "$BASE/certs"
  log "каталоги $BASE/{secrets,keys,backups}=700, certs=root:101 0750, data,releases,state,mc"
}

write_secret_file() {   # write_secret_file path  (содержимое со stdin; файл создаётся 0600, владелец deploy-user)
  local path="$1"
  ( umask 077; cat > "$path" )
  chown "$DEPLOY_USER:$DEPLOY_USER" "$path"
  chmod 0600 "$path"
}

gen_master_secret() {   # 64 hex-символа; требование API: >= 16 различных байт => в строке должны встретиться все 16 hex-цифр
  local s
  while :; do
    s="$(openssl rand -hex 32)"
    [ "$(printf '%s' "$s" | fold -w1 | sort -u | wc -l)" -ge 16 ] && break
  done
  printf '%s' "$s"
}

step_secrets() {
  command -v openssl > /dev/null || apt_install openssl
  local sd="$BASE/secrets" pg rd ms
  set +x
  if [ -e "$sd/postgres.env" ]; then
    log "postgres.env уже есть (не трогаю)"
  else
    pg="$(openssl rand -hex 24)"
    write_secret_file "$sd/postgres.env" <<EOF
POSTGRES_USER=giveaway
POSTGRES_DB=giveaway
POSTGRES_PASSWORD=${pg}
EOF
    unset pg
    log "postgres.env создан (600)"
  fi
  if [ -e "$sd/redis.env" ]; then
    log "redis.env уже есть (не трогаю)"
  else
    rd="$(openssl rand -hex 24)"
    write_secret_file "$sd/redis.env" <<EOF
REDIS_PASSWORD=${rd}
EOF
    unset rd
    log "redis.env создан (600)"
  fi
  if [ -e "$sd/api.env" ]; then
    log "api.env уже есть (не трогаю)"
  else
    pg="$(read_var "$sd/postgres.env" POSTGRES_PASSWORD)"
    rd="$(read_var "$sd/redis.env" REDIS_PASSWORD)"
    [ -n "$pg" ] && [ -n "$rd" ] || die "не удалось прочитать пароли из postgres.env/redis.env."
    ms="$(gen_master_secret)"
    write_secret_file "$sd/api.env" <<EOF
DATABASE_URL=postgresql://giveaway:${pg}@postgres:5432/giveaway?schema=public
REDIS_PASSWORD=${rd}
GIVEAWAY_ENABLED=true
GIVEAWAY_MASTER_SECRET=${ms}
GIVEAWAY_KEY_VERSION=1
GIVEAWAY_ALLOWED_SERVERS=anarchy-new-era,mc-test
GIVEAWAY_ONLY=true
EOF
    unset pg rd ms
    log "api.env создан (600); мастер-секрет сгенерирован на сервере и нигде не выведен"
  fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$sd"/*.env
  chmod 0600 "$sd"/*.env
}

# ---- 8. certbot и хуки -------------------------------------------------------------------------------------------
step_certbot() {
  apt_install certbot
  local pre=/etc/letsencrypt/renewal-hooks/pre/twomc-giveaway-nginx-stop.sh
  local post=/etc/letsencrypt/renewal-hooks/post/twomc-giveaway-nginx-start.sh
  local dep=/etc/letsencrypt/renewal-hooks/deploy/twomc-giveaway-install-certs.sh
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post /etc/letsencrypt/renewal-hooks/deploy

  # Режим: standalone на порту 80 (HTTP-01). nginx-контейнер публикует 80, поэтому на время выпуска/продления он останавливается
  # (несколько секунд раз в ~60 дней). Остановка/запуск - только если он был запущен.
  cat > "$pre" << EOF
#!/bin/sh
# twomc-giveaway: освободить порт 80 для certbot standalone
if docker inspect -f '{{.State.Running}}' ${NGINX_CONTAINER} 2>/dev/null | grep -q true; then
  touch /run/twomc-giveaway-nginx-was-running
  docker stop ${NGINX_CONTAINER} >/dev/null
fi
exit 0
EOF
  cat > "$post" << EOF
#!/bin/sh
# twomc-giveaway: вернуть nginx, если он работал до certbot
if [ -f /run/twomc-giveaway-nginx-was-running ]; then
  docker start ${NGINX_CONTAINER} >/dev/null
  rm -f /run/twomc-giveaway-nginx-was-running
fi
exit 0
EOF
  cat > "$dep" << EOF
#!/bin/sh
# twomc-giveaway: после выпуска/продления скопировать сертификат туда, откуда читает nginx-контейнер.
# RENEWED_LINEAGE задаёт certbot (/etc/letsencrypt/live/<домен>). Ключ: root:101 0640 (nginx-unprivileged = uid 101).
set -e
[ -n "\${RENEWED_LINEAGE:-}" ] || exit 0
D=${BASE}/certs
install -d -m 0750 -o root -g 101 "\$D"
install -m 0644 -o root -g 101 "\$RENEWED_LINEAGE/fullchain.pem" "\$D/fullchain.pem.new"
install -m 0640 -o root -g 101 "\$RENEWED_LINEAGE/privkey.pem" "\$D/privkey.pem.new"
mv -f "\$D/fullchain.pem.new" "\$D/fullchain.pem"
mv -f "\$D/privkey.pem.new" "\$D/privkey.pem"
# nginx запущен (если certbot вызван не через pre/post) - перечитать сертификаты
if docker inspect -f '{{.State.Running}}' ${NGINX_CONTAINER} 2>/dev/null | grep -q true; then
  docker exec ${NGINX_CONTAINER} nginx -s reload >/dev/null 2>&1 || true
fi
exit 0
EOF
  chmod 0755 "$pre" "$post" "$dep"
  systemctl enable --now certbot.timer > /dev/null 2>&1 || warn "certbot.timer не найден: автопродление проверьте вручную (systemctl list-timers)."
  log "certbot и хуки (stop nginx -> renew -> копирование -> start nginx) установлены; выпуск: issue-cert"
}

do_issue_cert() {
  [ -n "$EMAIL" ] || die "issue-cert: нужен --email."
  [ "$AGREE_TOS" -eq 1 ] || die "issue-cert: нужен --agree-le-tos (согласие с условиями Let's Encrypt от имени владельца)."
  command -v certbot > /dev/null || die "certbot не установлен: сначала выполните setup."
  if [ "$FORCE_DNS" -ne 1 ]; then
    local ips found=0 ip
    ips="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u || true)"
    [ -n "$ips" ] || die "DNS: $DOMAIN не резолвится. Дождитесь записи A (или --force-dns)."
    for ip in $ips; do
      if ip -o -4 addr show | awk '{print $4}' | cut -d/ -f1 | grep -qx "$ip"; then found=1; fi
    done
    [ "$found" -eq 1 ] || die "DNS: $DOMAIN указывает на [$(echo "$ips" | tr '\n' ' ')], а не на адрес этого сервера (NAT? тогда --force-dns)."
  fi
  if [ -s "${BASE}/certs/fullchain.pem" ] && [ -s "${BASE}/certs/privkey.pem" ] && [ "$STAGING" -ne 1 ]; then
    log "сертификаты уже лежат в ${BASE}/certs (выпуск пропущен; продление делает certbot.timer)"
    return 0
  fi
  if ss -ltn '( sport = :80 )' | grep -q ':80 '; then
    # Порт занят: если это наш nginx, pre-хук его остановит.
    docker inspect -f '{{.State.Running}}' "$NGINX_CONTAINER" 2> /dev/null | grep -q true \
      || die "порт 80 занят не контейнером $NGINX_CONTAINER; освободите его."
  fi
  local args=(certonly --standalone --preferred-challenges http -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --non-interactive)
  [ "$STAGING" -eq 1 ] && args+=(--staging --dry-run)
  certbot "${args[@]}"
  if [ "$STAGING" -ne 1 ]; then
    RENEWED_LINEAGE="/etc/letsencrypt/live/${DOMAIN}" /etc/letsencrypt/renewal-hooks/deploy/twomc-giveaway-install-certs.sh
    stat -c '%a %U:%G %n' "${BASE}/certs" "${BASE}/certs/"*.pem
    log "сертификат выпущен и установлен; запускайте/перезапускайте nginx: docker compose ... up -d nginx"
  else
    log "staging --dry-run выполнен (сертификат не выпускался)"
  fi
}

# ---- 9. Ежедневный бэкап БД --------------------------------------------------------------------------------------
step_backup() {
  local bin=/usr/local/sbin/twomc-giveaway-backup
  cat > "$bin" << 'EOF'
#!/usr/bin/env bash
# Бэкап БД мини-выкладки розыгрыша: pg_dump -Fc из контейнера postgres, права 600.
# Ротация: 7 последних дневных (giveaway-daily-YYYY-MM-DD.dump) + 4 последних недельных (воскресенье, giveaway-weekly-GGGG-Www.dump).
# Дамп содержит данные подсчёта времени игроков; копия вне сервера - решение владельца.
set -euo pipefail
umask 077
DIR="${GIVEAWAY_BACKUP_DIR:-/srv/twomc-giveaway/backups}"
C="${GIVEAWAY_PG_CONTAINER:-twomc-giveaway-postgres}"
mkdir -p "$DIR"
chmod 0700 "$DIR"
tmp="$(mktemp -p "$DIR" .dump.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
docker exec "$C" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"
[ -s "$tmp" ] || { echo "backup: пустой дамп" >&2; exit 1; }
docker exec -i "$C" pg_restore -l < "$tmp" > /dev/null || { echo "backup: дамп не читается pg_restore" >&2; exit 1; }
day="$(date -u +%F)"
mv "$tmp" "$DIR/giveaway-daily-${day}.dump"
chmod 0600 "$DIR/giveaway-daily-${day}.dump"
if [ "$(date -u +%u)" = "7" ]; then
  cp -p "$DIR/giveaway-daily-${day}.dump" "$DIR/giveaway-weekly-$(date -u +%G-W%V).dump"
  chmod 0600 "$DIR/giveaway-weekly-$(date -u +%G-W%V).dump"
fi
# Ротация (только собственные файлы бэкапа по шаблону имён).
ls -1 "$DIR"/giveaway-daily-*.dump 2> /dev/null | sort | head -n -7 | xargs -r rm -f --
ls -1 "$DIR"/giveaway-weekly-*.dump 2> /dev/null | sort | head -n -4 | xargs -r rm -f --
echo "backup: ok giveaway-daily-${day}.dump"
EOF
  chmod 0755 "$bin"
  cat > /etc/systemd/system/twomc-giveaway-backup.service << EOF
[Unit]
Description=Бэкап БД мини-выкладки розыгрыша
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=${DEPLOY_USER}
ExecStart=${bin}
PrivateTmp=true
NoNewPrivileges=true
EOF
  cat > /etc/systemd/system/twomc-giveaway-backup.timer << 'EOF'
[Unit]
Description=Ежедневный бэкап БД розыгрыша (03:15 UTC)

[Timer]
OnCalendar=*-*-* 03:15:00 UTC
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now twomc-giveaway-backup.timer > /dev/null 2>&1
  log "бэкап: twomc-giveaway-backup.timer (03:15 UTC); ручной запуск: systemctl start twomc-giveaway-backup.service"
}

# ---- Порты тестового MC ------------------------------------------------------------------------------------------
do_mc_port() {
  local action="$1" port="$2"
  [[ "$port" =~ ^[0-9]{4,5}$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || die "порт: 1024..65535."
  command -v ufw > /dev/null || die "ufw не установлен: сначала setup."
  if [ "$action" = "open" ]; then
    ufw allow "${port}/tcp" comment 'minecraft test (временно)' > /dev/null
    log "ufw: ${port}/tcp открыт. Для Docker дополнительно нужен MC_BIND=<публичный ip> (minecraft-test/README.md)."
  else
    ufw delete allow "${port}/tcp" > /dev/null 2>&1 || true
    log "ufw: правило ${port}/tcp снято. Верните MC_BIND=127.0.0.1 и пересоздайте контейнер MC."
  fi
}

# ---- Проверки без секретов ---------------------------------------------------------------------------------------
do_verify() {
  local rc=0
  log "sshd (эффективные значения):"
  sshd -T 2> /dev/null | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication|kbdinteractiveauthentication) ' || { warn "sshd -T недоступен"; rc=1; }
  log "ufw:"; ufw status verbose | sed -n '1,20p'
  log "fail2ban sshd:"; fail2ban-client status sshd 2> /dev/null | sed -n '1,8p' || { warn "jail sshd не найден"; rc=1; }
  log "время:"; timedatectl | grep -E 'Time zone|System clock synchronized|NTP service'
  [ "$(timedatectl show -p NTPSynchronized --value)" = "yes" ] || { warn "часы не синхронизированы"; rc=1; }
  log "docker:"; docker --version; docker compose version
  log "права (режим владелец:группа путь):"
  stat -c '%a %U:%G %n' "$BASE" "$BASE/secrets" "$BASE/keys" "$BASE/backups" "$BASE/certs" "$BASE/secrets/"*.env 2> /dev/null || true
  [ -z "$(stat -c '%a' "$BASE/secrets/"*.env 2> /dev/null | grep -v '^600$' || true)" ] || { warn "есть секретные файлы не 600"; rc=1; }
  log "слушающие порты хоста (ожидаем 22, 80, 443; 25565 - только на время теста):"
  ss -ltnH | awk '{print $4}' | sort -u
  log "опубликованные порты контейнеров:"
  docker ps --format '{{.Names}}  {{.Ports}}' 2> /dev/null || true
  log "таймеры:"; systemctl list-timers --no-pager 2> /dev/null | grep -E 'twomc|certbot' || { warn "таймеры бэкапа/certbot не найдены"; rc=1; }
  return "$rc"
}

# ---- Точка входа -------------------------------------------------------------------------------------------------
check_env
case "$CMD" in
  setup)
    step_user
    step_sshd
    step_ufw
    step_fail2ban
    step_time
    step_docker
    step_dirs
    step_secrets
    step_certbot
    step_backup
    log "готово. Дальше: DNS giveaway -> issue-cert -> deploy.sh (см. RUNBOOK.md). Проверка: sudo bash setup-server.sh verify"
    ;;
  issue-cert) do_issue_cert ;;
  mc-port-open) do_mc_port open "$POSITIONAL" ;;
  mc-port-close) do_mc_port close "$POSITIONAL" ;;
  verify) do_verify ;;
  *) die "Неизвестная команда: $CMD (setup | issue-cert | mc-port-open N | mc-port-close N | verify)" ;;
esac
