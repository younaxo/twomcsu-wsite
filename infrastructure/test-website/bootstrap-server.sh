#!/usr/bin/env bash
# Базовая подготовка VDS стенда (Ubuntu 24.04). Запускать от пользователя twomc с sudo ПОСЛЕ того, как
# он создан и вход по ключу проверен (создание пользователя - см. docs/runbooks/test-website-stand.md, раздел 1).
# Порядок защищает от самоблокировки: SSH-правило ufw добавляется до enable, вход root/паролем закрывается
# только после проверки входа twomc с sudo (проверку делает оператор до запуска).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# SSH: drop-in с префиксом 00 (первое совпадение побеждает, cloud-init drop-in не перебьёт).
sudo tee /etc/ssh/sshd_config.d/00-twomc-hardening.conf >/dev/null <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
sudo sshd -t
sudo systemctl reload ssh

sudo apt-get update -qq
sudo apt-get install -y -qq ufw fail2ban chrony unattended-upgrades ca-certificates curl gnupg apache2-utils dnsutils gettext-base

# Firewall: только SSH, 80, 443.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# fail2ban (sshd), время, автообновления безопасности.
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'CONF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
CONF
sudo systemctl enable --now fail2ban chrony
sudo systemctl restart fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

# Docker из официального репозитория, nginx, certbot.
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx certbot python3-certbot-nginx
sudo usermod -aG docker "$(id -un)"
sudo systemctl enable --now docker nginx
