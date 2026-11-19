# MASTER-PROMPT 16.1 — розыгрыш «Анархия Новой Эры», фаза 1, работа 1 (бэкенд)

Источник: `docs/agent-prompts/16-GIVEAWAY-NEW-ERA.md`. Раздел ниже сохранён дословно из handoff Backend Lead.

ОБЛАСТЬ ЗАПИСИ:
- apps/api/src/modules/giveaway/** (новый модуль) + тесты модуля;
- apps/api/src/app.module.ts — только подключение модуля; env.validation.ts — только добавление ключей GIVEAWAY_*;
- apps/api/prisma/schema.prisma — только новые модели; одна новая миграция apps/api/prisma/migrations/<timestamp>_giveaway_phase1/migration.sql (expand-only, SQL вручную, Q43a);
- apps/api/scripts/ — одна утилита выдачи ключа сервера (если там лежат аналогичные скрипты Bridge; иначе в модуле);
- giveaway/README.md (кратко: что в папке), giveaway/docs/ADR-G001-session-time-counting.md (решения + контракт подписи и событий для плагина — по нему будет писаться плагин), giveaway/docs/MASTER-PROMPT-16.1.md (сохрани раздел «ТРЕБОВАНИЯ» ниже дословно до конца этого handoff). (Папка giveaway/ — в корне worktree, если не окажется иное в 16-GIVEAWAY-NEW-ERA.md; либо внутри модуля — выбери по источнику.)

ТРЕБОВАНИЯ:
1. Флаг GIVEAWAY_ENABLED (по умолчанию выкл.). Без флага или без GIVEAWAY_MASTER_SECRET — 503 fail-closed, как приёмник Bridge.
2. POST /api/giveaway/v1/events, сырое тело, HMAC-SHA256 по каноничной строке (timestamp, nonce, метод, путь, sha256 тела), окно ±300 с, nonce одноразовый в Redis (TTL ≥ 2× окна), ключ на сервер = HKDF(GIVEAWAY_MASTER_SECRET, id сервера, версия ключа); ротация — принимаются текущая и предыдущая версия. Переиспользуй паттерны apps/api/src/modules/bridge (bridge-crypto, bridge-signature.guard, bridge-body-parser, bridge-redis.service, bridge.config) — импортом или копией в giveaway, Bridge НЕ менять. Сервер не из разрешённых — 403. Лимит запросов на сервер. Сравнение подписи — timing-safe.
3. Пакет ≤ 100 событий: join, quit, heartbeat; поля eventId (UUID, идемпотентность), type, playerUuid, playerName, occurredAt (UTC ISO), active (для heartbeat: игрок не-AFK последнюю минуту). occurredAt в будущем > 120 с или старше 72 ч — отклонить событие (плагин досылает локальную очередь в этих пределах). Валидация схемы строгая.
4. Подсчёт (рекомендация chief; отклонение — с обоснованием в ADR): минута-корзина (playerUuid, floor(occurredAt до минуты)) по heartbeat с active=true; уникальность пары — идемпотентность и слияние пересечений между серверами без двойного счёта. Итог игрока = число корзин в окне [startAt, cutoffAt]. join/quit — журнал сессий. AFK = 5 мин без движения/чата/команды/взаимодействия (определяет плагин, в ADR описать).
5. Настройки: порог 50 ч (3000 мин), startAt 22.11.2026 00:00 МСК, cutoffAt 30.12.2026 23:59:59 МСК, timezone Europe/Moscow, список разрешённых серверов. Хранить UTC, вычислять даты в МСК, отображаемые строки «по МСК». После старта порог можно только понижать (проверка в сервисе + тест). Админ-интерфейса в фазе 1 нет: сервис + значения по умолчанию (из конфига/env), без seed.
6. Утилита ключа сервера: мастер-секрет из окружения, выведенный ключ — в файл с правами только владельца, в stdout/логи ключ не выводится.
7. Логи без ключей, подписей, IP игроков.

ЗАПРЕТЫ: не удалять и не переписывать существующий код; не трогать Bridge, прочие модули, .github/workflows, lockfile, pnpm-зависимости (никаких установок), чужие незакоммиченные файлы, docs/reports/QUESTIONS-FOR-OWNER.md (допущения верни списком). Без push/PR/merge/rebase/reset/clean (публикует chief), без деплоя, без чтения .env* и C:\Users\younaxo\.twomc\secrets, без python, без stdin-ожидающих команд, без завершения чужих процессов, не трогать контейнеры twomc-su-postgres/twomc-su-redis и порт 6379, не удалять scratchpad/heavy-run.lock. Привязку к сайту и страницы web не делать. e2e не запускать (Docker не запущен, ОЗУ ~1.4 ГБ), только unit. Миграцию НЕ применять и не запускать migrate/seed (Q28): только написать SQL вручную, expand-only (никаких DROP/RENAME/сужения), он пойдёт на независимое ревью.

ПРОВЕРКИ: prisma generate, затем tsc --noEmit для apps/api, jest только по apps/api/src/modules/giveaway. Фактический вывод — в отчёт.

COMPLETION: коммит(ы) в feature/giveaway-phase1 с трейлером «Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>»; рабочее дерево чистое (git status в worktree).

ИТОГ (<= 25 строк): статус; хэши коммитов; файлы; проверки (числа PASS/FAIL); контракт для плагина — одной ссылкой на ADR; допущения для QUESTIONS (списком); риски (в т. ч. online-mode/подмена ника); блокеры.
