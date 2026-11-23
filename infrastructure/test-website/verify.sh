#!/usr/bin/env bash
# Проверки стенда НА СЕРВЕРЕ (секреты не печатаются; basic auth читается из файла и передаётся curl через stdin-конфиг).
#   /srv/twomc-stand/ops/verify.sh [домен]
set -uo pipefail
STAND_DOMAIN="${1:-${STAND_DOMAIN:-test-website.twomc.su}}"
BASIC_FILE="${BASIC_FILE:-$HOME/test-website-basic-auth.txt}"
IP="$(dig +short "$STAND_DOMAIN" @1.1.1.1 | head -1)"
fail=0
check() { # имя, ожидание, факт
  if [[ "$3" == $2 ]]; then echo "OK   $1: $3"; else echo "FAIL $1: ожидалось $2, получено $3"; fail=1; fi
}
authed() { printf 'user = "%s"\n' "$(cat "$BASIC_FILE")" | curl -K - "$@"; }

echo "DNS (с сервера, 1.1.1.1): $STAND_DOMAIN -> $IP"
check "http -> https редирект" "301 https://$STAND_DOMAIN/*" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://$STAND_DOMAIN/")"
check "без auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "неверный пароль" "401" "$(curl -s -o /dev/null -w '%{http_code}' -u 'stand:wrong' "https://$STAND_DOMAIN/")"
check "401 несёт X-Robots-Tag" "*noindex*nofollow*" "$(curl -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "401 не выдаёт cookie-пропуск" "0" "$(curl -sI -u 'stand:wrong' "https://$STAND_DOMAIN/" | grep -ci '^set-cookie: stand_gate')"
check "с auth" "200" "$(authed -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "с auth X-Robots-Tag" "*noindex*nofollow*" "$(authed -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "robots.txt без auth" "*Disallow: /*" "$(curl -s "https://$STAND_DOMAIN/robots.txt" | tr '\n' ' ')"
check "API /health (с auth)" "200" "$(authed -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "API /health без auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "неизвестный Host :80" "000" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: unknown.example.invalid' "http://127.0.0.1/")"
check "неизвестный SNI :443" "000" "$(curl -sk -o /dev/null -w '%{http_code}' --resolve "unknown.example.invalid:443:127.0.0.1" "https://unknown.example.invalid/")"
check "Postgres только на loopback" "0" "$(ss -tln | awk '$4 ~ /:55432$/ && $4 !~ /^127\.0\.0\.1:/' | wc -l)"
check "Redis не опубликован" "0" "$(ss -tln | awk '$4 ~ /:6379$/' | wc -l)"
exit $fail
