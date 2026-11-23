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
| `unit` | `pnpm install --frozen-lockfile`, `pnpm -r typecheck` (tsc), jest api, vitest web | 4 CPU, 6 ГБ |
| `api-e2e` | одноразовые postgres 16 + redis 7 (уникальные имена, своя docker-сеть, tmpfs, без публикации портов), prisma validate, `migrate deploy`, seed, `test:e2e` api как в CI | node 4 CPU / 6 ГБ, pg 1 CPU / 1 ГБ, redis 0.5 CPU / 256 МБ |
| `web-build` | `pnpm --filter "@twomc/web..." build` (next build с зависимостями) | 4 CPU, 8 ГБ |
| `docker-build` | сборка образов api и web по `infrastructure/*.Dockerfile` (образы после сборки удаляются) | 8 ГБ, cpu-shares 256 |

Снимок кода: `--ref` - `git archive` коммита (только tracked). `--worktree` - tracked и неотслеживаемые не игнорируемые файлы рабочей копии
с незакоммиченными правками, без `.env*`, `node_modules`, `.next`, `dist`, `.turbo`, `coverage`, `*.tsbuildinfo`, ключей, `credentials*`, `secrets*`.
Секреты на сервер не уходят; пароли БД, JWT и ключ 2FA для e2e генерируются на сервере на каждый запуск и живут только в одноразовых контейнерах.

## Правила доступа к VDS
- Только `twomc@31.76.77.45`, ключ `~/.ssh/twomc_giveaway_vds`, `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes`.
- Глобальная локальная блокировка `%TEMP%/twomc-vds.lock` (каталог-mkdir, файл `owner` с pid и временем): два исполнителя не открывают SSH одновременно.
  Мёртвая (pid не существует) и просроченная (старше 900 с) блокировка снимается автоматически. Блокировка держится только на время одной операции scp/ssh, а не всего ожидания.
- Сбой входа не повторяется: скрипт завершается (код 255). Остановитесь и разберитесь (fail2ban: игнорируется наш IP, но не ломайте систему повторами).
- Для сторонних скриптов (`release.sh` стенда и др.): `infrastructure/vds-runner/with-vds-lock.sh infrastructure/test-website/release.sh origin/main`;
  скриптам, которые сами вызывают ssh, достаточно `source infrastructure/vds-runner/lib/vds-ssh.sh` и вызывать `vds_ssh_script`/`vds_scp_put`.
  `sync-cdn.sh` и `install-cdn.sh` уже используют этот хелпер. Встроить блокировку внутрь `infrastructure/test-website/push-release.sh` (обернуть его вызов `ssh`
  в `vds_locked`) - отдельная правка вне области этой задачи: до неё запускайте релиз стенда через `with-vds-lock.sh`.

## Как устроен сервер
```
/srv/twomc-runner/
  queue/<id>/      ожидающие задания (meta.env, code.tar.gz); постановка атомарным mv
  running/<id>/    выполняется (job.log)
  done/<id>/       result.env, summary.txt, job.log (исходники удаляются сразу)
  ops/<hash>/      неизменяемая копия скриптов раннера версии, с которой пришло задание (worker.sh, lib.sh, jobs/*.sh, cleanup.sh)
  cache/           pnpm-store, corepack, home (общий кеш: повторные install быстрые)
  worker.lock      flock: один worker; worker.log
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
- `--worktree` берёт неотслеживаемые не игнорируемые файлы: не кладите секреты в корень проекта без `.gitignore`.
