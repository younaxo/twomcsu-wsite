# Runbook: тестовый стенд основного сайта (test-website.twomc.su)

Назначение: закрытый стенд основного сайта на отдельном VDS с тестовыми данными и мок-платежами. Это НЕ production и НЕ dev.twomc.su. Розыгрыш (giveaway.twomc.su) на этом сервере не размещён и не настраивался; неизвестные Host (в том числе giveaway) закрыты default_server.
Команда владельца на создание стенда: 2026-11-23. VDS переустановлен владельцем с нуля 2026-11-23 (Ubuntu 24.04.4); прежнего стенда нет, всё развёрнуто заново скриптами из `infrastructure/test-website/`. Артефакты: `infrastructure/test-website/`. В документе нет значений секретов, только пути.

## 1. Что стоит на сервере

| Что                                         | Значение                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VDS | 31.76.77.45, Ubuntu 24.04.4 LTS (переустановка 2026-11-23), 6 vCPU, 15 ГБ RAM, диск 197 ГБ |
| Пользователь                                | `twomc` (группа sudo, NOPASSWD через `/etc/sudoers.d/90-twomc`, проверено `visudo -cf`), вход только по ключу                                                                                                               |
| Ключ владельца                              | `~/.ssh/twomc_giveaway_vds` (приватный ключ нигде не копируется); `authorized_keys` у `twomc` и у root один и тот же                                                                                                        |
| SSH                                         | `/etc/ssh/sshd_config.d/00-twomc-hardening.conf`: `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`                                                                                      |
| Host key (проверять при первом подключении) | ED25519 `SHA256:vToFfPnb3dry/ALQltOu4TnTCesoN7WYi0F9edsCa6g`; RSA `SHA256:M+IiNYZ2cWIgN6VjUaTQqMT8IiriiBDw3kgNWlPMHSo`; ECDSA `SHA256:j+kdZ2uWrGnoWngc/zr/Xs4gObJh0GKu+Hh//Spz0nM` (после переустановки 2026-11-23; прежние отпечатки недействительны)                                          |
| Firewall                                    | ufw: deny incoming; allow OpenSSH, 80/tcp, 443/tcp (IPv4 и IPv6)                                                                                                                                                            |
| fail2ban                                    | jail `sshd` (ignoreip: loopback и IP оператора из OWNER_IP, 10 попыток / 10 мин, бан 10 минут, без aggressive) и `nginx-http-auth` (8 попыток / 10 мин, бан 10 минут). Запасной выход при бане своего IP: консоль провайдера, `sudo fail2ban-client unban <ip>` (раздел 7) |
| Время                                       | chrony, часовой пояс UTC; unattended-upgrades (security) включены                                                                                                                                                           |
| Docker                                      | docker-ce из официального репозитория, compose-плагин; пользователь `twomc` в группе docker                                                                                                                                 |
| nginx / certbot                             | nginx 1.24 (пакет Ubuntu), certbot 2.9 (+ python3-certbot-nginx; сертификат выпущен через webroot), таймер продления systemd                                                                                                |
| Каталог стенда                              | `/srv/twomc-stand/` (`ops/` - скрипты, `releases/<sha>/` - код релиза, `stand.env` 600, `gate.token` 600, `.release`, `.release.prev`, `deploy.log`)                                                                        |
| Секреты                                     | `/srv/twomc-stand/stand.env` (генерирует `gen-env.sh`, bootstrap-пароли stand_owner / stand_curator внутри), `/home/twomc/test-website-basic-auth.txt` (600, формат `user:password`), `/etc/nginx/stand.htpasswd`           |
| Контейнеры (проект `twomc-stand`)           | `twomc-stand-postgres` (127.0.0.1:55432), `twomc-stand-redis` (только внутренняя сеть), `twomc-stand-api` (127.0.0.1:4000), `twomc-stand-web` (127.0.0.1:3000)                                                              |
| nginx                                       | `/etc/nginx/conf.d/00-default-reject.conf` (default_server), `/etc/nginx/conf.d/stand.conf` (640, содержит токен пропуска)                                                                                                  |

Наружу открыты только 22, 80, 443. Postgres слушает только loopback (нужно для честного guard демо-сида), Redis не опубликован.

### Создание пользователя и закрытие root (порядок защиты от самоблокировки)

1. `ssh -i <ключ> -o BatchMode=yes -o StrictHostKeyChecking=accept-new <начальный-пользователь>@31.76.77.45 (на свежей Ubuntu 24.04; после hardening root закрыт, дальше только `twomc`)`; сверить отпечаток host key с таблицей выше.
2. От root: `adduser --disabled-password --gecos "" twomc`, `usermod -aG sudo twomc`, `install -d -m 700 -o twomc -g twomc /home/twomc/.ssh`, `install -m 600 -o twomc -g twomc /root/.ssh/authorized_keys /home/twomc/.ssh/authorized_keys`, строка `twomc ALL=(ALL) NOPASSWD:ALL` в `/etc/sudoers.d/90-twomc` (440) и `visudo -cf`.
3. ПРОВЕРИТЬ в новом сеансе: `ssh -i <ключ> twomc@31.76.77.45 'sudo -n true'`. Скрипт сам до закрытия root/пароля проверяет EUID != 0, непустой `authorized_keys` и `sudo -n true`, после правки sshd сверяет `sshd -T`, порт SSH для ufw берёт из `sshd -T`. Только после этого запускать `infrastructure/test-website/bootstrap-server.sh` (drop-in sshd, `sshd -t`, reload, ufw: OpenSSH раньше enable, fail2ban, chrony, Docker, nginx, certbot).
4. Проверить, что вход `twomc` работает, а root отклоняется (`Permission denied (publickey)`).

## 2. Схема стенда и осознанные решения

- Режим API `NODE_ENV=development`. Причина: по `production-env-checklist.md` и `env.validation.ts` (ADR-0187) в production `PAYMENT_PROVIDER` допускает только пустое значение, мок (`test`) разрешён лишь при явном `development`/`test`; демо-сид (`db:seed:demo`) требует ровно `development`. Код и guard не менялись и не обходятся. Следствие: на стенде действуют dev-ослабления (Turnstile можно выключить, `COOKIE_DOMAIN=localhost` = host-only); 2FA персонала при этом принуждается: admin API без 2FA отвечает 403 `admin_2fa_required`. Стенд закрыт basic auth и содержит только тестовые данные. Образ web собирается как production (Next.js standalone).
- 2FA и коды подтверждения: 2FA персонала на стенде принуждается (admin API требует её: `admin_2fa_required`), то есть Q22 («2FA для админов обязательна всегда») на стенде действует; production-режим проверяется отдельно. Почта не настроена: коды подтверждения (регистрация, сброс пароля) пишутся в лог API, поэтому логи `docker logs twomc-stand-api` чувствительны: не копировать их в чаты и тикеты. `AUTH_TEST_OTP_ENABLED=true` на стенде запрещён: `deploy-stand.sh` и `verify.sh` отказывают, если оно включено в `stand.env`.
- Платежи: `PAYMENT_PROVIDER=test` (мок, без ключей), `PAYMENT_WEBHOOK_SECRET` сгенерирован на сервере, возвраты выкл., выдача на игровые серверы не включена (`STORE_DELIVERY_ENABLED` не задан), Bridge, LiteBans, Giveaway выкл., `QUICK_BUY_ENABLED=false`.
- Turnstile: проверка выключена (`TURNSTILE_DISABLED=true`, допустимо только вне production); в web вшит публичный тестовый site key Cloudflare `1x00000000000000000000AA` (не секрет).
- Почта: `SMTP_HOST` не задан, письма пишутся только в лог API.
- Один origin: web на `/`, API на `/api/` (nginx срезает префикс). Причина: отдельного DNS-имени для API нет (`api.test-website.twomc.su` не резолвится). Realtime (чат, ЛС, уведомления): с PR #241 клиент подключается через `realtimeTarget` — origin в URL, префикс в `path` (`/api/socket.io`); nginx срезает `/api` и пропускает Upgrade. Проверено 28.11 на релизе 6c2d5e04: handshake socket.io на `/notifications` через `/api/socket.io` успешен (websocket и polling с апгрейдом). Ранее (до #241) realtime на стенде не работал.
- Basic auth и API: приложение шлёт `Authorization: Bearer`, который затирает кэшированный basic. Поэтому после успешного basic auth nginx выдаёт cookie `__Host-stand_gate` (HttpOnly, Secure, SameSite=Lax, 12 часов); с cookie basic не запрашивается. Cookie выдаётся только на успешные ответы (не на 401). SSR web ходит на публичный URL API изнутри docker-сети; такие запросы (172.16.0.0/12, 127.0.0.1) пропускаются по адресу источника. Заголовок Basic к приложению не пробрасывается, а cookie-пропуск вырезается из заголовка Cookie перед proxy_pass (приложение его не видит). Префикс `__Host-` запрещает Domain и требует Secure и Path=/.
- noindex: `/robots.txt` отдаёт `User-agent: *` / `Disallow: /` (без basic auth, чтобы краулер увидел правило) и заголовок `X-Robots-Tag: noindex, nofollow` на всех ответах, включая 401.
- Неизвестные Host: :80 - `return 444`, :443 - `ssl_reject_handshake on` (рукопожатие отклоняется, сертификат не нужен). giveaway.twomc.su резолвится на этот IP, но намеренно закрыт.
- Сертификат выпущен без e-mail (`--register-unsafely-without-email`): адрес владельца внешнему сервису не передавался. Уведомления об истечении не придут; продление автоматическое (таймер certbot и deploy-hook перезагрузки nginx). Проверка: `sudo certbot renew --dry-run`.

## 3. Деплой и обновление

### Повторяемая выкладка одной командой

Локально (Docker не нужен, git-токен на сервер не передаётся, ключ SSH `~/.ssh/twomc_giveaway_vds`, пользователь `twomc`, не root):

```sh
infrastructure/test-website/release.sh [ref] [--seed]   # ref по умолчанию origin/main
```

`release.sh` = `git fetch` + `git archive` + ОДИН SSH-сеанс (tar по stdin, без scp): распаковка релиза и ops-файлов -> `deploy-stand.sh` -> `seed-demo.sh` (только с `--seed`) -> `verify.sh`. Шаги идут на сервере в фоне с логом `/srv/twomc-stand/release.log` и статусом `/srv/twomc-stand/.release.status`: обрыв SSH сборку не прерывает; повторный запуск не наложится на идущий деплой (`flock`). Переменные: `STAND_HOST`, `STAND_USER`, `STAND_SSH_KEY`, `STAND_ROOT` (только `/srv/twomc-stand*`). SSH всегда с `IdentitiesOnly=yes` и `BatchMode=yes`; не запускать параллельные подключения (fail2ban банит по числу неудачных входов, см. раздел 7).

Только выгрузка без сборки: `infrastructure/test-website/push-release.sh [ref]`.

Первичная установка по шагам (на сервере):

```sh
/srv/twomc-stand/ops/gen-env.sh                         # один раз; существующий stand.env не перезаписывается
/srv/twomc-stand/ops/setup-nginx.sh                     # один раз: htpasswd, токен, default_server, certbot, nginx
nohup /srv/twomc-stand/ops/deploy-stand.sh <sha12> > /srv/twomc-stand/deploy.log 2>&1 &
/srv/twomc-stand/ops/seed-demo.sh                       # роли, bootstrap-аккаунты, демо-данные (идемпотентно)
/srv/twomc-stand/ops/verify.sh                          # проверки
```

`deploy-stand.sh`: проверка RAM/диска и прав `stand.env` -> `docker compose config --quiet` -> сборка api и web -> образ tools (стадия build Dockerfile: ts-node, prisma CLI) -> postgres+redis -> `prisma migrate deploy` в БД стенда (сеть compose, `postgres:5432`) -> api+web -> health. Миграции выполняются только на БД этого VDS.

Демо-сид: контейнер tools запускается с `--network host` и `DATABASE_URL=...@127.0.0.1:55432`, `NODE_ENV=development`, `SEED_DEMO=1`: все условия guard выполняются честно, `guard.ts` не менялся.

Данные для входа в приложение: пользователи `stand_owner` и `stand_curator` (alias `standcurator`), пароли в `/srv/twomc-stand/stand.env` (`BOOTSTRAP_*_PASSWORD`). Basic auth: `/home/twomc/test-website-basic-auth.txt`. Читать на сервере, в чаты и тикеты не копировать.

## 4. Проверки (воспроизводимые)

`/srv/twomc-stand/ops/verify.sh` на сервере; вручную (без печати паролей):

```sh
dig +short test-website.twomc.su @1.1.1.1                      # с сервера: 31.76.77.45
curl -sI https://test-website.twomc.su                          # 401 без auth
printf 'user = "%s"\n' "$(grep -v '^Устарело' ~/test-website-basic-auth.txt)" | curl -K - -sI https://test-website.twomc.su   # 200 + X-Robots-Tag
curl -s https://test-website.twomc.su/robots.txt                # Disallow: /
printf 'user = "%s"\n' "$(grep -v '^Устарело' ~/test-website-basic-auth.txt)" | curl -K - -s https://test-website.twomc.su/api/health
curl -sI http://test-website.twomc.su                           # 301 на https
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.example.invalid' http://127.0.0.1/   # 000 (444)
sudo ufw status verbose; sudo fail2ban-client status sshd; timedatectl
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'
ssh -i <ключ> -o BatchMode=yes root@31.76.77.45 true            # Permission denied (publickey)
```

Локальный DNS подменяется прокси (198.18.x), поэтому DNS проверяется только с сервера.

## 5. Перенос на twomc.su (позже)

Всё, что зависит от домена, берётся из `STAND_DOMAIN` (env), а не из кода:

| Где                                                               | Источник                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| nginx `server_name`, пути сертификата                             | `STAND_DOMAIN` при `setup-nginx.sh` (envsubst)                                                              |
| `WEB_ORIGIN`, `WEB_ORIGINS` (CORS), `FRONTEND_URL`, `PUBLIC_URL`  | `stand.env`, выводятся из `STAND_DOMAIN`                                                                    |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_BASE_URL`, `CDN_BASE_URL` | `stand.env`; NEXT_PUBLIC вшиваются при СБОРКЕ web, поэтому после смены нужна пересборка (`deploy-stand.sh`) |
| Cookie                                                            | `COOKIE_DOMAIN` из env: `localhost` = host-only; для production `.twomc.su`                                 |

Порядок: 1) DNS twomc.su на этот IP (решение владельца), 2) `STAND_DOMAIN=twomc.su`, новый `stand.env` (или правка доменных ключей) 3) `setup-nginx.sh` (новый сертификат), 4) пересборка web, 5) при переходе на боевой режим: `NODE_ENV=production`, реальный Turnstile, `COOKIE_DOMAIN=.twomc.su`, чек-лист `production-env-checklist.md`, пустой `PAYMENT_PROVIDER` до адаптера 0.8b, отдельное решение владельца, убрать basic auth/noindex и мок-данные. Эти шаги не входят в стенд.

## 6. Известные ограничения и места с зашитым доменом

Правки продуктового кода не делались. Для переноса или улучшения стенда понадобятся решения по коду:

- `apps/web/src/lib/env.ts:12` - `NEXT_PUBLIC_SITE_URL` по умолчанию `https://twomc.su`; `infrastructure/web.Dockerfile` и `docker-compose.prod.yml` не передают её как build-arg, поэтому canonical/OG/sitemap на стенде указывают на twomc.su (стенд под noindex, вреда нет; для переноса нужен ARG в Dockerfile и compose).
- `apps/web/src/lib/env.ts:16` - `MAIN_SITE_URL` по умолчанию `https://twomc.su` (только режим GIVEAWAY_ONLY).
- `apps/web/src/lib/env.ts:21`, `infrastructure/web.Dockerfile:27`, `infrastructure/docker-compose.prod.yml:98` - CDN по умолчанию `https://cdn-files.twomc.su` (на стенде переопределён через env).
- `apps/web/next.config.mjs:56` - `remotePatterns` next/image разрешает только `cdn-files.twomc.su`: загруженные на стенде картинки (`/api/uploads/...`) через `next/image` не оптимизируются.
- `apps/api/src/modules/store/product-image-url.ts:8` - белый список хостов картинок товаров: только `cdn-files.twomc.su`.
- `apps/api/src/modules/news/news.service.ts:120,121,131` - RSS-ссылки `https://twomc.su/news/...` зашиты (на стенде ведут на production).
- `apps/api/src/config/env.validation.ts:187,210,215,221` - дефолты `twomc.su` для SMTP/status page/VAPID (письма на стенде не отправляются).
- `apps/web/src/lib/admin/store-products.ts:251` - белый список хостов картинок в админке (`cdn-files.twomc.su`); `apps/api/src/common/site-image.ts:8` - текст ошибки; `apps/api/prisma/seed/bootstrap.ts:40` - e-mail системного аккаунта по умолчанию `system@twomc.su` (переопределяется `BOOTSTRAP_SYSTEM_EMAIL`).- Брендовые тексты `twomc.su` (не конфигурация, при переносе на другой домен остаются): `apps/api/src/modules/auth/{auth,registration,social-auth}.service.ts`, `two-factor.service.ts:30` (`TWO_FACTOR_ISSUER`), `favicon.service.ts:202` (user-agent), `notifications.service.ts:424`, множество строк UI в `apps/web/src/components/`.
- Realtime: исправлено в PR #241 (`apps/web/src/lib/realtime.ts`), отдельный хост API больше не обязателен. При переносе на twomc.su с API на поддомене `path` остаётся `/socket.io` автоматически.

Cookie и CORS жёстко не зашиты: `refresh-cookie.ts` берёт `COOKIE_DOMAIN` из env, CORS - из `WEB_ORIGIN`/`WEB_ORIGINS`.

## 7. Откат и обслуживание

- Образы: теги `twomc-stand-api|web:<sha12>`; откат образов - `deploy-stand.sh <предыдущий sha>` (каталог релиза остаётся в `releases/`, предыдущий sha в `.release.prev`). Схема БД не откатывается.
- Остановить стенд: `docker compose -p twomc-stand --env-file /srv/twomc-stand/stand.env -f <релиз>/infrastructure/docker-compose.prod.yml -f /srv/twomc-stand/ops/docker-compose.stand.yml stop api web`.
- Закрыть стенд от интернета мгновенно: `sudo rm /etc/nginx/conf.d/stand.conf && sudo nginx -s reload` (останется default_server 444) или `sudo ufw deny 443/tcp` (после проверки SSH-доступа).
- Полный снос стенда (только по решению владельца; данные тестовые): `docker compose -p twomc-stand ... down -v`, удалить `/srv/twomc-stand`, `/etc/nginx/conf.d/stand.conf`, `/etc/nginx/stand.htpasswd`, `certbot delete --cert-name test-website.twomc.su`.
- Ротация basic auth: `setup-nginx.sh --rotate` (раздел 9; старые файлы сохраняются, не удаляются); ротация токена пропуска (cookie `__Host-stand_gate`): `rm /srv/twomc-stand/gate.token`, снова `setup-nginx.sh` (перегенерирует токен и `stand.conf`, nginx перечитает); старые cookie перестанут действовать, все получат basic-запрос заново. Ротировать при подозрении на утечку cookie или заголовка Cookie.
- Бан своего IP (fail2ban): через консоль/VNC провайдера выполнить `sudo fail2ban-client status sshd` и `sudo fail2ban-client unban <ip>` (или подождать 10 минут). Профиль мягкий (sshd: 10 попыток за 10 мин, бан 10 мин). Проверки входа выполнять по одной, root-вход не пробовать: он закрыт и только набирает штрафные попытки.
- Ротация секретов приложения: пароль Postgres/Redis записан в томах при инициализации, менять только вместе с томами (`down -v`); `gen-env.sh` намеренно не перезаписывает `stand.env`.
- Диск: `docker builder prune` и удаление старых тегов образов - вручную и осознанно; перед крупными работами владельцу - снимок диска в панели хостинга.
- Журналы: `docker logs --tail=100 twomc-stand-api`, `/var/log/nginx/`, `/var/log/letsencrypt/`.

## Заметки о развёртывании 2026-11-23 (после переустановки)

- Учётки стенда: `/home/twomc/test-website-accounts.txt` (600): игрок `stand_player2` (обычная регистрация, код из лога API, так как SMTP не задан) и админ `stand_owner` (BOOTSTRAP_OWNER, роль Owner, включая `store.bundles.view`) с включённой 2FA (TOTP-секрет и резервные коды в том же файле). Без 2FA админ-API отвечает 403 `admin_2fa_required`.
- Для демо-покупки у игрока должен быть привязанный Minecraft-ник (`minecraft_accounts`); на стенде добавлена строка `StandPlayer` для `stand_player2` (SQL в БД стенда).
- Тестовая оплата: заказ создаётся PENDING, затем подписанный HMAC вебхук `POST /api/webhooks/payments/test` (заголовки `x-twomc-timestamp`, `x-twomc-signature`, секрет PAYMENT_WEBHOOK_SECRET из stand.env) переводит его в COMPLETED. Выдача на игровой сервер не выполняется (сервера нет).
- Cookie `two_factor_challenge` с `Path=/auth` не доходила до `/api/auth/login/2fa`: исправлено правилом `proxy_cookie_path` (раздел 8).

## 8. Cookie API с Path=/auth под префиксом /api (дефект Q105, исправлен)

- Симптом: шаг 2FA админа показывал «время истекло». API ставит `two_factor_challenge` (и `social_nonce`, `social_pkce` при входе через соцсети) с `Path=/auth` (`apps/api/src/modules/auth/refresh-cookie.ts`, `social-auth.controller.ts`). На стенде API проксируется под `/api/` с срезанием префикса, поэтому браузер не отправлял эти cookie на `/api/auth/login/2fa`.
- Правило: в `location /api/` шаблона `nginx.stand.conf.template` задано `proxy_cookie_path /auth /api/auth;`. Оно переписывает Path у любого Set-Cookie, включая `clearCookie` (тот же Path), и не затрагивает refresh-cookie с `Path=/`.
- Перенос на twomc.su: правило нужно ТОЛЬКО если API остаётся под префиксом (`/api`) на том же хосте. Production-пример `infrastructure/nginx.twomc.su.conf.example` отдаёт API на `api.twomc.su` без префикса, там правило не нужно и дефекта нет.
- Проверка: браузерный вход `stand_owner` с TOTP на шаге 2FA (Playwright, headless Chromium), затем открытие `/admin/store/products`. curl для этого дефекта недостаточен.

## 9. Учётные данные: правила

- Окончательный файл учётных данных стенда: `/home/twomc/test-website-credentials.txt` (владелец `twomc`, 600). Скрипты из `infrastructure/test-website/` его НЕ пишут и не изменяют; `verify.sh` только проверяет права (чтение).
- Прежние `/home/twomc/test-website-basic-auth.txt` и `/home/twomc/test-website-accounts.txt` не удаляются, помечены как устаревшие.
- Защита от перезаписи: `setup-nginx.sh` создаёт basic auth и htpasswd только при первом запуске (если нет ни файла, ни htpasswd); существующие не меняются. Ротация только явно: `setup-nginx.sh --rotate` (старые файлы сохраняются как `*.bak.<время>`, окончательный файл обновляется вручную). `gen-env.sh` не перезаписывает существующий `stand.env`.
- Раздел 7 «Ротация basic auth» (удалить файлы и перезапустить) заменён этим флагом.

## Дымовая проверка стенда (smoke)

```bash
infrastructure/test-website/run-smoke.sh      # один SSH-сеанс под общей блокировкой VDS; скрипты едут по stdin
```
`smoke.sh` запускает `smoke.mjs` в одноразовом контейнере из api-образа текущего релиза стенда (`--network host`, uid владельца файлов; `stand.env` и файл учёток монтируются только для чтения). Проверяются каталог, корзина, оформление,
подписанный вебхук мок-провайдера, вход игрока и админа с 2FA (TOTP), публичные разделы и админ-API; web-страницы - по коду ответа (не браузерная проверка). Код возврата 0 - все пункты РАБОТАЕТ.
Секреты не печатаются: любой вывод `smoke.mjs` (включая необработанные ошибки) проходит через `mask()` (значения паролей, ключей, токенов, TOTP-секрета и резервных кодов, JWT, Bearer, пароли в URL, otpauth://).
Самопроверка маскирования без сети: `SMOKE_SELFTEST_MASK=1 node infrastructure/test-website/smoke.mjs` (входит в `infrastructure/vds-runner/tests/selftest.sh`, T5). Файлы учёток и `stand.env` на сервере не читать и не выводить (`cat`/`grep`/`head` запрещены).
Песочница контейнера смоука: `--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` (+ tmpfs `/tmp`), `--memory 256m`, `--cpus 1`, `--pids-limit 128`, тайм-аут 300 с (`SMOKE_TIMEOUT_SEC`); монтируются только `smoke.mjs`, `stand.env` и файл учёток (все `:ro`).
Файл учёток по умолчанию - окончательный `/home/twomc/test-website-credentials.txt` (раздел 9; `ACCOUNTS_FILE` переопределяет); перед запуском `smoke.sh` проверяет `[[ -f ]]` для `stand.env` и файла учёток (иначе `docker -v` создал бы на их месте каталог) и завершается кодом 2.
Побочный эффект: смоук делает `DELETE /store/cart` для тестового игрока (очищает его корзину перед проверкой), включает флаги `stats.public.enabled` и `punishments.public.enabled` и создаёт заказ тестового игрока.
Имена дополнены `pwd|credential|session|sid`; YAML без кавычек (`password: my secret phrase`) и CLI-флаги (`--password X`) маскируются до конца строки. Не маскируются счётчики `passed: 12`, `keys: 3` и текст `Basic auth ok` (Basic/Digest/Negotiate/NTLM - только токен от 8 знаков). Допустимые ложные срабатывания: `sid` режет `inside: ...`/`side: ...`; `session` - `Session: expired`; `pwd: /путь`; `--session-timeout 30 ...` теряет остаток строки. Известный пропуск: Basic-токен короче 8 знаков вне заголовка Authorization. Селфтест теперь 48 проб утечки и 6 негативных.
Маска вывода режет значения полей по подстрокам ИМЁН (`pass|secret|token|key|otp`, без учёта регистра): `"userPassword":"..."`, `"apiKey":"..."`, `refresh_token=...`, `Api-Key=...`, а также `Authorization: Basic ...` (значения от 4 символов). Селфтест: `SMOKE_SELFTEST_MASK=1 node infrastructure/test-website/smoke.mjs` (12 проб).

## Визуальная проверка в браузере

```bash
infrastructure/test-website/run-visual.sh /srv/twomc-stand/qa/visual-<дата>          # прогон на VDS (около 6 мин)
infrastructure/test-website/run-visual.sh --fetch /srv/twomc-stand/qa/visual-<дата> <локальный-каталог>   # забрать скриншоты и results.json
```
Одноразовый контейнер `mcr.microsoft.com/playwright:v1.49.1-jammy` (`PW_VERSION`), headless Chromium, `--cap-drop ALL`, `--read-only`, 3 ГБ, 1500 с. Вход игрока и админа (с TOTP) через форму `/login`; учётки читаются из окончательного файла (только `:ro`), в вывод не попадают (`mask()`). Ширины 360, 390, 1280; для каждой пары страница x ширина: статус, горизонтальный скролл, цели < 40x40 (на мобильных, первые 10), ошибки консоли, неудачные ответы, полноэкранный скриншот. Побочный эффект: корзина игрока очищается и в неё кладётся первый товар. Откат: ничего не меняет в коде и данных стенда, кроме корзины и ещё двух входов; каталог результатов можно удалить вручную.
Откат: смоук ничего не меняет в коде стенда; он включает флаги `stats.public.enabled` и `punishments.public.enabled` и создаёт заказ тестового игрока (одноразовая проверка на тестовых данных).

## Ротация 2FA стенда — инструкция владельцу

Когда: TOTP-секрет или резервные коды админа стенда (`stand_owner`) попали в чужой контекст (R173, Q113) или по плановой смене. Выполняет только владелец; агенты команду не запускают.

Команда (одна, с локальной машины, как `run-smoke.sh`: один SSH-сеанс под общей блокировкой VDS, скрипты едут по stdin):

```bash
infrastructure/test-website/run-rotate-2fa.sh --dry-run   # сначала: только план, ничего не меняется
infrastructure/test-website/run-rotate-2fa.sh --yes       # сама ротация
```

Что произойдёт на сервере (`rotate-2fa.sh`, от пользователя `twomc`, только при `STAND_ROOT=/srv/twomc-stand`):
1. В одноразовом контейнере `twomc-stand-tools` генерируются новый TOTP-секрет и 10 резервных кодов. Секрет шифруется, коды хешируются кодом API (`SecretBox`, `TWO_FACTOR_ENCRYPTION_KEY` из `stand.env`), формат тот же, что при обычном включении 2FA.
2. В БД одной транзакцией: новый секрет, сброс `twoFactorLastStep`, удаление старых резервных кодов и запись новых, отзыв всех refresh-токенов админа (access-токен доживёт свой короткий срок). Старые секрет и коды перестают работать.
3. Копия `/home/twomc/test-website-credentials.txt.bak-<UTC>` (600), затем в файле учёток заменяется строка `admin2fa:` (файл остаётся 600). Остальные строки не меняются.
4. В вывод попадают только пути, `ok` и отпечаток (8 hex sha256 секрета). Значения не печатаются и не логируются; файл учёток владелец читает сам на сервере.

Если ник админа не `stand_owner`, задайте `ADMIN_USERNAME` (иначе берётся ник из строки `admin:` файла учёток).

Проверка входа после ротации:
1. `infrastructure/test-website/run-smoke.sh` - пункт «Вход админа с 2FA (TOTP)» должен быть РАБОТАЕТ (smoke читает новый блок из файла учёток).
2. Вручную: вход `stand_owner` на https://test-website.twomc.su, на шаге 2FA ввести код из приложения, добавив новый секрет из файла учёток; старый код приложения должен быть отклонён.

Откат: БД хранит только новый секрет, поэтому откат файла сам по себе вход не вернёт. Варианты:
- Неудачная запись в файл (БД уже новая): прежний файл в `.bak-<UTC>` содержит СТАРЫЙ блок - он не годится для входа; повторите ротацию (`--yes`) - она идемпотентна и выдаст новый блок.
- Нужен именно прежний секрет (например, он вшит в приложение-аутентификатор и ротация была ошибочной): `cp -p /home/twomc/test-website-credentials.txt.bak-<UTC> /home/twomc/test-website-credentials.txt` вернёт учётки, а секрет в БД вернёт только повторная ротация; прежний секрет в БД без SQL не восстановить, поэтому для стенда откат = «ротировать ещё раз».
- Восстановить права после ручной правки: `chmod 600 /home/twomc/test-website-credentials.txt*`.
Старые `.bak-*` содержат устаревшие секреты (уже недействительные), но владельцу всё равно стоит удалить их вручную после проверки.
