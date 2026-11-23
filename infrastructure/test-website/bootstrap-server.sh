#!/usr/bin/env bash
# Базовая подготовка VDS стенда (Ubuntu 24.04). Запускать от пользователя twomc с sudo ПОСЛЕ того, как
# он создан и вход по ключу проверен (создание пользователя - см. docs/runbooks/test-website-stand.md, раздел 1).
# Порядок защищает от самоблокировки: до закрытия root/пароля скрипт сам проверяет, что мы НЕ root, что у
# пользователя есть authorized_keys и работает sudo -n; после правки sshd сверяет фактические параметры (sshd -T);
# SSH-порт для ufw берётся из sshd -T, а не из профиля OpenSSH.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# 0. Предпроверки (до любых изменений SSH).
if [[ "$EUID" -eq 0 ]]; then echo "Запускайте от обычного пользователя с sudo, не от root" >&2; exit 1; fi
test -s "$HOME/.ssh/authorized_keys" || { echo "Нет непустого $HOME/.ssh/authorized_keys: вход по ключу не подготовлен" >&2; exit 1; }
sudo -n true || { echo "sudo без пароля не работает: закрытие root/пароля отменено" >&2; exit 1; }

# 1. SSH: drop-in с префиксом 00 (первое совпадение побеждает, cloud-init drop-in не перебьёт).
sudo tee /etc/ssh/sshd_config.d/00-twomc-hardening.conf >/dev/null <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
sudo sshd -t
sudo systemctl reload ssh
# Сверка фактических параметров. Действующая сессия не рвётся (reload), но при расхождении останавливаемся.
EFF="$(sudo sshd -T)"
for kv in "permitrootlogin no" "passwordauthentication no" "kbdinteractiveauthentication no" "pubkeyauthentication yes"; do
  grep -qix "$kv" <<<"$EFF" || { echo "sshd -T: нет '$kv' (проверьте drop-in и порядок include)" >&2; exit 1; }
done
SSH_PORT="$(awk '/^port /{print $2; exit}' <<<"$EFF")"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || { echo "Не удалось определить порт SSH из sshd -T" >&2; exit 1; }

sudo apt-get update -qq
sudo apt-get install -y -qq ufw fail2ban chrony unattended-upgrades ca-certificates curl gnupg apache2-utils dnsutils gettext-base

# 2. Firewall: SSH (порт из sshd -T) раньше enable, 80, 443.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow "${SSH_PORT}/tcp"
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 3. fail2ban (sshd): мягкий профиль, чтобы оператор не банил сам себя (бан короткий, без aggressive).
# Запасной выход при бане: консоль провайдера -> sudo fail2ban-client unban <ip> (runbook, раздел 7).
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'CONF'
[sshd]
enabled = true
maxretry = 10
findtime = 10m
bantime = 10m
CONF
sudo systemctl enable --now fail2ban chrony
sudo systemctl restart fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

# 4. Docker из официального репозитория, nginx, certbot.
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx certbot python3-certbot-nginx
sudo usermod -aG docker "$(id -un)"
sudo systemctl enable --now docker nginx
