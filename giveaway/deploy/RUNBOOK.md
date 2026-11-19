# RUNBOOK мини-выкладки розыгрыша

Статус: ПОДГОТОВКА. Ни один шаг не выполнялся. Деплой, покупка сервера/домена, выпуск сертификатов и ключей - только по команде владельца.
Секреты не выводить в логи, чат, историю shell (`HISTCONTROL=ignorespace` или ввод через файл), не коммитить.

Обозначения: [В] - только владелец, [А] - агент после разрешения владельца.

Файлы выкладки (все в `giveaway/deploy/`):

| Файл | Назначение |
| --- | --- |
| `setup-server.sh` | первичная настройка VDS (раздел 1-3, 7), выпуск сертификата, проверки `verify` |
| `deploy.sh` | выкладка/обновление и откат с машины агента (раздел 4, 8) |
| `docker-compose.yml`, `nginx/giveaway.conf`, `secrets/*.env.example` | сама мини-выкладка |
| `tools/giveaway-key.sh` | ключ сервера игры (раздел 5) |
| `tools/sign-event.sh` | подписанное тестовое событие для curl |
| `tools/e2e-giveaway.sh` | e2e конкурентности на одноразовой БД |
| `minecraft-test/` | тестовый Minecraft-сервер на том же VDS (раздел 6) |
| `POST-DEPLOY-CHECKLIST.md` | проверки после выкладки |

## 0. Предусловия
- [В] Решение: сервер (отдельный от production twomc.su), домен/поддомен, срок жизни выкладки. VDS - отдельный, куплен владельцем; доступ агенту: пользователь без root, SSH-ключ агента вне репозитория (`C:\Users\younaxo\.ssh\twomc_giveaway_vds`, содержимое никому не показывается).
- [В] Домен: A/AAAA-запись на сервер. Игровой трафик Minecraft через Cloudflare не проксировать (Q14); для HTTPS-части прокси допустим только по отдельному решению (иначе менять `TRUST_PROXY` и nginx).
- [В] DNS-запись `giveaway` в Beget - владелец. Домен `giveaway.twomc.su` уже прописан в `nginx/giveaway.conf` (3 места: `map $gw_domain` и два `server_name`; проверка: `grep -n example.com deploy/nginx/giveaway.conf` ничего не находит). Редирект 80->443 и заголовок `Host` к API берутся из `$gw_domain`, а не из запроса; запросы к чужому Host или по IP получают 444 (catch-all).

## 1. Сервер и пользователь без root
Роли: АДМИНИСТРИРУЕТ пользователь провайдера с sudo (`<admin>`): setup, harden-ssh, issue-cert, ufw, mc-port-*, verify. Пользователь развёртывания `gw` - БЕЗ sudo и без пароля (только ключ агента), работает с `deploy.sh`, `mc-test.sh`, `giveaway-key.sh`; он в группе `docker` (эквивалент root для хоста, принято осознанно). Узкого sudo-правила для `gw` нет и не нужно: наличие сертификата проверяется без чтения ключа (каталог `certs` 0755, см. раздел 3).

ПЕРВЫЙ ПРОГОН - только со ВТОРОЙ открытой SSH-сессией администратора и с открытой веб-консолью провайдера (VNC/serial): если доступ пропадёт, консоль - единственный путь назад.
```
scp -i <ключ-админа> giveaway/deploy/setup-server.sh <admin>@<ip>:~/      # либо загрузить вместе с каталогом deploy
scp ... <файл-с-ПУБЛИЧНЫМ-ключом-агента>.pub <admin>@<ip>:~/agent.pub
# 1) setup: sshd НЕ ужесточается. Порт sshd определяется из sshd -T (+ ssh.socket, + порт текущей сессии); --ssh-port только сверяется
sudo bash setup-server.sh setup --deploy-user gw --pubkey-file ~/agent.pub [--ssh-port <тот же, что у sshd>] [--mc-port 25565]
# 2) из ВТОРОГО окна проверить вход ключом: gw (ключ агента) и <admin> (его ключ). Только после этого:
sudo bash setup-server.sh harden-ssh --confirm-key-login
# 3) снова из нового окна: вход gw и <admin> по ключу работает; пароль и root - отказ
sudo bash setup-server.sh verify
```
`setup`: создаёт `gw` (без пароля, без sudo), кладёт публичный ключ в `~gw/.ssh/authorized_keys` (0700/0600), включает ufw (порт(ы) sshd из `sshd -T`, 80, 443; правило ssh добавляется ДО `ufw enable`, иначе стоп; порт тестового MC в ufw - только при `--mc-port`), fail2ban для sshd (порт из `sshd -T`, backend systemd), UTC и NTP, Docker Engine + compose plugin (отпечаток ключа сверяется), каталоги и секреты, certbot, ежедневный бэкап. Если `--ssh-port` не совпал с фактическим портом sshd - стоп без изменений.
`harden-ssh --confirm-key-login` (отдельный шаг): отказывается работать без флага; требует, чтобы у `gw` И у администратора (`$SUDO_USER`, не root) были непустой `authorized_keys`, валидный ключ и верные права (`~/.ssh` 700, файл 600, домашний каталог не пишется группой/всеми - иначе StrictModes отвергнет ключ); проверяет, что ufw разрешает порт sshd и что `AllowUsers` (если задан) содержит обоих; пишет drop-in `10-twomc-hardening.conf` (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitRootLogin no`, `MaxAuthTries 6`), `sshd -t` ДО reload, откат файла при ошибке; после reload проверяет `sshd -T`. Текущую сессию и консоль провайдера не закрывать, пока из другого окна не подтверждён вход.
Откат ужесточения (через консоль провайдера или оставшуюся сессию): `sudo rm /etc/ssh/sshd_config.d/10-twomc-hardening.conf && sudo sshd -t && sudo systemctl reload ssh`.
Приватный ключ агента на сервер не передаётся (только публичная часть).

Файрвол: ВАЖНО - Docker публикует порты через iptables в обход правил ufw/firewalld, правило ufw НЕ закрывает и не открывает опубликованный порт контейнера. Поэтому compose мини-выкладки публикует наружу только 80/443; 5432/6379/4000 не публикуются; тестовый MC привязан к `127.0.0.1`. Открытие порта MC = пересоздание контейнера с `MC_BIND=0.0.0.0` (`mc-test.sh up <версия> --public`), закрытие = `mc-test.sh down` или `up` без `--public`; `setup-server.sh mc-port-close N` удаляет контейнер и снимает правило ufw (раздел 6). Альтернатива - цепочка `DOCKER-USER` или `GIVEAWAY_HTTP_PORT=<ip>:80`, `GIVEAWAY_HTTPS_PORT=<ip>:443`. После любого `up` проверить с внешней машины `nmap -Pn <ip>`.

Время (NTP): окно подписи плагина +-300 с; уход часов даёт отказ событий (`in_future`/`stale`). Проверка: `timedatectl` -> `System clock synchronized: yes`.

Структура каталогов `/srv/twomc-giveaway` (создаёт скрипт): `secrets` 0700, `keys` 0700, `backups` 0700 (владелец `gw`), `certs` root:root 0755 (`privkey.pem` root:101 0640, `fullchain.pem` 0644), `releases/<sha>`, `state` (`current_release`, `previous_release`), `data`, `mc` (тестовый MC).

## 2. Секреты (вне репозитория)
1. `setup-server.sh` создаёт `/srv/twomc-giveaway/secrets/{postgres,redis,api}.env` (0600, владелец `gw`) ТОЛЬКО если файла нет; существующие не трогает. Пароли БД и Redis - `openssl rand -hex 24`, записываются прямо в файлы (umask 077), в вывод не попадают; значения в `api.env` (`DATABASE_URL`, `REDIS_PASSWORD`) совпадают с `postgres.env`/`redis.env`.
2. Режим `GIVEAWAY_ONLY=true`: API поднимает только health и приёмник розыгрыша; `JWT_*`, `TWO_FACTOR_ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `COOKIE_*` не нужны. Флаг читается из окружения контейнера (`--env-file`), не из `.env` внутри образа. `GIVEAWAY_ENABLED=true` и `GIVEAWAY_MASTER_SECRET` обязательны, иначе API не стартует.
3. `GIVEAWAY_MASTER_SECRET`: по решению владельца (2026-11-19) генерируется НА СЕРВЕРЕ скриптом (`openssl rand -hex 32` сразу в `api.env`, 0600, без вывода; генерация повторяется, пока не встретятся все 16 hex-цифр - иначе API отвергнет секрет как слабый, требование «не менее 16 различных байт»). Агент и чат значение не получают; файл не читается и не печатается. Раньше этот шаг был «только владелец» - теперь владелец делегировал его серверу, ручной ввод не нужен.
4. `GIVEAWAY_ALLOWED_SERVERS=anarchy-new-era,mc-test`: `mc-test` - тестовый сервер на этом VDS. Данные тестов попадают в БД под этим serverId; перед стартом розыгрыша решить с владельцем (сброс БД мини-выкладки или игнор `mc-test`).
5. Проверка прав, не содержимого: `stat -c '%a %U %n' /srv/twomc-giveaway/secrets/*` -> `600 gw ...` (то же делает `setup-server.sh verify`).

## 3. Сертификаты
- Выпуск - отдельная команда после того, как DNS `giveaway` указывает на сервер (скрипт проверяет, что A-запись совпадает с адресом хоста): `sudo bash setup-server.sh issue-cert --domain giveaway.twomc.su --email <почта-владельца> --agree-le-tos` (`--staging` - пробный прогон `--dry-run`). Согласие с условиями Let's Encrypt даётся явным флагом от имени владельца.
- Режим: certbot `--standalone` (HTTP-01 на порту 80). nginx-контейнер публикует 80, поэтому для первого выпуска его ещё нет, а при продлении хуки `renewal-hooks` останавливают его на несколько секунд (`pre`), копируют сертификат в `/srv/twomc-giveaway/certs` (`deploy`) и запускают обратно (`post`, только если он работал). Автопродление - `certbot.timer`; проверка: `systemctl list-timers | grep certbot`, `sudo certbot renew --dry-run`.
- Права (хук ставит их сам): каталог `certs` `root:root` `0755` (так `gw` проверяет наличие файлов через `test -s`, не читая ключ; `deploy.sh` делает именно это); `privkey.pem` - `root:101`, `0640` (nginx-unprivileged работает под uid 101; для `gw` не читается), `fullchain.pem` 0644:
  ```
  stat -c '%a %U:%G %n' /srv/twomc-giveaway/certs /srv/twomc-giveaway/certs/*   # 755 root:root / 640 root:101 / 644
  ```
  Выпуск использует `certbot --deploy-hook` (копирование выполняется certbot после выпуска и при каждом продлении); e-mail не должен начинаться с «-».

## 4. Выкладка (после разрешения владельца)
- [В/А] Перед выкладкой закрепить образы по digest: определить digest `postgres:16-alpine`, `redis:7-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine` (`docker buildx imagetools inspect <образ>` либо `docker pull` и `docker image inspect --format '{{index .RepoDigests 0}}' <образ>`), проверить происхождение и записать в compose как `image: <имя>@sha256:<digest>` отдельным коммитом. Значения в репозитории намеренно не заготовлены.
- Сети: `api` только во внутренней сети `backend` (без исходящего интернета), `nginx` в `edge` и `backend`; `nginx` стартует после `api` со статусом healthy (healthcheck `/health`).
- С машины агента (из корня репозитория, слитый коммит из `main`):
```
export GIVEAWAY_VDS_HOST=<ip-или-имя>  GIVEAWAY_VDS_USER=gw  GIVEAWAY_VDS_KEY='C:\Users\younaxo\.ssh\twomc_giveaway_vds'
giveaway/deploy/deploy.sh --dry-run               # что будет выложено
giveaway/deploy/deploy.sh --rev <коммит>          # выкладка
```
Что делает `deploy.sh`: `git archive` коммита (только отслеживаемые файлы, без `.env*`) -> `$BASE/releases/<sha>`; предпроверки (`api.env` 0600, `DATABASE_URL` указывает на `@postgres:5432/giveaway` - БД мини-выкладки, `GIVEAWAY_ONLY=true`, сертификаты на месте); `compose config -q`; `build api`; `up -d postgres redis`; бэкап (если уже был релиз); миграции профилем `ops` (`prisma migrate deploy`, только на БД мини-выкладки; seed не выполняется); `up -d api nginx`; healthcheck api, доступность api из nginx, ответ приёмника (400/401/503 без подписи), `/health` снаружи 404; при провале - автоматический возврат на предыдущий релиз. Ручной вариант на сервере (то же по шагам): Бэкап перед миграциями делается ВСЕГДА, если в БД уже есть таблицы (не зависит от наличия предыдущего релиза); бэкап-скрипт отказывается работать при нехватке места (нужно 2 x размер БД + 200 МБ). Секреты в хвосте лога маскируются, включая `://user:pass@`.
```
cd /srv/twomc-giveaway/releases/<sha>
export RELEASE=<sha>
C="docker compose -f giveaway/deploy/docker-compose.yml"
$C config -q && $C build api
$C up -d postgres redis
$C --profile ops run --rm migrate  # на ПУСТОЙ БД мини-выкладки (README, «Мини-выкладка»)
$C up -d api nginx && $C ps
```
Проверки без секретов: `POST-DEPLOY-CHECKLIST.md`.

## 5. Ключи серверов
Ключ игрового сервера выводится из мастер-секрета (HKDF-SHA256, соль - id сервера, версия ключа в info). На сервере: `giveaway/deploy/tools/giveaway-key.sh --env-file /srv/twomc-giveaway/secrets/api.env --server-id <id> --version 1 --out /srv/twomc-giveaway/keys/<id>.v1.key` (openssl >= 3, печатает только key-id и путь, файл 0600, существующий не перезаписывает). Реализация сверена с `giveaway-crypto.ts` на тестовом секрете. Для тестового MC - `minecraft-test/mc-test.sh keygen` (`mc-test`). Ключ боевого сервера `anarchy-new-era` передаётся на игровой сервер вне репозитория и вне `config.yml` плагина (`GIVEAWAY_KEY_FILE`), права 0600; передачу выполняет владелец. Ротация: поднять `GIVEAWAY_KEY_VERSION`, `GIVEAWAY_ACCEPT_PREVIOUS_KEY=true` на время перехода. Резервный путь без openssl 3: `apps/api/scripts/giveaway-server-key.ts` (ts-node из build-стадии образа или из checkout).

## 6. Игровой сервер
- `online-mode=true` в `server.properties` (за прокси - на прокси и защищённый проброс UUID). Проверка: `/giveawaytime` в игре (право `giveaway.admin`) показывает режим; в логе плагина нет предупреждения об `online-mode=false`.
- Тестовый сервер на этом VDS (1.21.4 и 1.21.11 поочерёдно): `minecraft-test/README.md`. Порт наружу - только `up --public` (MC_BIND), закрытие - `down`/`mc-port-close`; проверка `nmap -Pn <ip>` с внешней машины.
- NTP на игровом сервере - как в п.1.
- `apiUrl` плагина - `https://<домен>` (без пути), `serverId` из `GIVEAWAY_ALLOWED_SERVERS`.
- Логи команд: `/giveaway <код>` виден в консоли Spigot и в CoreProtect, spy и подобных плагинах. Исключите команды `/giveaway` и `/ticket` из их логов (по документации плагина), включая пересылку логов наружу.

## 7. Бэкап БД розыгрыша
Ставит `setup-server.sh`: `twomc-giveaway-backup.timer` (03:15 UTC, systemd, от пользователя `gw`), скрипт `/usr/local/sbin/twomc-giveaway-backup`: `pg_dump -Fc` из контейнера `twomc-giveaway-postgres`, проверка `pg_restore -l`, права 0600, каталог 0700. Ротация: 7 дневных (`giveaway-daily-ГГГГ-ММ-ДД.dump`) + 4 недельных (воскресенье, `giveaway-weekly-ГГГГ-Wнн.dump`). Дамп хранит данные подсчёта времени. Копия вне сервера - решение владельца. Ручной запуск: `systemctl start twomc-giveaway-backup.service`; журнал: `journalctl -u twomc-giveaway-backup`. Проверка восстановления раз перед стартом розыгрыша - `POST-DEPLOY-CHECKLIST.md` (на временной БД, не на рабочей). Очередь плагина на игровом сервере (`queue.log`) переживает недоступность API до 72 ч.

## 8. Откат
- Приложение: `giveaway/deploy/deploy.sh --rollback-to <предыдущий-sha>` (образы тегированы `twomc-giveaway-api:<sha>`; предыдущий лежит в `state/previous_release`) либо вручную `RELEASE=<sha> docker compose -f releases/<sha>/giveaway/deploy/docker-compose.yml up -d api nginx`. Миграции Prisma не откатываются автоматически: схема расширяющая (expand), предыдущий образ с ней совместим; откат данных - только из бэкапа п.7 (деструктивно - по решению владельца).
- Автоматически: при провале healthcheck в `deploy.sh` выполняется возврат на предыдущий релиз; при провале миграций переключения не происходит (предыдущий релиз продолжает работать).
- Аварийное выключение приёма без удаления данных: в `api.env` `GIVEAWAY_ENABLED=false` и `up -d api` (приёмник отвечает 503, плагины копят очередь).
- Полная остановка: `docker compose ... stop nginx api` (тома остаются). `down -v` (удаляет данные) - запрещён без решения владельца.
- Сертификаты/ключи не удаляются при откате. Старые каталоги `releases/<sha>` не чистятся автоматически (откат на них возможен).

## 9. Риски и допущения
- Группа `docker` у `gw` эквивалентна root на хосте; компрометация ключа агента = компрометация VDS. Ключ - вне репозитория, VDS отдельный и временный.
- `giveaway-key.sh` и `sign-event.sh` передают ключ в аргументах `openssl` (виден `ps` пользователям сервера на доли секунды): допустимо на выделенном VDS с одним пользователем.
- Тест mc-test пишет данные в рабочую БД мини-выкладки (отдельный serverId): очистка/игнор - решение владельца перед стартом.
- Образы закрепляются по digest отдельным шагом (п.4); `itzg/minecraft-server` - тоже.
- Скрипты не запускались на сервере (его ещё нет); синтаксис и алгоритмы подписи проверены локально, `setup-server.sh` и `deploy.sh` - только `bash -n`. Первый прогон: наблюдать, не оставлять без присмотра.
