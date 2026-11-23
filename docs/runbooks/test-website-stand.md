# Runbook: тестовый стенд основного сайта (test-website.twomc.su)

Назначение: закрытый стенд основного сайта на отдельном VDS с тестовыми данными и мок-платежами. Это НЕ production и НЕ dev.twomc.su. Розыгрыш (giveaway.twomc.su) на этом сервере не размещён и не настраивался; неизвестные Host (в том числе giveaway) закрыты default_server.
Команда владельца на создание стенда: 2026-11-23. Артефакты: `infrastructure/test-website/`. В документе нет значений секретов, только пути.

## 1. Что стоит на сервере

| Что | Значение |
| --- | --- |
| VDS | 31.76.77.45, Ubuntu 24.04, 6 vCPU, 16 ГБ RAM, диск 197 ГБ, swap-файл 512 МБ (от провайдера) |
| Пользователь | `twomc` (группа sudo, NOPASSWD через `/etc/sudoers.d/90-twomc`, проверено `visudo -cf`), вход только по ключу |
| Ключ владельца | `~/.ssh/twomc_giveaway_vds` (приватный ключ нигде не копируется); `authorized_keys` у `twomc` и у root один и тот же |
| SSH | `/etc/ssh/sshd_config.d/00-twomc-hardening.conf`: `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no` |
| Host key (проверять при первом подключении) | ED25519 `SHA256:e15L2T8AVCAuwzpUAjGXZQC6faC4KPb80abop9Djwa4`; RSA `SHA256:ur6Oe+la5Fey51yHuEzQ4Sqr3r4u0ymXYhJ7WtbZobY`; ECDSA `SHA256:NHcQ1W2gXSX5ApQ/4szBc8T0EKWmASkSwKE7AdqjjsY` |
| Firewall | ufw: deny incoming; allow OpenSSH, 80/tcp, 443/tcp (IPv4 и IPv6) |
| fail2ban | jail `sshd` (5 попыток / 10 мин, бан 1 час) и `nginx-http-auth` |
| Время | chrony, часовой пояс UTC; unattended-upgrades (security) включены |
| Docker | docker-ce из официального репозитория, compose-плагин; пользователь `twomc` в группе docker |
| nginx / certbot | nginx 1.24 (пакет Ubuntu), certbot 2.9 (+ python3-certbot-nginx; сертификат выпущен через webroot), таймер продления systemd |
| Каталог стенда | `/srv/twomc-stand/` (`ops/` - скрипты, `releases/<sha>/` - код релиза, `stand.env` 600, `gate.token` 600, `.release`, `.release.prev`, `deploy.log`) |
| Секреты | `/srv/twomc-stand/stand.env` (генерирует `gen-env.sh`, bootstrap-пароли stand_owner / stand_curator внутри), `/home/twomc/test-website-basic-auth.txt` (600, формат `user:password`), `/etc/nginx/stand.htpasswd` |
| Контейнеры (проект `twomc-stand`) | `twomc-stand-postgres` (127.0.0.1:55432), `twomc-stand-redis` (только внутренняя сеть), `twomc-stand-api` (127.0.0.1:4000), `twomc-stand-web` (127.0.0.1:3000) |
| nginx | `/etc/nginx/conf.d/00-default-reject.conf` (default_server), `/etc/nginx/conf.d/stand.conf` (640, содержит токен пропуска) |

Наружу открыты только 22, 80, 443. Postgres слушает только loopback (нужно для честного guard демо-сида), Redis не опубликован.

### Создание пользователя и закрытие root (порядок защиты от самоблокировки)

1. `ssh -i <ключ> -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@31.76.77.45`; сверить отпечаток host key с таблицей выше.
2. От root: `adduser --disabled-password --gecos "" twomc`, `usermod -aG sudo twomc`, `install -d -m 700 -o twomc -g twomc /home/twomc/.ssh`, `install -m 600 -o twomc -g twomc /root/.ssh/authorized_keys /home/twomc/.ssh/authorized_keys`, строка `twomc ALL=(ALL) NOPASSWD:ALL` в `/etc/sudoers.d/90-twomc` (440) и `visudo -cf`.
3. ПРОВЕРИТЬ в новом сеансе: `ssh -i <ключ> twomc@31.76.77.45 'sudo -n true'`. Только после этого запускать `infrastructure/test-website/bootstrap-server.sh` (drop-in sshd, `sshd -t`, reload, ufw: OpenSSH раньше enable, fail2ban, chrony, Docker, nginx, certbot).
4. Проверить, что вход `twomc` работает, а root отклоняется (`Permission denied (publickey)`).

## 2. Схема стенда и осознанные решения

- Режим API `NODE_ENV=development`. Причина: по `production-env-checklist.md` и `env.validation.ts` (ADR-0187) в production `PAYMENT_PROVIDER` допускает только пустое значение, мок (`test`) разрешён лишь при явном `development`/`test`; демо-сид (`db:seed:demo`) требует ровно `development`. Код и guard не менялись и не обходятся. Следствие: на стенде действуют dev-ослабления (Turnstile можно выключить, 2FA персонала не принуждается, `COOKIE_DOMAIN=localhost` = host-only). Стенд закрыт basic auth и содержит только тестовые данные. Образ web собирается как production (Next.js standalone).
- Платежи: `PAYMENT_PROVIDER=test` (мок, без ключей), `PAYMENT_WEBHOOK_SECRET` сгенерирован на сервере, возвраты выкл., выдача на игровые серверы не включена (`STORE_DELIVERY_ENABLED` не задан), Bridge, LiteBans, Giveaway выкл., `QUICK_BUY_ENABLED=false`.
- Turnstile: проверка выключена (`TURNSTILE_DISABLED=true`, допустимо только вне production); в web вшит публичный тестовый site key Cloudflare `1x00000000000000000000AA` (не секрет).
- Почта: `SMTP_HOST` не задан, письма пишутся только в лог API.
- Один origin: web на `/`, API на `/api/` (nginx срезает префикс). Причина: отдельного DNS-имени для API нет (проверено `dig` с сервера: `api.test-website.twomc.su` не резолвится), а клиент строит адреса как `${API_URL}/<путь>`. ОГРАНИЧЕНИЕ: socket.io-клиент подключается к `${API_URL}/chat`, `/messages`, `/notifications`, где путь API_URL становится пространством имён; серверные пространства имён - `/chat`, `/messages`, `/notifications`. Поэтому realtime (чат, личные сообщения, живые уведомления) на стенде НЕ работает. REST, SSR, вход и покупка мока работают. Лечение - отдельный хост для API (раздел 6).
- Basic auth и API: приложение шлёт `Authorization: Bearer`, который затирает кэшированный basic. Поэтому после успешного basic auth nginx выдаёт cookie `stand_gate` (HttpOnly, Secure, SameSite=Lax, 12 часов); с cookie basic не запрашивается. Cookie выдаётся только на успешные ответы (не на 401). SSR web ходит на публичный URL API изнутри docker-сети; такие запросы (172.16.0.0/12, 127.0.0.1) пропускаются по адресу источника. Заголовок Basic к приложению не пробрасывается.
- noindex: `/robots.txt` отдаёт `User-agent: *` / `Disallow: /` (без basic auth, чтобы краулер увидел правило) и заголовок `X-Robots-Tag: noindex, nofollow` на всех ответах, включая 401.
- Неизвестные Host: :80 - `return 444`, :443 - `ssl_reject_handshake on` (рукопожатие отклоняется, сертификат не нужен). giveaway.twomc.su резолвится на этот IP, но намеренно закрыт.
- Сертификат выпущен без e-mail (`--register-unsafely-without-email`): адрес владельца внешнему сервису не передавался. Уведомления об истечении не придут; продление автоматическое (таймер certbot и deploy-hook перезагрузки nginx). Проверка: `sudo certbot renew --dry-run`.

## 3. Деплой и обновление

Локально (Docker не нужен, git-токен на сервер не передаётся):

```sh
infrastructure/test-website/push-release.sh            # git fetch + git archive origin/main -> scp, ops-файлы из рабочей копии
```

На сервере:

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
printf 'user = "%s"\n' "$(cat ~/test-website-basic-auth.txt)" | curl -K - -sI https://test-website.twomc.su   # 200 + X-Robots-Tag
curl -s https://test-website.twomc.su/robots.txt                # Disallow: /
printf 'user = "%s"\n' "$(cat ~/test-website-basic-auth.txt)" | curl -K - -s https://test-website.twomc.su/api/health
curl -sI http://test-website.twomc.su                           # 301 на https
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.example.invalid' http://127.0.0.1/   # 000 (444)
sudo ufw status verbose; sudo fail2ban-client status sshd; timedatectl
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'
ssh -i <ключ> -o BatchMode=yes root@31.76.77.45 true            # Permission denied (publickey)
```

Локальный DNS подменяется прокси (198.18.x), поэтому DNS проверяется только с сервера.

## 5. Перенос на twomc.su (позже)

Всё, что зависит от домена, берётся из `STAND_DOMAIN` (env), а не из кода:

| Где | Источник |
| --- | --- |
| nginx `server_name`, пути сертификата | `STAND_DOMAIN` при `setup-nginx.sh` (envsubst) |
| `WEB_ORIGIN`, `WEB_ORIGINS` (CORS), `FRONTEND_URL`, `PUBLIC_URL` | `stand.env`, выводятся из `STAND_DOMAIN` |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_BASE_URL`, `CDN_BASE_URL` | `stand.env`; NEXT_PUBLIC вшиваются при СБОРКЕ web, поэтому после смены нужна пересборка (`deploy-stand.sh`) |
| Cookie | `COOKIE_DOMAIN` из env: `localhost` = host-only; для production `.twomc.su` |

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
- Realtime: `apps/web/src/components/chat/chat-panel.tsx:57`, `apps/web/src/lib/messages/socket.ts:31`, `apps/web/src/lib/notifications/hooks.ts:168` - `io(`${API_URL}/<namespace>`)`; нужен отдельный хост API (например, `api.test-website.twomc.su`) для работы realtime. Требует DNS-записи от владельца и второго server-блока (CORS: добавить origin в `WEB_ORIGINS`; basic auth на хосте API не ставить, он ломает preflight).

Cookie и CORS жёстко не зашиты: `refresh-cookie.ts` берёт `COOKIE_DOMAIN` из env, CORS - из `WEB_ORIGIN`/`WEB_ORIGINS`.

## 7. Откат и обслуживание

- Образы: теги `twomc-stand-api|web:<sha12>`; откат образов - `deploy-stand.sh <предыдущий sha>` (каталог релиза остаётся в `releases/`, предыдущий sha в `.release.prev`). Схема БД не откатывается.
- Остановить стенд: `docker compose -p twomc-stand --env-file /srv/twomc-stand/stand.env -f <релиз>/infrastructure/docker-compose.prod.yml -f /srv/twomc-stand/ops/docker-compose.stand.yml stop api web`.
- Закрыть стенд от интернета мгновенно: `sudo rm /etc/nginx/conf.d/stand.conf && sudo nginx -s reload` (останется default_server 444) или `sudo ufw deny 443/tcp` (после проверки SSH-доступа).
- Полный снос стенда (только по решению владельца; данные тестовые): `docker compose -p twomc-stand ... down -v`, удалить `/srv/twomc-stand`, `/etc/nginx/conf.d/stand.conf`, `/etc/nginx/stand.htpasswd`, `certbot delete --cert-name test-website.twomc.su`.
- Ротация basic auth: удалить `/home/twomc/test-website-basic-auth.txt` и `/etc/nginx/stand.htpasswd`, снова `setup-nginx.sh`; ротация токена пропуска: удалить `gate.token`, снова `setup-nginx.sh`.
- Ротация секретов приложения: пароль Postgres/Redis записан в томах при инициализации, менять только вместе с томами (`down -v`); `gen-env.sh` намеренно не перезаписывает `stand.env`.
- Диск: `docker builder prune` и удаление старых тегов образов - вручную и осознанно; перед крупными работами владельцу - снимок диска в панели хостинга.
- Журналы: `docker logs --tail=100 twomc-stand-api`, `/var/log/nginx/`, `/var/log/letsencrypt/`.
