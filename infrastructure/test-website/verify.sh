#!/usr/bin/env bash
# Проверки стенда НА СЕРВЕРЕ (секреты не печатаются; basic auth читается из файла и передаётся curl через stdin-конфиг).
#   /srv/twomc-stand/ops/verify.sh [домен]
set -uo pipefail
STAND_DOMAIN="${1:-${STAND_DOMAIN:-test-website.twomc.su}}"
BASIC_FILE="${BASIC_FILE:-$HOME/test-website-basic-auth.txt}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
IP="$(dig +short "$STAND_DOMAIN" @1.1.1.1 | head -1)"
fail=0
check() { # имя, ожидание, факт
  if [[ "$3" == $2 ]]; then echo "OK   $1: $3"; else echo "FAIL $1: ожидалось $2, получено $3"; fail=1; fi
}
authed() { printf 'user = "%s"\n' "$(cat "$BASIC_FILE")" | curl -K - "$@"; }

envval() { grep -E "^$1=" "$STAND_ROOT/stand.env" 2>/dev/null | head -1 | cut -d= -f2-; }
check "stand.env права 600" "600" "$(stat -c %a "$STAND_ROOT/stand.env" 2>/dev/null || echo none)"
check "gate.token права 600" "600" "$(stat -c %a "$STAND_ROOT/gate.token" 2>/dev/null || echo none)"
check "basic-auth файл права 600" "600" "$(stat -c %a "$BASIC_FILE" 2>/dev/null || echo none)"
check "окончательный файл учётных данных права 600 (только чтение)" "600" "$(stat -c %a /home/twomc/test-website-credentials.txt 2>/dev/null || echo none)"
check "AUTH_TEST_OTP_ENABLED не true" "0" "$(grep -Eic '^AUTH_TEST_OTP_ENABLED=("?)true' "$STAND_ROOT/stand.env" 2>/dev/null || true)"
COOKIE_HDR="$(authed -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^set-cookie: __Host-stand_gate' || echo none)"
cookie_ok=1
for flag in 'secure' 'httponly' 'samesite=lax' 'path=/'; do grep -qi "$flag" <<<"$COOKIE_HDR" || cookie_ok=0; done
grep -qi 'domain=' <<<"$COOKIE_HDR" && cookie_ok=0
check "cookie-пропуск: __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, без Domain" "1" "$cookie_ok"
for port in "$(envval WEB_PORT)" "$(envval API_PORT)" "$(envval STAND_PG_PORT)"; do
  [[ -n "$port" ]] || continue
  check "порт $port слушает только loopback" "0" "$(ss -tln | awk -v p=":$port\$" '$4 ~ p && $4 !~ /^127\.0\.0\.1:/' | wc -l)"
done
echo "DNS (с сервера, 1.1.1.1): $STAND_DOMAIN -> $IP"
check "http -> https редирект" "301 https://$STAND_DOMAIN/*" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://$STAND_DOMAIN/")"
check "без auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "неверный пароль" "401" "$(curl -s -o /dev/null -w '%{http_code}' -u 'stand:wrong' "https://$STAND_DOMAIN/")"
check "401 несёт X-Robots-Tag" "*noindex*nofollow*" "$(curl -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "401 не выдаёт cookie-пропуск" "0" "$(curl -sI -u 'stand:wrong' "https://$STAND_DOMAIN/" | grep -ci '^set-cookie: __Host-stand_gate')"
check "с auth" "200" "$(authed -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "с auth X-Robots-Tag" "*noindex*nofollow*" "$(authed -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "robots.txt без auth" "*Disallow: /*" "$(curl -s "https://$STAND_DOMAIN/robots.txt" | tr '\n' ' ')"
check "API /health (с auth)" "200" "$(authed -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "API /health без auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "неизвестный Host :80" "000" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: unknown.example.invalid' "http://127.0.0.1/")"
check "неизвестный SNI :443" "000" "$(curl -sk -o /dev/null -w '%{http_code}' --resolve "unknown.example.invalid:443:127.0.0.1" "https://unknown.example.invalid/")"

check "Redis не опубликован" "0" "$(ss -tln | awk '$4 ~ /:6379$/' | wc -l)"
exit $fail
