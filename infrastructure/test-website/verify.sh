#!/usr/bin/env bash
# Проверки стенда НА СЕРВЕРЕ (секреты не печатаются; токен и пароль передаются curl через stdin-конфиг, не через argv).
#   /srv/twomc-stand/ops/verify.sh [домен]
# Схема защиты: форма входа (gate), см. nginx.stand.conf.template и runbook.
set -uo pipefail
STAND_DOMAIN="${1:-${STAND_DOMAIN:-test-website.twomc.su}}"
STAND_ROOT="${STAND_ROOT:-/srv/twomc-stand}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-/home/twomc/test-website-credentials.txt}"
fail=0
check() { # имя, ожидание, факт
  if [[ "$3" == $2 ]]; then echo "OK   $1: $3"; else echo "FAIL $1: ожидалось $2, получено $3"; fail=1; fi
}
# Запрос с сервисным токеном (заголовок X-Stand-Gate) - как раннер и мониторинг.
authed() { printf 'header = "X-Stand-Gate: %s"\n' "$(cat "$STAND_ROOT/gate.token")" | curl -K - "$@"; }
cred_pass() {
  awk 'BEGIN{s=0} /^[[:space:]]*\[/{s=(tolower($0) ~ /^[[:space:]]*\[basic auth\][[:space:]]*\r?$/)} s && /^[[:space:]]*password[[:space:]]*:/{sub(/^[^:]*:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' "$CREDENTIALS_FILE" 2>/dev/null
}
# Вход формой (пароль из файла учётных данных, через stdin-конфиг): заголовки ответа. Аргументы: Origin, пароль.
login_post() {
  { printf 'header = "Origin: %s"\n' "$1"; printf 'data-urlencode = "password=%s"\n' "$2"; printf 'data-urlencode = "next=/"\n'; } \
    | curl -K - -s -D - -o /dev/null "https://$STAND_DOMAIN/__stand/login" | tr -d '\r'
}

envval() { grep -E "^$1=" "$STAND_ROOT/stand.env" 2>/dev/null | head -1 | cut -d= -f2-; }
check "stand.env права 600" "600" "$(stat -c %a "$STAND_ROOT/stand.env" 2>/dev/null || echo none)"
check "gate.token права 600" "600" "$(stat -c %a "$STAND_ROOT/gate.token" 2>/dev/null || echo none)"
check "gate.key права 600" "600" "$(stat -c %a "$STAND_ROOT/gate.key" 2>/dev/null || echo none)"
check "gate.pass.hash права 600" "600" "$(stat -c %a "$STAND_ROOT/gate.pass.hash" 2>/dev/null || echo none)"
check "файл учётных данных права 600 (только чтение)" "600" "$(stat -c %a "$CREDENTIALS_FILE" 2>/dev/null || echo none)"
check "AUTH_TEST_OTP_ENABLED не true" "0" "$(grep -Eic '^AUTH_TEST_OTP_ENABLED=("?)true' "$STAND_ROOT/stand.env" 2>/dev/null || true)"
check "gate-контейнер работает" "true" "$(docker inspect -f '{{.State.Running}}' twomc-stand-gate 2>/dev/null || echo none)"
for port in "$(envval WEB_PORT)" "$(envval API_PORT)" "$(envval STAND_PG_PORT)" "${GATE_PORT:-4100}"; do
  [[ -n "$port" ]] || continue
  check "порт $port слушает только loopback" "0" "$(ss -tln | awk -v p=":$port\$" '$4 ~ p && $4 !~ /^127\.0\.0\.1:/' | wc -l)"
done
echo "DNS (с сервера, 1.1.1.1): $STAND_DOMAIN -> $(dig +short "$STAND_DOMAIN" @1.1.1.1 | head -1)"
check "http -> https редирект" "301 https://$STAND_DOMAIN/*" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://$STAND_DOMAIN/")"

# Форма входа и защита
check "страница без входа -> 302 на форму" "302 https://$STAND_DOMAIN/__stand/login?next=*" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "https://$STAND_DOMAIN/")"
check "302 несёт X-Robots-Tag" "*noindex*nofollow*" "$(curl -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "форма: 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/__stand/login")"
check "форма несёт X-Robots-Tag (один раз)" "1" "$(curl -sI "https://$STAND_DOMAIN/__stand/login" | grep -ci '^x-robots-tag')"
check "форма: meta robots noindex" "1" "$(curl -s "https://$STAND_DOMAIN/__stand/login" | grep -c 'name="robots" content="noindex')"
check "open redirect: next=//evil.invalid схлопывается в /" 'name="next" value="/"' "$(curl -s "https://$STAND_DOMAIN/__stand/login?next=//evil.invalid" | grep -o 'name="next" value="[^"]*"')"
check "/__stand/auth снаружи недоступен" "404" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/__stand/auth")"
check "/api/auth/me без входа -> 401 JSON" "401 application/json*" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "https://$STAND_DOMAIN/api/auth/me")"
check "401 JSON несёт X-Robots-Tag" "*noindex*nofollow*" "$(curl -sI "https://$STAND_DOMAIN/api/auth/me" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "/api/health без входа" "200" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "вебхук платежей без входа доходит до API (JSON от API, не форма)" "4* application/json*" "$(curl -s -X POST -o /dev/null -w '%{http_code} %{content_type}' "https://$STAND_DOMAIN/api/webhooks/payments/test")"
check "robots.txt без входа" "*Disallow: /*" "$(curl -s "https://$STAND_DOMAIN/robots.txt" | tr '\n' ' ')"
WRONG_HDR="$(login_post "https://$STAND_DOMAIN" "$(openssl rand -hex 6)")"
check "неверный пароль -> 401" "HTTP/*401*" "$(head -1 <<<"$WRONG_HDR")"
check "неверный пароль не выдаёт cookie" "0" "$(grep -ci '^set-cookie: __Host-stand_gate' <<<"$WRONG_HDR")"
check "вход с чужим Origin -> 403" "HTTP/*403*" "$(login_post "https://evil.invalid" "$(openssl rand -hex 6)" | head -1)"
OK_HDR="$(login_post "https://$STAND_DOMAIN" "$(cred_pass)")"
check "верный пароль -> 303" "HTTP/*303*" "$(head -1 <<<"$OK_HDR")"
COOKIE_HDR="$(grep -i '^set-cookie: __Host-stand_gate' <<<"$OK_HDR" || echo none)"
cookie_ok=1
for flag in 'secure' 'httponly' 'samesite=lax' 'path=/' 'max-age=604800'; do grep -qi "$flag" <<<"$COOKIE_HDR" || cookie_ok=0; done
grep -qi 'domain=' <<<"$COOKIE_HDR" && cookie_ok=0
check "cookie: __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, 7 суток, без Domain" "1" "$cookie_ok"
COOKIE_VAL="$(sed -n 's/^[Ss]et-[Cc]ookie: \(__Host-stand_gate=[^;]*\);.*/\1/p' <<<"$OK_HDR" | head -1)"
check "с cookie страница 200" "200" "$(printf 'header = "Cookie: %s"\n' "$COOKIE_VAL" | curl -K - -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "с cookie /api/health 200" "200" "$(printf 'header = "Cookie: %s"\n' "$COOKIE_VAL" | curl -K - -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/api/health")"
check "с токеном X-Stand-Gate страница 200" "200" "$(authed -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "с неверным X-Stand-Gate -> 302" "302" "$(printf 'header = "X-Stand-Gate: %s"\n' "$(openssl rand -hex 24)" | curl -K - -s -o /dev/null -w '%{http_code}' "https://$STAND_DOMAIN/")"
check "с токеном X-Robots-Tag" "*noindex*nofollow*" "$(authed -sI "https://$STAND_DOMAIN/" | tr -d '\r' | grep -i '^x-robots-tag' || echo none)"
check "выход очищает cookie" "*Max-Age=0*" "$(curl -sI "https://$STAND_DOMAIN/__stand/logout" | tr -d '\r' | grep -i '^set-cookie: __Host-stand_gate' || echo none)"
check "неизвестный Host :80" "000" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: unknown.example.invalid' "http://127.0.0.1/")"
check "неизвестный SNI :443" "000" "$(curl -sk -o /dev/null -w '%{http_code}' --resolve "unknown.example.invalid:443:127.0.0.1" "https://unknown.example.invalid/")"

check "Redis не опубликован" "0" "$(ss -tln | awk '$4 ~ /:6379$/' | wc -l)"
exit $fail
