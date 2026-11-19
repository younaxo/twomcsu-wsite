# Проверки после выкладки (мини-выкладка розыгрыша, фаза 1)

Все проверки без вывода секретов. Обозначения: `H=giveaway.twomc.su`, `BASE=/srv/twomc-giveaway`, `C="docker compose -f $BASE/releases/<sha>/giveaway/deploy/docker-compose.yml"` (на сервере под `gw`, `RELEASE=<sha>` в окружении). Отмечайте результат в отчёте: что выполнено фактически.

## A. Сеть и nginx
- [ ] `docker exec twomc-giveaway-nginx nginx -t` -> `syntax is ok` / `test is successful`.
- [ ] `$C ps`: api `healthy`, nginx `running`, postgres/redis `healthy`.
- [ ] HTTP -> HTTPS: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://$H/x?a=1"` -> `301 https://giveaway.twomc.su/x?a=1`.
- [ ] HTTPS и сертификат: `curl -sSI https://$H/ | head -1` -> 404 без ошибок TLS; `echo | openssl s_client -connect $H:443 -servername $H 2>/dev/null | openssl x509 -noout -dates -issuer` (срок, издатель).
- [ ] Catch-all 444: `curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example' http://<ip>/` -> `000` (соединение закрыто без ответа); `curl -sk --max-time 5 https://<ip>/` -> ошибка рукопожатия (`ssl_reject_handshake`).
- [ ] Снаружи доступен ТОЛЬКО `/api/giveaway/`: `/health`, `/api/auth/login`, `/giveaway/v1/events` (без `/api`), `/uploads/x`, `/` -> 404: `for p in /health /api/health /api/auth/login /giveaway/v1/events /uploads/x /; do printf '%s ' $p; curl -sS -o /dev/null -w '%{http_code}\n' https://$H$p; done`.
- [ ] Порты снаружи (с другой машины): `nmap -Pn <ip>` -> открыты только 22, 80, 443 (25565 - только на время теста MC). 5432/6379/4000 закрыты.

## B. Приёмник и флаг
- [ ] Без подписи: `curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://$H/api/giveaway/v1/events` -> 401 (не 404/502).
- [ ] Выключенный флаг -> 503: в `$BASE/secrets/api.env` заменить `GIVEAWAY_ENABLED=true` на `false` (`sed -i 's/^GIVEAWAY_ENABLED=.*/GIVEAWAY_ENABLED=false/' $BASE/secrets/api.env`; файл не печатать), `$C up -d api`, дождаться healthy, повторить запрос -> 503. Вернуть `true`, `$C up -d api`, убедиться, что снова 401.
- [ ] Ключ тестового сервера: `giveaway/deploy/minecraft-test/mc-test.sh keygen` (печатает только `key-id: mc-test.1` и путь).
- [ ] Принятие подписанного события (ключ не печатается): `giveaway/deploy/tools/sign-event.sh --url https://$H --key-file $BASE/keys/mc-test.v1.key --server-id mc-test --version 1 --type join --name CheckPlayer --show-body` -> `HTTP 200`.
- [ ] Негативные случаи: `--replay` (второй запрос с тем же nonce) -> второй `HTTP 401`; `--tamper` -> 401; `--timestamp-offset -3600` -> 401; сервер, которого нет в списке (другой `--server-id` с ключом, выданным `giveaway-key.sh`) -> 403.
- [ ] Логи без секретов: `$C logs --tail=50 api` - нет падений валидации env, в строках `giveaway auth` только код причины и key-id.

## C. Сервер: время, безопасность, бэкап
- [ ] `timedatectl` -> `Time zone: UTC`, `System clock synchronized: yes`, `NTP service: active`.
- [ ] `sudo bash setup-server.sh verify` -> код выхода 0 (sshd: `passwordauthentication no`, `permitrootlogin no`; ufw active; fail2ban sshd; права секретов 600).
- [ ] sshd: вход паролем и под root невозможен (`ssh -o PubkeyAuthentication=no gw@<ip>` -> Permission denied; `ssh root@<ip>` -> отказ).
- [ ] fail2ban: `sudo fail2ban-client status sshd` -> jail активен. Свой адрес не банить.
- [ ] ufw: `sudo ufw status verbose` -> default deny incoming; 22, 80, 443 (и 25565 только на время теста).
- [ ] Права: `stat -c '%a %U:%G %n' $BASE/secrets $BASE/secrets/*.env $BASE/keys $BASE/backups $BASE/certs $BASE/certs/*` -> 700/600 gw; certs 750 root:101, privkey 640 root:101.
- [ ] certbot: `systemctl list-timers | grep -E 'certbot|twomc'` (оба таймера); `sudo certbot renew --dry-run` -> success (nginx на секунды остановится и вернётся; проверить `$C ps` после).
- [ ] Бэкап создаётся: `systemctl start twomc-giveaway-backup.service && ls -l $BASE/backups` -> `giveaway-daily-<дата>.dump`, права `-rw-------`.
- [ ] Бэкап восстанавливается (на ВРЕМЕННОЙ базе внутри контейнера, не на рабочей):
  ```
  P=twomc-giveaway-postgres; B=$(ls -1t $BASE/backups/giveaway-daily-*.dump | head -1)
  docker exec $P sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE giveaway_restore_check"'
  docker exec -i $P sh -c 'pg_restore -U "$POSTGRES_USER" -d giveaway_restore_check --no-owner' < "$B"
  docker exec $P sh -c 'psql -U "$POSTGRES_USER" -d giveaway_restore_check -tAc "select count(*) from information_schema.tables where table_name like \$\$giveaway_%\$\$"'   # 6 и более
  docker exec $P sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE giveaway_restore_check"'
  ```

## D. Плагин на тестовом Minecraft (1.21.4 и 1.21.11 по очереди)
Подготовка: `minecraft-test/README.md`. Нужен лицензионный клиент нужной версии (online-mode=true), игрок с правом `giveaway.use`, оператор с `giveaway.admin`. Для каждой версии отметьте отдельно:

| Проверка | 1.21.4 | 1.21.11 |
| --- | --- | --- |
| Плагин загрузился, в логе нет ошибок и предупреждения об `online-mode=false` | [ ] | [ ] |
| `/giveawaytime` (admin): связь с сайтом OK, режим online | [ ] | [ ] |
| Вход: событие `join` принято (в логе API нет `bad_signature`; игрок появился в БД) | [ ] | [ ] |
| Выход: событие `quit`, сессия закрыта | [ ] | [ ] |
| Подсчёт: через 3-5 мин активной игры минуты растут (запрос ниже / `/giveawaytime`) | [ ] | [ ] |
| AFK: без движения дольше `afkMinutes` (5; для теста можно 1) минуты не растут, при движении возобновляются | [ ] | [ ] |
| Обрыв связи: `$C stop nginx` на ~2 мин при игре; `/giveawaytime` показывает очередь > 0; `$C up -d nginx`; очередь доставлена, минуты не потеряны и не удвоены | [ ] | [ ] |
| Перезапуск сервера MC во время сессии: после рестарта и входа нет дублей, очередь (`queue.log`) отправлена | [ ] | [ ] |
| Перезапуск API (`$C restart api`) во время игры: события не теряются | [ ] | [ ] |
| Команда `/giveaway <код>` не светится в консоли/логе команд (по документации плагина) | [ ] | [ ] |

Количество минут по серверам: `docker exec twomc-giveaway-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select server_slug, count(*) from giveaway_minutes group by 1"'`.

## E. e2e конкурентности выдачи билетов (одноразовая БД)
Spec: `apps/api/test/giveaway-concurrency.e2e-spec.ts` (M1/M2: коды и билеты, настоящая PostgreSQL, Redis не нужен). Запуск на VDS одной командой; рабочая БД не затрагивается (временный postgres в tmpfs, отдельная docker-сеть, всё удаляется после прогона). Остановите тестовый MC (`mc-test.sh down`): нужно ~1 ГБ ОЗУ и доступ в интернет (pnpm install).
```
giveaway/deploy/tools/e2e-giveaway.sh /srv/twomc-giveaway/releases/<sha>
```
- [ ] Код выхода 0, в выводе `Tests: ... passed`, строка `[e2e] код выхода: 0`.

Вручную то же: временный `postgres:16-alpine`, `DATABASE_URL` на него, `prisma migrate deploy` (включая `20261119150000_giveaway_phase2b`), затем в `apps/api`: `jest --config ./test/jest-e2e.json --runInBand giveaway-concurrency`. Тест до выкладки не запускался (решение владельца).

## F. Итог
- [ ] Записано: sha релиза (`cat $BASE/state/current_release`), дата, результаты A-E, что не пройдено и почему.
- [ ] Если тест MC завершён: порт 25565 закрыт (`mc-test.sh down`, `setup-server.sh mc-port-close 25565`, `nmap -Pn <ip>`).
