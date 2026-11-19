# giveaway — разовый розыгрыш «Анархия Новой Эры»

Всё, что относится к розыгрышу и не является кодом сайта. Источник: `docs/agent-prompts/16-GIVEAWAY-NEW-ERA.md`.

## Что где лежит

- `docs/ADR-G001-session-time-counting.md` — решения по подсчёту времени и контракт для плагина (подпись, события).
- `docs/MASTER-PROMPT-16.1.md` — задание фазы 1, работа 1 (бэкенд).
- Бэкенд: `apps/api/src/modules/giveaway/` (модуль, выключен флагом `GIVEAWAY_ENABLED`).
- Миграция: `apps/api/prisma/migrations/20261119120000_giveaway_phase1/` (expand-only, ждёт ревью; на production применяет владелец).
- Утилита ключа сервера: `apps/api/scripts/giveaway-server-key.ts`.
- Плагин (`giveaway/plugin`), мини-выкладка (docker compose, nginx) — отдельные работы, пока не добавлены.

## Как запустить бэкенд

Окружение: `GIVEAWAY_ENABLED=true`, `GIVEAWAY_MASTER_SECRET` (не короче 32 байт, задаёт владелец), `GIVEAWAY_ALLOWED_SERVERS=<id сервера>`. Остальные ключи `GIVEAWAY_*` необязательны (см. ADR). Без флага или секрета приёмник отвечает 503.

Ключ сервера для плагина (в файл, не в консоль):
`GIVEAWAY_MASTER_SECRET=... npx ts-node scripts/giveaway-server-key.ts --server-id <id> --version 1 --out <файл>` (из `apps/api`).

Тесты: `npx jest src/modules/giveaway` (из `apps/api`).
