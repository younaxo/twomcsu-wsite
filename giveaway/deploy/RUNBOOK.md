# RUNBOOK мини-выкладки розыгрыша

Статус: ПОДГОТОВКА. Ни один шаг не выполнялся. Деплой, покупка сервера/домена, выпуск сертификатов и ключей - только по команде владельца.
Секреты не выводить в логи, чат, историю shell (`HISTCONTROL=ignorespace` или ввод через файл), не коммитить.

Обозначения: [В] - только владелец, [А] - агент после разрешения владельца.

## 0. Предусловия
- [В] Решение: сервер (отдельный от production twomc.su), домен/поддомен, срок жизни выкладки.
- [В] Домен: A/AAAA-запись на сервер. Игровой трафик Minecraft через Cloudflare не проксировать (Q14); для HTTPS-части прокси допустим только по отдельному решению (иначе менять `TRUST_PROXY` и nginx).
- Заменить `giveaway.example.com` в `nginx/giveaway.conf` (коммитом в ветке, не на сервере вручную).

## 1. Сервер и пользователь без root
1. [В] Создать пользователя `gw` без sudo-пароля для рутины: `adduser gw`, добавить в группу `docker` (rootless Docker предпочтительнее; группа docker эквивалентна root - принять осознанно).
2. [В] SSH: вход только по ключу; ключ создаётся и хранится вне репозитория (на машине владельца), на сервер кладётся публичная часть в `~gw/.ssh/authorized_keys` (0700 на каталог, 0600 на файл). Отключить пароли: `PasswordAuthentication no`, `PermitRootLogin no`. Приватный ключ агенту не передаётся.
3. Каталоги (от `gw`):
   ```
   mkdir -p /srv/twomc-giveaway/{secrets,certs,keys,backups,repo}
   chmod 0700 /srv/twomc-giveaway/secrets /srv/twomc-giveaway/keys /srv/twomc-giveaway/backups
   ```
4. Файрвол: открыть только 22 (по возможности с ограничением по IP), 80, 443 (и 25565 для тестового MC, когда он появится). Порты 5432/6379/4000 наружу не открываются (compose их не публикует).
5. Время (NTP): `timedatectl set-ntp true`, проверка `timedatectl status` -> `System clock synchronized: yes`. Окно подписи плагина +-300 с; уход часов даёт отказ событий (`in_future`/`stale`).

## 2. Секреты (вне репозитория)
1. Скопировать образцы из `giveaway/deploy/secrets/*.env.example` в `/srv/twomc-giveaway/secrets/{postgres,redis,api}.env`, `chmod 0600`.
2. Пароли БД и Redis сгенерировать на сервере (`openssl rand -hex 24`), не печатая: записывать сразу в файлы; значения в `api.env` (`DATABASE_URL`, `REDIS_PASSWORD`) должны совпасть с `postgres.env`/`redis.env`.
3. Заглушки production-обязательных переменных (`JWT_*`, `TWO_FACTOR_ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `COOKIE_DOMAIN`) - свои случайные значения, НЕ значения боевого сайта.
4. [В] `GIVEAWAY_MASTER_SECRET` генерирует ТОЛЬКО владелец (не короче 32 байт, не менее 16 различных) и вписывает в `api.env` сам. Агент значение не получает, не читает файл и не выводит.
5. Проверка прав, не содержимого: `stat -c '%a %U %n' /srv/twomc-giveaway/secrets/*` -> `600 gw ...`.

## 3. Сертификаты (вручную)
- [В/А] Выпуск certbot/ACME (HTTP-01 standalone на 80 до старта nginx, либо DNS-01), результат положить в `/srv/twomc-giveaway/certs/fullchain.pem` и `privkey.pem` (privkey 0600). Автопродление и перезапуск nginx после продления - отдельным решением. Из репозитория certbot не запускается.

## 4. Выкладка (после разрешения владельца)
```
cd /srv/twomc-giveaway/repo        # checkout слитого main, известный коммит
export RELEASE=$(git rev-parse --short HEAD)
C="docker compose -f giveaway/deploy/docker-compose.yml"
$C config -q                       # синтаксис
$C build api
$C up -d postgres redis
$C --profile ops run --rm migrate  # prisma migrate deploy на ПУСТОЙ БД мини-выкладки (см. README, раздел «Мини-выкладка»)
$C up -d api nginx
$C ps
```
Проверки без секретов:
- `curl -sS -o /dev/null -w '%{http_code}\n' http://<домен>/` -> 301.
- `curl -sS -o /dev/null -w '%{http_code}\n' https://<домен>/health` -> 404 (закрыто nginx).
- `curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://<домен>/api/giveaway/v1/events` -> 401/400 без подписи (не 404/502); 503, если розыгрыш выключен.
- Логи без секретов: `$C logs --tail=50 api` (проверить, что нет падения валидации env).

## 5. Ключи серверов (только владелец)
Утилита `apps/api/scripts/giveaway-server-key.ts` печатает только key-id и путь, ключ пишет в файл 0600 и не перезаписывает существующий. Она не входит в runtime-образ (нет `src`, `ts-node`), поэтому запускается из build-стадии образа на машине владельца/сервера:
```
docker build --target build -f infrastructure/api.Dockerfile -t twomc-giveaway-keytool:tmp .
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  --env-file /srv/twomc-giveaway/secrets/api.env \
  -v /srv/twomc-giveaway/keys:/keys \
  -w /app/apps/api twomc-giveaway-keytool:tmp \
  node_modules/.bin/ts-node scripts/giveaway-server-key.ts --server-id anarchy-new-era --version 1 --out /keys/anarchy-new-era.v1.key
docker rmi twomc-giveaway-keytool:tmp
```
(Способ не проверялся запуском; допустима альтернатива - запуск из checkout с `pnpm install` и `GIVEAWAY_MASTER_SECRET` в окружении.) Файл ключа передаётся на игровой сервер вне репозитория и вне `config.yml` плагина (`GIVEAWAY_KEY_FILE`), права 0600. Ротация: поднять `GIVEAWAY_KEY_VERSION`, `GIVEAWAY_ACCEPT_PREVIOUS_KEY=true` на время перехода.

## 6. Игровой сервер
- `online-mode=true` в `server.properties` (за прокси - на прокси и защищённый проброс UUID). Проверка: `/giveawaytime` в игре (право `giveaway.admin`) показывает режим; в логе плагина нет предупреждения об `online-mode=false`.
- NTP на игровом сервере - как в п.1.5.
- `apiUrl` плагина - `https://<домен>` (без пути), `serverId` из `GIVEAWAY_ALLOWED_SERVERS`.

## 7. Бэкап БД розыгрыша
Ежедневно (cron пользователя `gw`), дамп хранит данные подсчёта времени - права 0600, каталог 0700:
```
docker exec twomc-giveaway-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /srv/twomc-giveaway/backups/giveaway-$(date +%F).dump
```
Хранить 14 дней, копию вне сервера - решение владельца. Проверка восстановления раз перед стартом розыгрыша: поднять временную БД и `pg_restore` (на одноразовой базе, не на рабочей). Очередь плагина на игровом сервере (`queue.log`) переживает недоступность API до 72 ч.

## 8. Откат
- Приложение: `RELEASE=<предыдущий-sha> docker compose -f giveaway/deploy/docker-compose.yml up -d api` (образы тегированы). Миграции Prisma не откатываются автоматически: схема расширяющая (expand), предыдущий образ с ней совместим; откат данных - только из бэкапа п.7.
- Аварийное выключение приёма без удаления данных: в `api.env` `GIVEAWAY_ENABLED=false` и `up -d api` (приёмник отвечает 503, плагины копят очередь).
- Полная остановка: `docker compose ... stop nginx api` (тома остаются). `down -v` (удаляет данные) - запрещён без решения владельца.
- Сертификаты/ключи не удаляются при откате.
