# 42 — Технический долг

## CRITICAL
- Seed с hardcoded OWNER-паролями в production-пути (`seed.ts`) — 29-SECURITY S1.
- `mock-complete` и вся платёжная логика на моках (`orders.service.ts:183, 328`, `/store/mock-payment`) — S2.
## HIGH
- Бан не отзывает сессии / `refresh` без проверки бана — S3. Reset-пароля без доставки (`auth.service.ts:261`) — S4.
- Нет тестов (0 `*.spec.ts` / `*.test.ts`) и CI. Нет Dockerfile для api/web.
- RBAC на `RoleGroup` (10-RBAC-PERMISSIONS.md A.4).
- Аудит покрывает 21 из 186 staff-мутаций (25-AUDIT-LOG.md).
## MEDIUM
- Заглушки интеграций: `reports.service.ts:369–394` (6 TODO: TigerReports/LiteBans sync); модели `GameReport`, `GamePunishment` — STUB («placeholder until bridge is wired»).
- `auth.service.ts:467` — «TODO: apply the actual discount once the store module exists».
- `store/currencies.service.ts:92` — «TODO: wire to real currency balances in economy stage».
- Модель `ChatMessageReaction` — UNUSED (комментарий в схеме: реакции убраны из продукта; таблица оставлена).
- Страницы-заглушки: `/wiki`, `/support/faq`, `/reports` (TODO в исходнике).
- `apps/web/src/lib/todos.ts` (`FUTURE_FEATURE_TODOS`): Marketplace/Аукцион, верификация Minecraft-ника, streaming по слову «twomc.su», главный стрим; форум «не делаем».
- Файлы-планы без реализации: `apps/api/src/modules/BATTLEPASS_TODO.md` (Battle Pass: модели и страницы не созданы), `apps/api/src/modules/admin/BAN_SYSTEM_TODO.md` (не разбирался).
- Throttler in-memory; cron без distributed lock; `trust proxy`.
- Конфиг: нет валидации env.
## LOW
- `@deprecated`: `SkinHead.tsx` (online ring), `packages/shared/src/report.ts:215` (поле заменено `targets`).
- Admin-меню захардкожено (33 пункта), роль-гейты `/admin` = ADMIN, `/dashboard` = OWNER дублируют друг друга (`/dashboard/*` и `/admin/*` частично покрывают одни сущности: store stats, loyalty, currencies, audit-log).
- Один `PhoneField` с маской только `+7`.
- `docker-compose`: TODO tune autovacuum.
- Не выявлялись: дублирование логики, мёртвый код, расхождения shared/DTO — требуют отдельного прохода.
