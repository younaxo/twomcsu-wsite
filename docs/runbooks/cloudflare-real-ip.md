# Cloudflare перед nginx: real_ip и закрытие origin (P3-02b)

Статус: подготовлено, НЕ включено. Топология production владельцем не выбрана; по умолчанию принята схема
`клиент -> nginx -> api` (допущение, ADR-0160). Этот runbook применять только после решения владельца
пустить трафик через Cloudflare. Сервер при подготовке не затрагивался.

Связанные документы: ADR-0155 (TRUST_PROXY), ADR-0160, `infrastructure/nginx.twomc.su.conf.example`,
`docs/runbooks/deploy.md`.

## 1. Зачем

Если домен проксируется Cloudflare, nginx видит как `$remote_addr` адрес узла Cloudflare, а не клиента.
Без настройки все пользователи получат «адреса Cloudflare»: общий throttler, общая блокировка brute-force,
неверные `lastLoginIp`, audit и captcha. Модуль `ngx_http_realip_module` подменяет `$remote_addr` на значение
`CF-Connecting-IP`, но только если соединение пришло с доверенного адреса из `set_real_ip_from`.

## 2. Согласование с TRUST_PROXY=1 и X-Forwarded-For

- nginx остаётся единственным доверенным хопом для API (ADR-0155): `proxy_set_header X-Forwarded-For $remote_addr;`
  (перезапись, не `$proxy_add_x_forwarded_for`) и `TRUST_PROXY=1` в API.
- С включённым `real_ip` значение `$remote_addr` уже равно IP клиента, поэтому API получает в
  `X-Forwarded-For` ровно один адрес клиента. Хоп Cloudflare срезается nginx, а не API, поэтому
  `TRUST_PROXY` остаётся `1`; увеличивать до `2` не нужно и вредно (клиент сможет влиять на адрес).
- Нельзя доверять `CF-Connecting-IP` без `set_real_ip_from`: заголовок подделывается любым клиентом, который
  обращается к origin напрямую. Поэтому обязательна пара «real_ip + файрвол origin».
- Не использовать `set_real_ip_from 0.0.0.0/0` и `::/0`.

## 3. Диапазоны Cloudflare

Источник: https://www.cloudflare.com/ips-v4 и https://www.cloudflare.com/ips-v6. Получено 2026-11-16
(публичное чтение, без авторизации). Это снимок: перед включением обязательно получить актуальный список
(раздел 5) и сверить с ним.

IPv4:

```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

IPv6:

```
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32
```

## 4. Конфигурация nginx

Отдельный файл `/etc/nginx/snippets/cloudflare-real-ip.conf` (путь примерный), подключаемый в контекст `http`
(или в каждый `server` для twomc.su и api.twomc.su):

```nginx
# Источник: https://www.cloudflare.com/ips-v4 и ips-v6 (снимок 2026-11-16)
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

Остальные директивы (`proxy_set_header X-Real-IP $remote_addr;`, `X-Forwarded-For $remote_addr`) не менять.
Блок в `infrastructure/nginx.twomc.su.conf.example` остаётся закомментированным до решения владельца.

## 5. Обновление диапазонов

Cloudflare редко меняет список, но меняет. Процедура (раз в квартал и перед включением):

```bash
set -euo pipefail
d=$(mktemp -d)
curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4 -o "$d/v4"
curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6 -o "$d/v6"
cat "$d/v4" <(echo) "$d/v6" | sed '/^$/d' > "$d/all"
# Формат: каждая строка - CIDR, ничего другого; и список не пуст
if grep -Evq '^[0-9a-fA-F:.]+/[0-9]+$' "$d/all" || [ ! -s "$d/all" ]; then echo "неожиданный формат"; exit 1; fi
{
  echo "# Источник: https://www.cloudflare.com/ips-v4 и ips-v6, получено $(date +%F)"
  sed 's#^\(.*\)$#set_real_ip_from \1;#' "$d/all"
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} > "$d/cloudflare-real-ip.conf"
diff -u /etc/nginx/snippets/cloudflare-real-ip.conf "$d/cloudflare-real-ip.conf" || true   # просмотреть различия
```

Затем: сохранить копию текущего файла, заменить, `nginx -t`, при успехе `nginx -s reload`; те же изменения
внести в правила файрвола (раздел 6) и повторить проверки раздела 7. Если сеть недоступна, список не обновлять и
не править по памяти: оставить предыдущий снимок и повторить позже. Если актуальный список получить нельзя,
включение откладывается.

## 6. Файрвол origin

Рекомендация: после включения Cloudflare принимать на origin 80/443 ТОЛЬКО с диапазонов Cloudflare, иначе
`CF-Connecting-IP` и защита Cloudflare обходятся прямым обращением к origin. Перед изменением правил убедиться
в рабочем SSH-доступе из второго сеанса и иметь консоль провайдера (защита от самоблокировки).

### ufw

```bash
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6); do
  [ -n "$ip" ] && sudo ufw allow proto tcp from "$ip" to any port 80,443 comment 'cloudflare'
done
# Только после проверки, что путь через Cloudflare работает:
sudo ufw delete allow 80/tcp 2>/dev/null || true
sudo ufw delete allow 443/tcp 2>/dev/null || true
sudo ufw status numbered
```

### nftables (фрагмент)

```nft
table inet filter {
  set cf4 { type ipv4_addr; flags interval; elements = { 173.245.48.0/20, 103.21.244.0/22, 103.22.200.0/22,
    103.31.4.0/22, 141.101.64.0/18, 108.162.192.0/18, 190.93.240.0/20, 188.114.96.0/20, 197.234.240.0/22,
    198.41.128.0/17, 162.158.0.0/15, 104.16.0.0/13, 104.24.0.0/14, 172.64.0.0/13, 131.0.72.0/22 } }
  set cf6 { type ipv6_addr; flags interval; elements = { 2400:cb00::/32, 2606:4700::/32, 2803:f800::/32,
    2405:b500::/32, 2405:8100::/32, 2a06:98c0::/29, 2c0f:f248::/32 } }
  chain input {
    # ... остальные правила (established/related, loopback, SSH) выше ...
    tcp dport { 80, 443 } ip saddr @cf4 accept
    tcp dport { 80, 443 } ip6 saddr @cf6 accept
    tcp dport { 80, 443 } drop
  }
}
```

Docker не подчиняется INPUT для опубликованных портов (трафик идёт через FORWARD/DOCKER-USER). Порты api/web
публикуются на 127.0.0.1, наружу слушает только nginx на хосте, поэтому INPUT достаточно; если nginx переедет в
контейнер, правила ставить в `DOCKER-USER`.

### SSH

- Порт 22 не открывать всему миру: `ufw allow from <адрес администратора> to any port 22` (или VPN/bastion).
- Вход только по ключам (`PasswordAuthentication no`, `PermitRootLogin no`), fail2ban по желанию.
- Адреса администраторов в репозиторий не записывать.

### Authenticated Origin Pulls (опционально)

Файрвол по IP защищает от прямого обращения, а Authenticated Origin Pulls проверяет, что TLS-клиент - именно
ваша зона Cloudflare. Включается в панели Cloudflare (SSL/TLS, Origin Server); на nginx добавляется
`ssl_client_certificate /etc/nginx/cloudflare-origin-pull-ca.pem; ssl_verify_client on;`. Сертификат CA брать только
из документации Cloudflare; режим SSL в Cloudflare - Full (strict). Включать после файрвола отдельным шагом;
откат: `ssl_verify_client off;` и reload.

## 7. Проверка после включения

Адреса подставляет оператор; в репозиторий и отчёты их не записывать.

1. Конфигурация и доверенные диапазоны:
   ```bash
   sudo nginx -t
   sudo nginx -T 2>/dev/null | grep -c '^\s*set_real_ip_from'   # 22 для снимка 2026-11-16
   sudo nginx -T 2>/dev/null | grep -E 'real_ip_header|real_ip_recursive'
   ```
2. Временно добавить в лог nginx `$remote_addr` и `$http_cf_connecting_ip`, сделать запрос через Cloudflare и
   убедиться, что `$remote_addr` равен вашему внешнему IP (`curl -fsS https://api.ipify.org`), а не адресу Cloudflare:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://api.twomc.su/health   # путь health уточнить по API
   sudo tail -n 5 /var/log/nginx/access.log
   ```
3. Подделка заголовков через Cloudflare не меняет адрес (Cloudflare перезаписывает `CF-Connecting-IP`):
   ```bash
   curl -sS -H 'CF-Connecting-IP: 203.0.113.9' -H 'X-Forwarded-For: 203.0.113.9' https://api.twomc.su/health -o /dev/null
   sudo tail -n 1 /var/log/nginx/access.log   # в $remote_addr НЕ 203.0.113.9
   ```
4. Прямое обращение к origin мимо Cloudflare отбрасывается файрволом (с машины вне списка Cloudflare):
   ```bash
   curl -sS -m 8 -o /dev/null -w '%{http_code}\n' --resolve api.twomc.su:443:<ORIGIN_IP> https://api.twomc.su/health   # ожидается таймаут или отказ
   ```
5. API: вход тестовым пользователем; `lastLoginIp` и сессия содержат внешний IP клиента, а не адрес Cloudflare
   или nginx (проверка под оператором; ПДн не копировать).
6. Изоляция brute-force: неудачные попытки с одного адреса не блокируют вход с другого.

## 8. Откат

1. Убрать `include` сниппета `cloudflare-real-ip.conf` (или закомментировать), затем
   `sudo nginx -t && sudo nginx -s reload`. `$remote_addr` снова адрес соединения; `TRUST_PROXY=1` менять не нужно.
2. Если Cloudflare отключён (DNS напрямую на origin): вернуть 80/443 «всем» (`sudo ufw allow 80,443/tcp`) и удалить
   правила с комментарием `cloudflare` (`sudo ufw status numbered`).
3. Authenticated Origin Pulls: `ssl_verify_client off;`, reload.
4. Если весь трафик выглядит «одним адресом»: проверить, что запрос идёт через Cloudflare (оранжевое облако) и
   диапазоны актуальны (раздел 5).

## 9. Риски

- Устаревший список диапазонов: легитимный трафик отбрасывается файрволом или `real_ip` перестаёт срабатывать.
  Митигация: плановая проверка по разделу 5.
- Незакрытый origin: любой клиент подделывает `CF-Connecting-IP` и обходит лимиты. Нельзя включать `real_ip` без файрвола.
- Самоблокировка по SSH при правке файрвола: второй сеанс и консоль провайдера.
