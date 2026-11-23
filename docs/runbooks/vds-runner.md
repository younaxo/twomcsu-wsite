# Раннер тяжёлых прогонов на VDS

Тяжёлое (сборка web, полные e2e на одноразовой БД, docker build, позже бенчмарки) выполняется на VDS 31.76.77.45; ПК владельца - только код и git.
Скрипты: `infrastructure/vds-runner/`. Сервер: `/srv/twomc-runner` (отдельно от стенда `/srv/twomc-stand`).

## Запуск

```bash
# из корня репозитория (Git Bash); по умолчанию снимок git archive origin/main после git fetch
infrastructure/vds-runner/run-remote.sh unit
infrastructure/vds-runner/run-remote.sh api-e2e --ref origin/main
infrastructure/vds-runner/run-remote.sh web-build --worktree /c/path/to/worktree --out /tmp/out
infrastructure/vds-runner/run-remote.sh docker-build --ref feature/x
infrastructure/vds-runner/run-remote.sh api-e2e --no-wait        # поставить и уйти
infrastructure/vds-runner/run-remote.sh --attach <id>            # дождаться/забрать позже
```

Выход: код возврата задания (0 - успех), `70` - тайм-аут ожидания (задание продолжает работать; `--timeout <мин>`, по умолчанию 60), `255` - сбой SSH.
Артефакты в `--out` (по умолчанию `./vds-runner-out/<id>`; не коммитить): `result.env`, `summary.txt`, `job.log`.

| Задание | Что делает | Лимиты |
|---|---|---|
| `unit` | `pnpm install --frozen-lockfile`, `pnpm -r typecheck` (tsc), jest api, vitest web | 4 CPU, 7 ГБ |
| `api-e2e` | одноразовые postgres 16 + redis 7 (уникальные имена, своя docker-сеть, tmpfs, без публикации портов), prisma validate, `migrate deploy`, seed, `test:e2e` api как в CI | node 4 CPU / 7 ГБ, pg 1 CPU / 1 ГБ, redis 0.5 CPU / 256 МБ |
| `web-build` | `pnpm --filter "@twomc/web..." build` (next build с зависимостями) | 4 CPU, 8 ГБ |
| `docker-build` | сборка образов api и web по `infrastructure/*.Dockerfile` (образы после сборки удаляются) | 8 ГБ, cpu-shares 256 |

Снимок кода: `--ref` - `git archive` коммита (только tracked). `--worktree` - ТОЛЬКО tracked-файлы рабочей копии (с незакоммиченными правками); новые файлы - `git add -N <файл>`
или флаг `--include-untracked` (тогда неотслеживаемые не игнорируемые файлы включаются). Перед отправкой печатаются исключённое denylist-ом и неотслеживаемые файлы.
Denylist (`lib/wt-filter.sh`): `.env*` (кроме шаблонов `.env.example/.sample/.template/.dist`), `.npmrc`, `.netrc`, `.pgpass`, `id_rsa*`, `id_ed25519*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.p8`, `*.kdbx`,
`service-account*.json`, `*credentials*`, имена на `secret(s)`, `*.sql` (кроме `prisma/migrations/**/migration.sql`), `*.dump`, `*.sqlite*`, `*.db`, `*.tsbuildinfo`, каталоги `node_modules`, `.next`, `.turbo`, `dist`, `coverage`, `secret(s)`.
Проверка: `infrastructure/vds-runner/tests/selftest.sh`. Бандлы на VDS кладутся в приватный `~/.twomc-inbox` (700), а не в `/tmp`.
Секреты на сервер не уходят; пароли БД, JWT и ключ 2FA для e2e генерируются на сервере на каждый запуск и живут только в одноразовых контейнерах.

## Правила доступа к VDS
- Только `twomc@31.76.77.45`, ключ `~/.ssh/twomc_giveaway_vds`, `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes`.
- Глобальная локальная блокировка `%TEMP%/twomc-vds.lock` (каталог-mkdir, файл `owner`: pid, время, скрипт, крайний срок): два исполнителя не открывают SSH одновременно.
  Снимается ТОЛЬКО блокировка с мёртвым pid, либо с истёкшим жёстким потолком `VDS_LOCK_MAX_SEC` (6 ч, записывается владельцем в `owner`); живой владелец ничего не теряет, как бы долго ни работал.
  Блокировка держится только на время одной операции scp/ssh, а не всего ожидания.
- Сбой входа не повторяется: скрипт завершается (код 255). Остановитесь и разберитесь (fail2ban: игнорируется наш IP, но не ломайте систему повторами).
- Блокировка встроена во все скрипты, ходящие на VDS: `run-remote.sh`, `cdn/sync-cdn.sh`, `cdn/install-cdn.sh` (через `lib/vds-ssh.sh`) и
  `test-website/push-release.sh` (его вызывает `release.sh`; долгая выкладка не теряет блокировку: просрочки по времени нет, только мёртвый pid или потолок 6 ч).
  Для любого другого скрипта или ручной команды: `infrastructure/vds-runner/with-vds-lock.sh <команда...>`; скрипту, который сам зовёт ssh, достаточно
  `source infrastructure/vds-runner/lib/vds-ssh.sh` и `vds_ssh_script`/`vds_scp_put` (или `vds_locked <команда>`). Вложенный вызов безопасен (`VDS_LOCK_HELD=1`).

## Как другим цепочкам ставить задания
Каждый исполнитель запускает прогон из СВОЕГО worktree, не трогая чужие (код на сервер уходит снимком, на ПК ничего тяжёлого не выполняется):
```bash
infrastructure/vds-runner/run-remote.sh unit      --worktree /c/path/to/my-worktree
infrastructure/vds-runner/run-remote.sh api-e2e   --worktree /c/path/to/my-worktree
infrastructure/vds-runner/run-remote.sh web-build --worktree /c/path/to/my-worktree --out /c/path/to/scratch/out   # берутся и неотслеживаемые файлы, git add не нужен
```
- Скрипт можно запускать из любого worktree (путь к скрипту берётся из ветки, где он есть; в `main` - после слияния).
- Параллельный запуск от нескольких исполнителей безопасен: SSH сериализуется локальной блокировкой, задания на сервере идут по очереди (FIFO); ожидание - короткими опросами.
- Долгое ожидание не держите: `--no-wait` ставит задание и возвращает id, позже `--attach <id>`.
- Итог читайте из `summary.txt` (числа тестов, длительность) и `job.log` в `--out`; код возврата 0 = зелёный.
- Сбой SSH (255) - не повторять в цикле, доложить chief.
- Падение `jest` с `signal=SIGKILL` означает OOM воркеров, а не ошибку теста: раннер уже ограничивает `--maxWorkers=3`; при локальных изменениях скриптов раннера
  не убирайте ограничение.

## Как устроен сервер
```
/srv/twomc-runner/
  queue/<id>/      ожидающие задания (meta.env, code.tar.gz); постановка атомарным mv
  running/<id>/    выполняется (job.log)
  done/<id>/       result.env, summary.txt, job.log (исходники удаляются сразу)
  ops/<hash>/      неизменяемая копия скриптов раннера версии, с которой пришло задание (worker.sh, lib.sh, jobs/*.sh, cleanup.sh)
  cache/           pnpm-store, corepack, home (общий кеш: повторные install быстрые)
  failed/<id>/     задания, которые не удалось запустить (worker их не повторяет; чистятся как done/)
  worker.lock      flock: один worker (держится и на время cleanup.sh); worker.log
~/.twomc-inbox/    приватный (700) приёмник бандлов от клиента; enqueue.sh/remote-entry.sh забирают и удаляют файл
```
id задания: `<UTC>-<job>-<hex6>`. `enqueue.sh` распаковывает бандл, кладёт задание в `queue/` и запускает `worker.sh` в фоне (`setsid nohup nice -n 15 ionice -c3`);
worker берёт самое старое задание, выполняет в docker (`--cpus`, `--memory`, `--memory-swap`, `--cpu-shares 256` - ниже стандартного веса стенда, `--pids-limit`), по таймауту
(2700 с) убивает, кладёт итог в `done/`, при пустой очереди запускает `cleanup.sh` и завершается. Если worker упал, следующий опрос статуса перезапустит его; потерянное `running` помечается `exit=99`.
Контейнеры и сети раннера помечены меткой `twomc-runner-job=<id>` и удаляются по метке в конце задания (и cleanup-ом, если зависли дольше 2 ч).

Очистка (`cleanup.sh`): `done/` старше 3 суток или сверх 30 последних; `ops/` старше 14 суток, кроме трёх свежих; pnpm store сбрасывается, если больше 15 ГБ; `worker.log` обрезается при 5 МБ.
Лимиты настраиваются переменными `RUNNER_JOB_CPUS`, `RUNNER_JOB_MEM`, `RUNNER_WEB_BUILD_MEM`, `RUNNER_JOB_TIMEOUT_SEC` на сервере (по умолчанию как в таблице).

## Диагностика
```bash
# одним сеансом: очередь, worker, контейнеры раннера
ssh -i ~/.ssh/twomc_giveaway_vds -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes twomc@31.76.77.45 \
  'ls /srv/twomc-runner/{queue,running,done}; docker ps --filter label=twomc-runner-job; tail -20 /srv/twomc-runner/worker.log'
```
(вручную - только под `with-vds-lock.sh`.)

## Откат и удаление
Раннер ничего не меняет в стенде и nginx. Откат: `sudo rm -rf /srv/twomc-runner` и `docker rmi` образов раннера (`public.ecr.aws/docker/library/node:20-bookworm`, redis:7-alpine из ECR);
образ `postgres:16-alpine` общий со стендом - не удалять. Локально ничего не устанавливается. Удаление выполняется только по решению владельца.

## Известные ограничения
- Образ node:20-bookworm (~1.1 ГБ) тянется с зеркала ECR при первом запуске; при недоступности зеркала задание упадёт на `docker run`.
- Параллельных заданий нет (очередь строго последовательна), чтобы не вытеснять стенд.
- `--worktree` по умолчанию берёт только tracked-файлы; с `--include-untracked` - и неотслеживаемые не игнорируемые (denylist действует всегда): не кладите секреты в корень проекта без `.gitignore`.
  Tracked `.npmrc` исключается denylist-ом; если он понадобится для `pnpm install` (приватный реестр), нужен отдельный явный allowlist.
- M3 (остаток): контейнер node получает `--cap-drop ALL` и `--security-opt no-new-privileges`, но у заданий `unit` и `web-build` остаётся сеть по умолчанию (нужна для `pnpm install`);
  контейнеры postgres/redis в `api-e2e` без `--cap-drop` (entrypoint postgres требует chown/setuid). Следующий шаг: отдельная сеть с egress-allowlist на время install и `--network none` на время тестов.
- M4: общий кеш `cache/pnpm-store` и `cache/home` пишется всеми заданиями (отравление кеша заданием из ветки с вредоносным кодом возможно). Следующий шаг: отдельный кеш на ветку/ref или read-only кеш на время тестов.
- L2-L6, L9-L11 (замечания низкой серьёзности независимого ревью; перечень - в отчёте ревью ветки `feature/vds-runner-cdn`): не закрыты, на безопасность не влияют; бэклог.
- Задание, которое не удалось запустить, уходит в `failed/` (или в `done/` с `exit=97`) и не повторяется автоматически: перезапускайте вручную.

## Краткая шпаргалка для других цепочек
- Поставить задание: `infrastructure/vds-runner/run-remote.sh <job> --worktree <путь-к-своему-worktree>` (job: `unit`, `api-e2e`, `web-build`, `docker-build`).
- Общая блокировка: все скрипты, ходящие на VDS (`run-remote.sh`, `cdn/install-cdn.sh`, `cdn/sync-cdn.sh`, `test-website/push-release.sh`, `release.sh`),
  берут одну блокировку `twomc-vds.lock` (каталог `$TEMP/twomc-vds.lock`; в Git Bash `$TEMP` обычно даёт путь вида `/tmp/twomc-vds.lock`). Ручной ssh/scp - только через
  `infrastructure/vds-runner/with-vds-lock.sh <команда...>` или `vds_ssh_script` из `lib/vds-ssh.sh`.
- Результаты: `<out>/summary.txt` (итог и числа), `<out>/job.log` (полный лог), `<out>/result.env` (`EXIT=<код>`). Не коммитить. Статус потерянного задания: `run-remote.sh --attach <id>`.
- Кто ходит: только назначенный специалист (один исполнитель за раз), без секретов в командах и выводе, без production twomc.su; `.env*`, `~/.twomc` и
  `/home/twomc/test-website-credentials.txt` не читать. Python и docker локально не запускаются: тяжёлое идёт на VDS.

## Откат стенда test-website
Стенд (`/srv/twomc-stand`) выкладывает `infrastructure/test-website/release.sh` (внутри `push-release.sh` + `deploy-stand.sh <sha12>` на сервере).
Откат образов и кода - повторный запуск `deploy-stand.sh` с предыдущим sha; каталог `releases/<prev-sha>` и его образы остаются до ручного удаления:
```bash
# под блокировкой; sha12 предыдущего выпуска смотрите в ls -t /srv/twomc-stand/releases
infrastructure/vds-runner/with-vds-lock.sh ssh -i ~/.ssh/twomc_giveaway_vds -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  twomc@31.76.77.45 '/srv/twomc-stand/ops/deploy-stand.sh <prev-sha12>'
```
Схема БД стенда НЕ откатывается (только `migrate deploy` вперёд): откат на sha со старой схемой допустим лишь для expand-миграций. Затем проверка health стенда (см. `docs/runbooks/test-website-stand.md`).
Откат CDN: `cdn-setup.sh` сам возвращает прежний nginx-конфиг при падении `nginx -t` (код 20). Ручной откат: удалить `/etc/nginx/conf.d/cdn-files.conf`, `nginx -t`, `systemctl reload nginx`;
файлы `/srv/cdn-files` и бэкапы `/srv/backups/cdn-files` остаются (подробности - `docs/runbooks/cdn.md`).

## Типичные сбои
| Симптом | Причина и действие |
|---|---|
| код 255, `Permission denied` / `Connection timed out` | сбой входа или fail2ban. НЕ повторять в цикле; доложить chief, проверить ключ `~/.ssh/twomc_giveaway_vds` и `known_hosts` (StrictHostKeyChecking=yes) |
| `vds-lock: ожидание другого исполнителя` | идёт чужая операция; ждать (до 600 с). Мёртвая блокировка снимается сама; руками `rm -rf` не трогать чужую живую |
| `vds-lock: не удалось получить блокировку` | таймаут: владелец жив; повторить позже, не удалять каталог (потолок 6 ч снимет только совсем зависшую) |
| код 70 | тайм-аут ожидания, задание на сервере продолжает работу: `run-remote.sh --attach <id>` |
| `Недопустимый аргумент` / `Недопустимый id` | аргументы ограничены `[A-Za-z0-9._:/=,@+-]`; кириллица, пробелы, кавычки в аргументах не допускаются |
| `jest ... signal=SIGKILL` | OOM воркеров, не ошибка теста; не снимать `--maxWorkers=3` |
| `exit=99` в `result.env` | worker потерян посреди задания; перезапустить задание |
| падение на `docker run` при первом запуске | недоступно зеркало ECR образа node:20-bookworm; повторить позже |
| `Другой деплой уже выполняется` | flock стенда; дождаться окончания деплоя |
| `Мало места на диске` / нет RAM и swap | перед сборкой стенда освободить диск (`cleanup.sh` раннера), проверить swap |
| `install-cdn.sh` код 10 | DNS `cdn-files.twomc.su` не указывает на VDS: блокер владельца, certbot не запускается |
| `install-cdn.sh` код 20 | `nginx -t` не прошёл, прежний конфиг восстановлен; смотреть вывод `nginx -t` |
