# PHASE 22 — Audit log (обязательные события, retention)

Ветка `feature/audit-log`. Цель: полное ретроактивное покрытие staff-мутаций
всех доменов и управляемая ретенция (docs/technical/25-AUDIT-LOG.md).

## Реализовано

- `modules/audit/` (глобальный `AuditModule`): `AuditService` перенесён из
  `admin/`, `AuditInterceptor` зарегистрирован как `APP_INTERCEPTOR`.
- **Автоматический audit** (ADR-0056): каждая успешная мутация
  (POST/PATCH/PUT/DELETE) на хендлере с `@RequirePermissions` пишет запись:
  `action` = ключ permission (`store.products.create`, `roles.delete`,
  `permissions.manage`…), `targetType` = модуль ключа, `targetId` — из
  параметров маршрута (`id`/`userId`/`roleId`/`username`/`slug`) либо `id`
  результата, `changes` — тело запроса без секретов (`password`/`secret`/
  `token`/`*key`/`captcha` → `[скрыто]`, длинные строки обрезаны, лимит
  4 КБ), `ipAddress`, `userAgent`, `duration`. Неудачные запросы (4xx/5xx)
  не логируются.
- **Уровни:** `critical` — `permissions.manage`, `security.ip_whitelist.*`,
  `settings.*`, `roles.delete|assign`, `users.delete`; `warning` —
  `*.delete|ban|unban|refund|cancel|reorder`, прочие `roles.*`; остальное —
  `info`. Для `critical` ошибка записи не проглатывается.
- **`@SkipAudit()`** — у хендлеров с собственным обогащённым логированием
  (broadcast, KV-settings, site settings с diff, ip-whitelist, bulk-бан по
  каждой цели), чтобы не дублировать записи.
- **Ретенция:** `AUDIT_RETENTION_DAYS` (ENV, по умолчанию 90, валидируется
  Joi), очистка ежедневно в 04:00 таймером процесса (`unref`, в test
  отключена; внешний планировщик — PHASE 29). `cleanupOld(days?)`.
- Покрытие: ~186 staff-мутаций (store, news, forms, topics, achievements,
  departments, positions, awards, events, voting, streaming, chat, minecraft,
  roles, users…) без правок в их контроллерах.

## Тесты

`test/audit.e2e-spec.ts` (реальные Postgres+Redis): создание роли через
API → `roles.create` с `targetId` созданной роли, `changes`, IP, duration;
удаление → `critical` и видно в `GET /admin/audit-log`; 403 не логируется;
sanitize/severity юнит-проверки; ретенция удаляет старые записи и сохраняет
свежие. Регресс — `roles` и `admin` сьюты.

## Не входит

- Audit в той же транзакции, что и мутация (требует переписывания сервисов;
  текущая модель — запись после успешного ответа).
- Внешний cron и distributed lock для очистки — PHASE 29.
