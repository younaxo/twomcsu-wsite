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
| fail2ban                                   | jail `sshd` (ignoreip: loopback и IP оператора из OWNER_IP, 10 попыток / 10 мин, бан 10 минут, без aggressive). Jail `nginx-http-auth` больше не включается (форма входа не пишет ошибок Basic Auth в error.log; защита от подбора - лимит gate, см. «Форма входа»). Запасной выход при бане своего IP: консоль провайдера, `sudo fail2ban-client unban <ip>` (раздел 7) |
| Время                                       | chrony, часовой пояс UTC; unattended-upgrades (security) включены                                                                                                                                                           |
| Docker                                      | docker-ce из официального репозитория, compose-плагин; пользователь `twomc` в группе docker                                                                                                                                 |
| nginx / certbot                             | nginx 1.24 (пакет Ubuntu), certbot 2.9 (+ python3-certbot-nginx; сертификат выпущен через webroot), таймер продления systemd                                                                                                |
| Каталог стенда                              | `/srv/twomc-stand/` (`ops/` - скрипты, `releases/<sha>/` - код релиза, `stand.env` 600, `gate.key` / `gate.pass.hash` / `gate.service.token` 600, `.release`, `.release.prev`, `deploy.log`)                                                                        |
| Секреты                                     | `/srv/twomc-stand/stand.env` (генерирует `gen-env.sh`, bootstrap-пароли stand_owner / stand_curator внутри), прежние `/home/twomc/test-website-basic-auth.txt` и `/etc/nginx/stand.htpasswd` (не используются, не удалены)         |
| Контейнеры (проект `twomc-stand`)           | `twomc-stand-postgres` (127.0.0.1:55432), `twomc-stand-redis` (только внутренняя сеть), `twomc-stand-api` (127.0.0.1:4000), `twomc-stand-web` (127.0.0.1:3000)                                                              |
| nginx                                       | `/etc/nginx/conf.d/00-default-reject.conf` (default_server), `/etc/nginx/conf.d/stand.conf` (640; секретов не содержит), контейнер `twomc-stand-gate` (127.0.0.1:4100)                                                                                                  |

Наружу открыты только 22, 80, 443. Postgres слушает только loopback (нужно для честного guard демо-сида), Redis не опубликован.

### Создание пользователя и закрытие root (порядок защиты от самоблокировки)

1. `ssh -i <ключ> -o BatchMode=yes -o StrictHostKeyChecking=accept-new <начальный-пользователь>@31.76.77.45 (на свежей Ubuntu 24.04; после hardening root закрыт, дальше только `twomc`)`; сверить отпечаток host key с таблицей выше.
2. От root: `adduser --disabled-password --gecos "" twomc`, `usermod -aG sudo twomc`, `install -d -m 700 -o twomc -g twomc /home/twomc/.ssh`, `install -m 600 -o twomc -g twomc /root/.ssh/authorized_keys /home/twomc/.ssh/authorized_keys`, строка `twomc ALL=(ALL) NOPASSWD:ALL` в `/etc/sudoers.d/90-twomc` (440) и `visudo -cf`.
3. ПРОВЕРИТЬ в новом сеансе: `ssh -i <ключ> twomc@31.76.77.45 'sudo -n true'`. Скрипт сам до закрытия root/пароля проверяет EUID != 0, непустой `authorized_keys` и `sudo -n true`, после правки sshd сверяет `sshd -T`, порт SSH для ufw берёт из `sshd -T`. Только после этого запускать `infrastructure/test-website/bootstrap-server.sh` (drop-in sshd, `sshd -t`, reload, ufw: OpenSSH раньше enable, fail2ban, chrony, Docker, nginx, certbot).
4. Проверить, что вход `twomc` работает, а root отклоняется (`Permission denied (publickey)`).

## 2. Схема стенда и осознанные решения

- Режим API `NODE_ENV=development`. Причина: по `production-env-checklist.md` и `env.validation.ts` (ADR-0187) в production `PAYMENT_PROVIDER` допускает только пустое значение, мок (`test`) разрешён лишь при явном `development`/`test`; демо-сид (`db:seed:demo`) требует ровно `development`. Код и guard не менялись и не обходятся. Следствие: на стенде действуют dev-ослабления (Turnstile можно выключить, `COOKIE_DOMAIN=localhost` = host-only); 2FA персонала при этом принуждается: admin API без 2FA отвечает 403 `admin_2fa_required`. Стенд закрыт формой входа (gate) и содержит только тестовые данные. Образ web собирается как production (Next.js standalone).
- 2FA и коды подтверждения: 2FA персонала на стенде принуждается (admin API требует её: `admin_2fa_required`), то есть Q22 («2FA для админов обязательна всегда») на стенде действует; production-режим проверяется отдельно. Почта не настроена: коды подтверждения (регистрация, сброс пароля) пишутся в лог API, поэтому логи `docker logs twomc-stand-api` чувствительны: не копировать их в чаты и тикеты. `AUTH_TEST_OTP_ENABLED=true` на стенде запрещён: `deploy-stand.sh` и `verify.sh` отказывают, если оно включено в `stand.env`.
- Платежи: `PAYMENT_PROVIDER=test` (мок, без ключей), `PAYMENT_WEBHOOK_SECRET` сгенерирован на сервере, возвраты выкл., выдача на игровые серверы не включена (`STORE_DELIVERY_ENABLED` не задан), Bridge, LiteBans, Giveaway выкл., `QUICK_BUY_ENABLED=false`.
- Turnstile: проверка выключена (`TURNSTILE_DISABLED=true`, допустимо только вне production); в web вшит публичный тестовый site key Cloudflare `1x00000000000000000000AA` (не секрет).
- Почта: `SMTP_HOST` не задан, письма пишутся только в лог API.
- Один origin: web на `/`, API на `/api/` (nginx срезает префикс). Причина: отдельного DNS-имени для API нет (`api.test-website.twomc.su` не резолвится). Realtime (чат, ЛС, уведомления): с PR #241 клиент подключается через `realtimeTarget` — origin в URL, префикс в `path` (`/api/socket.io`); nginx срезает `/api` и пропускает Upgrade. Проверено 28.11 на релизе 6c2d5e04: handshake socket.io на `/notifications` через `/api/socket.io` успешен (websocket и polling с апгрейдом). Ранее (до #241) realtime на стенде не работал.
- Защита входом (с 2026-11-27, PR feat/stand-gate-form): вместо системного окна Basic Auth - своя страница `/__stand/login` (раздел «Форма входа»). Прежняя схема (basic + статический cookie-пропуск) заменена; `stand.htpasswd` остаётся на диске и не используется. SSR web ходит на публичный URL API изнутри docker-сети; такие запросы (172.16.0.0/12, 127.0.0.1) пропускаются по адресу источника.
- noindex: `/robots.txt` отдаёт `User-agent: *` / `Disallow: /` (без входа, чтобы краулер увидел правило) и заголовок `X-Robots-Tag: noindex, nofollow` на всех ответах, включая 302 формы, форму и 401 JSON.
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
/srv/twomc-stand/ops/setup-nginx.sh                     # один раз: gate.key, хеш пароля формы, токен, контейнер gate, default_server, certbot, nginx
nohup /srv/twomc-stand/ops/deploy-stand.sh <sha12> > /srv/twomc-stand/deploy.log 2>&1 &
/srv/twomc-stand/ops/seed-demo.sh                       # роли, bootstrap-аккаунты, демо-данные (идемпотентно)
/srv/twomc-stand/ops/verify.sh                          # проверки
```

`deploy-stand.sh`: проверка RAM/диска и прав `stand.env` -> `docker compose config --quiet` -> сборка api и web -> образ tools (стадия build Dockerfile: ts-node, prisma CLI) -> postgres+redis -> `prisma migrate deploy` в БД стенда (сеть compose, `postgres:5432`) -> api+web -> health. Миграции выполняются только на БД этого VDS.

Демо-сид: контейнер tools запускается с `--network host` и `DATABASE_URL=...@127.0.0.1:55432`, `NODE_ENV=development`, `SEED_DEMO=1`: все условия guard выполняются честно, `guard.ts` не менялся.

Данные для входа в приложение: пользователи `stand_owner` и `stand_curator` (alias `standcurator`), пароли в `/srv/twomc-stand/stand.env` (`BOOTSTRAP_*_PASSWORD`). Пароль формы входа на стенд: `/home/twomc/test-website-credentials.txt`. Читать на сервере, в чаты и тикеты не копировать.

## 4. Проверки (воспроизводимые)

`/srv/twomc-stand/ops/verify.sh` на сервере; вручную (без печати паролей):

```sh
dig +short test-website.twomc.su @1.1.1.1                      # с сервера: 31.76.77.45
curl -sI https://test-website.twomc.su                          # 302 на /__stand/login без входа
printf 'header = "X-Stand-Gate: %s"\n' "$(cat /srv/twomc-stand/gate.service.token)" | curl -K - -sI https://test-website.twomc.su   # 200 + X-Robots-Tag (сервисный токен, не печатать)
curl -s https://test-website.twomc.su/robots.txt                # Disallow: /
curl -s https://test-website.twomc.su/api/health                # 200 без входа
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
- Ротация пароля формы и токена: раздел «Форма входа» ниже. Ротация токена X-Stand-Gate: `rm /srv/twomc-stand/gate.service.token`, `setup-nginx.sh` (создаст новый и пересоздаст gate); обновить токен у раннера и мониторинга.
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

- Окончательный файл учётных данных стенда: `/home/twomc/test-website-credentials.txt` (владелец `twomc`, 600). Читает только владелец/главный агент. Единственное исключение для скриптов: `setup-nginx.sh` читает пароль секции `[basic auth]` (пароль формы входа) и, если секции нет, ДОПИСЫВАЕТ её в конец файла; существующее содержимое не меняется. `verify.sh` читает пароль для проверки входа и права файла.
- Прежние `/home/twomc/test-website-basic-auth.txt` и `/home/twomc/test-website-accounts.txt` не удаляются, помечены как устаревшие.
- Защита от перезаписи: `setup-nginx.sh` создаёт `gate.key`, `gate.service.token`, `gate.pass.hash` только если их нет. Пароль меняется явно (раздел «Форма входа»). `gen-env.sh` не перезаписывает существующий `stand.env`.
- Раздел 7 «Ротация basic auth» заменён разделом «Форма входа».

## Форма входа на стенд (вместо Basic Auth, с 2026-11-27)

Системное окно браузера (Basic Auth) заменено страницей `https://test-website.twomc.su/__stand/login` (тёмная тема «Полдень», поле пароля, `lang=ru`, `noindex`).

**Как устроено.** nginx на каждый запрос делает `auth_request` к контейнеру `twomc-stand-gate` (`stand-gate.mjs`, node:20-alpine, только `127.0.0.1:4100`, read-only, без capabilities, `--restart unless-stopped`). Контейнер запускает `setup-nginx.sh` (вне compose-проекта релизов: переживает деплой api/web; выбран вместо systemd, так как на хосте нет node, а образ node:20-alpine уже используется стендом). Без пропуска: страницы получают 302 на `/__stand/login?next=<путь>` (только относительный путь с одним `/`, иначе `/`), `/api/*` получает 401 JSON `stand_gate_required` (не HTML). Пропуск: cookie `__Host-stand_gate` = `<срок unix>.<HMAC-SHA256 hex>`, Secure, HttpOnly, SameSite=Lax, Path=/, 7 суток; ключ `/srv/twomc-stand/gate.key` (600). Вход: `POST /__stand/login` (проверка Origin = Host, не более 10 попыток в минуту с IP, задержка 0,7 с на неудачу, scrypt + timingSafeEqual против `/srv/twomc-stand/gate.pass.hash`, 600). Cookie вырезается из `Cookie` перед передачей приложению; cookie 2FA админа (`two_factor_challenge`, `Path=/auth` -> `/api/auth` через `proxy_cookie_path`, Q105) и Set-Cookie приложения не затрагиваются. WebSocket/SSE (`/api/socket.io`) проходят с той же cookie.

**Как войти.** Открыть адрес стенда, ввести пароль. Пароль: файл `/home/twomc/test-website-credentials.txt`, секция `[basic auth]`, строка `password:` (читает только владелец или главный агент; не копировать в чаты и логи). Выход: открыть `/__stand/logout` и нажать «Выйти» (POST с проверкой Origin; простой переход по ссылке cookie не очищает), откроется форма. Срок: 7 суток, потом форма снова.

**Мимо формы** (список точных путей в `isBypass` файла `stand-gate.mjs`, под тестами):
- `/robots.txt` (отдаёт nginx), `/.well-known/acme-challenge/` (порт 80);
- `GET|HEAD /api/health`;
- `POST /api/webhooks/payments/<провайдер>` (подпись и метку времени проверяет API);
- `POST /api/voting/webhook/<slug>` мимо формы НЕ пропускается: в приложении нет подписи, метки времени и защиты от повтора, открытый маршрут позволял бы любому подделать голос. Пока это не доработано в приложении, внешние сайты голосования до стенда не достучатся (стенд для них закрыт, 401 gate); голосование проверяется только изнутри стенда или с cookie/`X-Stand-Gate`;
- приём Bridge (подпись проверяет приложение, `bridge-signature.guard`): ровно `GET /api/bridge/v1/handshake` (HEAD не пропускается: guard приложения принимает только GET), `POST /api/bridge/v1/events`, `POST /api/bridge/v1/delivery/claim`, `POST /api/bridge/v1/delivery/ack`. Точное совпадение пути без параметров-вариаций: `//`, `../`, `%2e`/`%65`, регистр, `;`, хвостовой `/`, другие методы и любой другой путь `/api/bridge/v1/*` идут через обычный gate (401 JSON). `verify.sh` проверяет: без cookie `POST events` с мусором отвечает приложение (не 302 на форму и не gate-401 `stand_gate_required`), `GET /api/bridge/v1/other` -> 401 gate;
- любой запрос с заголовком `X-Stand-Gate: <содержимое /srv/twomc-stand/gate.service.token>` (раннер, мониторинг; сравнение за постоянное время);
- запросы из docker-сети и с loopback сервера (SSR web). `smoke.mjs` ходит прямо на loopback-порты, формы не проходит; `visual-check.mjs` входит формой (пароль из секции `[basic auth]`, не печатается), `verify.sh` использует форму и токен через stdin-конфиг curl.
Примеры для раннера: `printf 'header = "X-Stand-Gate: %s"\n' "$(cat /srv/twomc-stand/gate.service.token)" | curl -K - https://test-website.twomc.su/...` (токен не печатать и не передавать в argv).

**Смена пароля.** Изменить значение `password:` в секции `[basic auth]` файла учётных данных, затем на сервере `/srv/twomc-stand/ops/setup-nginx.sh --rotate-pass` (пересчитает хеш, пересоздаст gate). Старые cookie остаются действительными до срока; чтобы сбросить все сессии: `rm /srv/twomc-stand/gate.key` и `setup-nginx.sh` (новый ключ, все выходят). Если секции `[basic auth]` нет, скрипт сам сгенерирует пароль и допишет секцию (на экран не выводится).

**Установка на стенд (владелец/Platform, после слияния PR).** Выложить ops-файлы (`push-release.sh`, в бандл входит `stand-gate.mjs`), затем на сервере `/srv/twomc-stand/ops/setup-nginx.sh` и `/srv/twomc-stand/ops/verify.sh`. Скрипт идемпотентен; перед заменой `stand.conf` сохраняется как `stand.conf.bak.<время>`, при провале `nginx -t` предыдущая конфигурация восстанавливается автоматически. Gate поднимается ДО смены nginx; если он не стартовал, nginx не меняется.

**Откат на Basic Auth** (старый `/etc/nginx/stand.htpasswd` не удалялся): 1) взять предыдущий шаблон `git show 6eb18690:infrastructure/test-website/nginx.stand.conf.template` (для basic нужен `STAND_GATE_TOKEN` = содержимое `gate.token`, `envsubst '${STAND_DOMAIN} ${STAND_GATE_TOKEN} ${WEB_PORT} ${API_PORT}'`) либо вернуть сохранённый `/etc/nginx/conf.d/stand.conf.bak.<время>`; 2) `sudo nginx -t && sudo systemctl reload nginx`; 3) `docker rm -f twomc-stand-gate` (по желанию). Мгновенно закрыть стенд от интернета: раздел 7.

**Альтернатива «без защиты» (не рекомендуется).** Убрать `auth_request` и оставить только noindex: стенд станет виден любому, кто знает адрес (поисковики не проиндексируют, но боты, сканеры и случайные посетители увидят тестовые данные, мок-платежи, формы регистрации с кодами в логе API и dev-режим API с ослабленными проверками); риск средний: нет реальных денег и боевых данных, но возможны спам регистраций, нагрузка на VDS и утечка незавершённых функций. Допустимо только на короткое время и по решению владельца.

**Что проверить на стенде после применения (не проверялось локально: стенд и VDS не трогались).** `verify.sh` целиком; в Chromium: форма на 360/390/1280, вход, переход на `next`, чат (socket.io), вход админа с 2FA и `/admin/store/products`, выход; `smoke.sh` 40/40 и `visual-check.sh` (72 страницы).

## Эксплуатация формы входа: токен, сбой gate, отзыв сессий, бэкапы

- **Сервисный токен (`/srv/twomc-stand/gate.service.token`, 600).** Заголовок `X-Stand-Gate` для раннера и мониторинга. Отдельный от прежнего `gate.token` (тот не используется для пропуска и не удаляется). Не попадает в argv (curl читает его из stdin-конфига `-K -`), в `access_log` nginx (заголовок не входит в формат лога) и в лог gate (gate пишет только факт входа и IP). Ротация: `rm /srv/twomc-stand/gate.service.token && /srv/twomc-stand/ops/setup-nginx.sh` (новый токен создаётся, хеш контейнера меняется, gate пересоздаётся); затем обновить токен у раннера и мониторинга. Проверка после ротации: `verify.sh` (старый токен должен давать 302, новый 200).
- **gate упал или отвечает 500.** nginx получает от `auth_request` не 204/401, а 500: сайт отдаёт 500 (закрыт, fail closed), а не открывается. Проверка: `docker ps -a --filter name=twomc-stand-gate`, `docker logs --tail=50 twomc-stand-gate`, `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4100/__stand/login` (ожидается 200). Подъём: `docker start twomc-stand-gate`; если контейнера нет или не стартует, повторить `/srv/twomc-stand/ops/setup-nginx.sh` (идемпотентен; пересоздаёт gate при смене хеша образа, `stand-gate.mjs` или файлов секретов; перед заменой nginx проверяет конфигурацию во временном файле). Частые причины: нет файла секрета (gate.key короче 32 знаков или удалён), удалён образ node:20-alpine, нехватка памяти (лимит контейнера 96 МБ).
- **Отзыв всех выданных cookie.** Подпись cookie зависит только от `gate.key`: `rm /srv/twomc-stand/gate.key && /srv/twomc-stand/ops/setup-nginx.sh` (новый ключ, gate пересоздан, все сессии недействительны, нужен повторный вход). Смена пароля сама сессии не отзывает.
- **Бэкапы `stand.conf.bak.*`** (`/etc/nginx/conf.d/`). Создаются при каждой замене `stand.conf`, права 600 (в бэкапах прежней схемы лежит старый токен пропуска); `*.bak.*` nginx не подключает. `setup-nginx.sh` и `verify.sh` приводят/проверяют права 600. Откат конфигурации: `sudo cp -p /etc/nginx/conf.d/stand.conf.bak.<время> /etc/nginx/conf.d/stand.conf && sudo nginx -t && sudo systemctl reload nginx`. Старые бэкапы удаляет только владелец.
- **Перебор пароля.** Защита в gate: 10 попыток в минуту (IPv4 по адресу, IPv6 по префиксу /64), задержка 0,7 с на неудачу, scrypt (асинхронный, не блокирует проверку пропуска). Jail fail2ban `nginx-http-auth` не включается: он читает ошибки Basic Auth из `error.log`, которых форма не создаёт. Фильтр под лог gate потребовал бы вывести журнал контейнера в файл или journald; сейчас не делается (отдельное решение владельца).

## Оплата заказа на моке и флаги стенда

**Оплатить заказ на моке (владелец).** Оформить заказ на стенде (в оформлении выбрать способ оплаты; заказ получает провайдера и `paymentId`, статус PENDING). Затем с рабочей машины:

```bash
infrastructure/test-website/run-mock-pay.sh <номер заказа|id заказа|paymentId> [paid|failed] [--dry-run]
```
Скрипт `mock-pay.sh` (на сервере, через SSH) находит заказ в БД стенда, подписывает тело вебхука `HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<timestamp>.<тело>")` и отправляет `POST http://127.0.0.1:4000/webhooks/payments/<провайдер заказа>` (заголовки `x-twomc-timestamp`, `x-twomc-signature`; контракт: `payments-webhook.controller.ts`, `webhook-signature.ts`). Секрет читается из `stand.env` в переменную окружения одноразового контейнера node и нигде не печатается; на экран выходит только `HTTP <код> accepted=<true|false> reason=<...>`. `--dry-run` показывает найденный заказ и не отправляет. `paid` -> `succeeded` (заказ оплачен), `failed` -> `failed`. Возврат вебхуком не делается: админка `/admin/store/orders/<id>` (нужен `STORE_REFUNDS_ENABLED=true`). Ожидаемые ответы: `accepted=true` (повтор: `reason=already_processed`), `accepted=false reason=amount_mismatch|currency_mismatch|payment_id_mismatch|order_not_found` - заказ не изменён. Выдача на игровой сервер не выполняется (сервера нет).

**Флаги стенда (allowlist `infrastructure/test-website/stand-flags.defaults`).** `PAYMENT_METHODS` (моки: `SBP`/`CARD_RU`/`SBERPAY` -> `mock-ru`, `CRYPTO` -> `mock-crypto`, `CARD_FOREIGN` -> `mock-foreign`), `QUICK_BUY_ENABLED`, `STORE_REFUNDS_ENABLED`, `WALLET_LEDGER_ENABLED`, `BRIDGE_ENABLED`, `BRIDGE_STATS_ENABLED=true`, `BRIDGE_INVENTORY_ENABLED=true` (без мастер-секрета `/bridge/v1/*` отвечает 503 fail-closed). Не трогаются: `BRIDGE_MASTER_SECRET` (отдельный скрипт, ниже), `BRIDGE_DELIVERY_ENABLED` (остаётся выключенным), `LITEBANS_ENABLED`, `GIVEAWAY_ENABLED`, `STORE_DELIVERY_ENABLED`, `TURNSTILE_DISABLED`, SMTP/VAPID, реальный платёжный провайдер.

```bash
infrastructure/test-website/run-stand-flags.sh              # сухой прогон: «имя: было -> стало», файлы не меняются
infrastructure/test-website/run-stand-flags.sh --apply      # запись + пересоздание api
```
`--apply`: отказ, если `stand.env` не 600 или `NODE_ENV` не `development`; бэкап `stand.env.bak.<время>` (600); атомарная замена; `docker compose -p twomc-stand ... up -d --force-recreate --no-deps api` тем же способом и под тем же замком `.deploy.lock`, что в `deploy-stand.sh` (релиз из `.release`); проверка health. Значения флагов не секретны и печатаются; остальные строки `stand.env` не выводятся. `gen-env.sh` на новом стенде берёт те же значения из `stand-flags.defaults`, существующий `stand.env` не перезаписывает. Откат: `cp -p /srv/twomc-stand/stand.env.bak.<время> /srv/twomc-stand/stand.env`, затем пересоздать api (`docker compose` как в `deploy-stand.sh` или повторный `deploy-stand.sh <sha>`).

**Адрес Bridge для плагина (корневые маршруты).** `siteUrl` плагина = `https://test-website.twomc.su` (без `/api` и без любого пути: `BridgeConfig` другой не принимает). Плагин ходит на `/bridge/v1/{handshake,events,delivery/claim,delivery/ack}`; nginx стенда проксирует ровно эти четыре точных пути в API с тем же путём (guard подписывает и проверяет `req.originalUrl`), мимо формы входа, `client_max_body_size 300k`. Методы: `handshake` только GET, остальные только POST; другой метод -> 405. Обход формы решает gate по тем же правилам, что для `/api/bridge/v1/*` (точный путь, без `//`, `%2e`, регистра, `;`, хвостового `/`). Любой другой путь `/bridge/*` уходит в web за формой входа. Защита маршрутов - подпись запроса (приложение), без неё 401 JSON. Прежние `/api/bridge/v1/*` остаются. `verify.sh` проверяет без cookie: `POST /bridge/v1/events` с мусором -> 401 JSON приложения (не 302/форма), `GET /bridge/v1/handshake` без подписи -> 401 JSON, `GET /bridge/v1/other` -> 302 на форму, неверный метод -> 405. **Откат:** вернуть предыдущий `nginx.stand.conf.template` и `stand-gate.mjs` из git, перерендерить nginx (`setup-nginx.sh`) и перезапустить gate; плагин тогда снова упрётся в форму входа.

**Мастер-секрет Bridge (`stand-bridge-secret.sh`).** Секрет лежит на сервере: `/srv/twomc-stand/bridge-master.secret` (600), копия значения - строка `BRIDGE_MASTER_SECRET=` в `stand.env`. Читает его только главный агент/владелец; в чат, репозиторий и логи значение не попадает (скрипт печатает лишь «создан/уже есть» и «stand.env: обновлён/без изменений»). Формат под `isStrongMasterSecret`: 64 символа `[A-Za-z0-9]` (>= 32 байт, >= 16 различных).

```bash
infrastructure/test-website/run-stand-bridge-secret.sh              # сухой прогон: ничего не создаёт и не меняет
infrastructure/test-website/run-stand-bridge-secret.sh --apply      # создать файл (если нет), записать в stand.env, пересоздать api
```
Отказ при `NODE_ENV` не `development`, правах `stand.env`/секрета не 600 или негодном содержимом файла. Бэкап `stand.env.bak.<время>` (600), замок `.deploy.lock`, проверка health - как у `stand-flags.sh`. Повторный запуск идемпотентен (api не перезапускается без изменений). **Ротация:** удалить `bridge-master.secret`, перезапустить скрипт с `--apply`, затем перерегистрировать ключи серверов (ключи сервера выводятся из мастер-секрета). **Откат:** `cp -p /srv/twomc-stand/stand.env.bak.<время> /srv/twomc-stand/stand.env`, пересоздать api; файл секрета при необходимости удалить (создаётся заново).

**Логин тестового игрока для сида.** `seed-demo.sh` читает из `/home/twomc/test-website-credentials.txt` секцию `[игрок]`, строку `login: <значение>` (допустимы `[A-Za-z0-9_.-]`, до 64 символов) и передаёт контейнеру сида `DEMO_STAND_PLAYER_USERNAME` через временный env-файл 600 (не argv, не печатается). Нет секции или логин недопустим - переменная не передаётся, выводится предупреждение без значения. Файл учётных данных скрипт не меняет.

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

## Вход под демо-игроком demo_ember (пароль и откат)

Зачем: у тестового игрока стенда настоящий MinecraftAccount, демо-наказания ему не выдаются; три демо-наказания (два обжалования) принадлежат `demo_ember` (создаётся `seed-demo.sh --seed`). Чтобы войти и увидеть «Мои наказания», нужен пароль.

```bash
infrastructure/test-website/run-stand-demo-login.sh              # сухой прогон (по умолчанию): только план
infrastructure/test-website/run-stand-demo-login.sh --apply      # новый случайный пароль + запись секции в файл учёток
```
`--apply` (владелец/Platform): генерирует пароль на сервере (`openssl rand -hex 16`), в контейнере `twomc-stand-tools` ставит `User.password` (bcrypt, `BCRYPT_ROUNDS`, как `AuthService`) и `mustChangePassword=false` только у `demo_ember`; другие пользователи, роли, 2FA и бан не трогаются. Для входа достаточно: не `SYSTEM`, не `isBanned`, верный пароль (подтверждение email не требуется; у `demo_ember` 2FA не включена). Забаненный или несуществующий пользователь -> отказ без изменений (для отсутствующего выполнить `seed-demo.sh --seed`). Отказ также при `NODE_ENV` в `stand.env` не `development` и при имени не `demo_*`. Замок `.deploy.lock`, как у деплоя.

Где пароль: `/home/twomc/test-website-credentials.txt` (600), секция `[демо-игрок]` со строками `login: demo_ember` и `password: ...`. Читает только главный агент или владелец; в чат, логи и репозиторий значение не попадает (скрипт печатает только «пароль задан, секция записана»). Вход: форма стенда (gate), затем обычный логин сайта `demo_ember` с этим паролем.

Откат: перед заменой создаётся `test-website-credentials.txt.bak-<UTC>` (600, прежние значения; удалить после проверки входа). Вернуть файл: `mv -f` копии поверх файла. Старый пароль в БД не восстанавливается (хеш не сохраняется): повторный `--apply` выдаёт новый пароль. Коды: 0 ок, 1 не выполнено (БД не тронута), 2 аргументы/окружение, 3 БД обновлена, файл не заменён (значения во временном `.new.*` рядом с файлом), 4 исход неизвестен (повторить `--apply`), 5 замок занят.

## Ротация 2FA стенда — инструкция владельцу

Когда: TOTP-секрет или резервные коды админа стенда (`stand_owner`) попали в чужой контекст (R173, Q113) или по плановой смене. Выполняет только владелец; агенты команду не запускают.

Команда (одна, с локальной машины, как `run-smoke.sh`: один SSH-сеанс под общей блокировкой VDS, скрипты едут по stdin):

```bash
infrastructure/test-website/run-rotate-2fa.sh --dry-run   # сначала: только план, ничего не меняется
infrastructure/test-website/run-rotate-2fa.sh --yes       # сама ротация
```

Ротация меняет ТОЛЬКО 2FA (TOTP-секрет и резервные коды) и отзывает refresh-токены админа; **пароль админа она НЕ меняет**. Если пароль мог утечь вместе с 2FA, его смену нужно отдельно решить владельцу (это вопрос владельцу: ротация 2FA пароль не закрывает; в `.bak-*` пароль остаётся действующим).

Что произойдёт на сервере (`rotate-2fa.sh`, от пользователя `twomc`, только при `STAND_ROOT=/srv/twomc-stand`). В начале берётся тот же `flock -n` на `/srv/twomc-stand/.deploy.lock`, что у `deploy-stand.sh` (деплой и ротация взаимно исключаются). При старте `--yes` скрипт предупреждает об остатках `*.new.*` и `*.bak-*` рядом с файлом учёток (печатаются только пути):
Порядок шагов (генерация, затем копия `.bak`, затем `.new`, затем БД; значения передаются только файлами 600, не аргументами командной строки):
1. В одноразовом контейнере `twomc-stand-tools` (режим `generate`) генерируются новый TOTP-секрет и 10 резервных кодов в рабочий файл (700-каталог в `/tmp`). БД не затрагивается.
2. Сначала делается копия `/home/twomc/test-website-credentials.txt.bak-<UTC>` (600), затем рядом с файлом учёток (тот же каталог, `umask 077`, 600) создаётся временный файл `test-website-credentials.txt.new.XXXXXX` с уже новой строкой `admin2fa:` (остальные строки без изменений).
3. Режим `apply` (SecretBox, `TWO_FACTOR_ENCRYPTION_KEY` из `stand.env`) одной транзакцией: новый секрет, сброс `twoFactorLastStep`, удаление старых резервных кодов и запись новых, отзыв всех refresh-токенов админа (access-токен доживёт свой короткий срок).
4. Только при успехе БД: атомарный `mv -f` временного файла поверх файла учёток (600).
5. В вывод попадают только пути, `ok` и отпечаток (8 hex sha256 секрета). Значения не печатаются и не логируются; файл учёток владелец читает сам на сервере.

Исходы сбоев:
- Код 5: lock занят (идёт деплой или другая ротация). Ничего не тронуто; повторите позже.
- Сбой между созданием `.bak` и началом apply (cp/mktemp/awk): БД не трогали, `.bak` и `.new` удаляются автоматически (код != 0). После старта apply `.bak` не удаляется никогда.
- Сигнал (SIGTERM/HUP/INT) уже после успешного apply: код 3, «БД обновлена, новые значения в `<.new>`», команда `mv -f ...`. Сигнал во время apply: код 143, исход неизвестен (как код 4).
- В итоговом выводе кодов 3, 4 и 143 перечисляются пути всех `*.new.*` и `*.bak-*` (только пути).
- Сбой генерации (код 1): БД и файл учёток не тронуты, можно повторить `--yes`.
- Откат БД подтверждён (код 1; `.ts` вывел маркер `rolled_back`: ошибка до транзакции либо два чтения БД с паузой ~3 с после сбоя транзакции показали прежний секрет): временный файл и копия `.bak` удалены, файл учёток не тронут, прежняя 2FA работает. Сообщение «откат транзакции подтверждён» печатается только в этом случае. Можно повторить `--yes`.
- Исход неизвестен (код 4: код возврата != 0 без маркера отката, например обрыв связи с БД; также обрыв SSH или SIGTERM после начала шага apply): транзакция могла закоммититься, поэтому временный файл `...credentials.txt.new.XXXXXX` с новыми значениями НЕ удаляется (флаг сохранения ставится до apply). Скрипт печатает только его путь. Действие: проверьте вход новыми значениями из этого файла; если не входит - повторите `--yes`. Если вход новыми значениями работает, выполните `mv -f <временный> /home/twomc/test-website-credentials.txt && chmod 600 /home/twomc/test-website-credentials.txt`.
- Сбой после коммита (код 3, не удалось заменить файл; либо код 4 с работающим входом новыми значениями): БД уже с новыми значениями, они лежат ТОЛЬКО во временном файле; скрипт печатает путь и команду `mv -f ... && chmod 600 ...`. Выполните её; ротацию не повторяйте, пока не заберёте файл (повторная ротация выдаст другие значения и безопасна, но потеряет текущие).
- Старый TOTP-секрет из БД не вернуть: БД хранит только новый (шифр SecretBox), прежнего значения нет нигде, кроме `.bak-*` и приложения-аутентификатора. Откат ротации = повторная ротация.

Если ник админа не `stand_owner`, задайте `ADMIN_USERNAME` (иначе берётся ник из строки `admin:` файла учёток).

Проверка входа после ротации:
1. `infrastructure/test-website/run-smoke.sh` - пункт «Вход админа с 2FA (TOTP)» должен быть РАБОТАЕТ (smoke читает новый блок из файла учёток).
2. Вручную: вход `stand_owner` на https://test-website.twomc.su, на шаге 2FA ввести код из приложения, добавив новый секрет из файла учёток; старый код приложения должен быть отклонён.

Контейнер запускается с `--cap-drop ALL --security-opt no-new-privileges`; `--read-only` не используется (ts-node/pnpm пишут в `/tmp` и кеш, без проверки на сервере риск поломки).

Откат и копии `.bak-*`: `/home/twomc/test-website-credentials.txt.bak-<UTC>` (600) - копия прежнего файла учёток; в ней ещё ДЕЙСТВУЮЩИЙ пароль админа и старые 2FA-значения (последние после успешной ротации уже недействительны). Это секрет: не копируйте и не пересылайте.
- Нужен прежний секрет (ротация ошибочна): `cp /home/twomc/test-website-credentials.txt.bak-<UTC> /home/twomc/test-website-credentials.txt && chmod 600 /home/twomc/test-website-credentials.txt` вернёт учётки (пароль, старый блок), но секрет в БД вернёт только повторная ротация (`--yes`).
- Восстановить права: `chmod 600 /home/twomc/test-website-credentials.txt*`.
- После проверки входа новыми значениями удалите копии (пароль в них ещё живой): `rm -f /home/twomc/test-website-credentials.txt.bak-*`. Остатки `.new.*` удаляйте только убедившись, что вход новыми значениями работает или ротация повторена: `rm -f /home/twomc/test-website-credentials.txt.new.*`.
