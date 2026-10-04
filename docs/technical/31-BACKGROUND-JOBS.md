# 31 — Фоновые процессы

Планировщик: `@nestjs/schedule` (`ScheduleModule.forRoot()` в `app.module.ts`). Найдено `@Cron`: **12**. `@Interval`/`@Timeout`: не найдено. Очередей (BullMQ и т.п.) нет. Distributed locking **отсутствует**: при запуске нескольких инстансов API каждый cron выполнится на каждом инстансе. Retry-логики на уровне планировщика нет (ошибка внутри метода логируется/теряется до следующего тика).

| Schedule | Method | Source | Purpose (по имени метода; детали читать в коде) |
|---|---|---|---|
| `'0 * * * *'` | `checkAllUsersCron()` | `achievements/achievements.service.ts:536` | периодическая проверка достижений всех пользователей (`AchievementsService`) |
| `EVERY_HOUR` | `runDueScheduledExports()` | `admin/admin-tools.service.ts:215` | запуск запланированных экспортов (`/admin/exports/scheduled`) |
| `EVERY_DAY_AT_4AM` | `cleanupOld()` | `admin/audit.service.ts:119` | удаляет `AuditLog` старше **90 дней** (retention) |
| `'0 0 * * * *'` | `sendReminders()` | `events/events.service.ts:214` | напоминания о событиях (`Event`), раз в час в :00:00 |
| `'*/30 * * * * *'` | `checkAllServers()` | `minecraft/monitoring.service.ts:19` | опрос всех Minecraft-серверов (`minecraft-server-util`), snapshot в Redis, запись `ServerStatusLog`; защита от наложения `this.checking` (in-process) |
| `EVERY_DAY_AT_3AM` | `cleanupOldLogs()` | `minecraft/monitoring.service.ts:41` | удаляет `ServerStatusLog` старше **30 дней** |
| `EVERY_MINUTE` | `publishScheduled()` | `news/news.service.ts:628` | публикует новости с отложенной публикацией |
| `EVERY_HOUR` | `processHourly()` | `notifications/digest.cron.ts:16` | email-дайджест: почасовой |
| `EVERY_DAY_AT_9AM` | `processDailyFallback()` | `notifications/digest.cron.ts:21` | email-дайджест: дневной (fallback в 9:00) |
| `EVERY_WEEK` | `processWeekly()` | `notifications/digest.cron.ts:26` | email-дайджест: недельный |
| `EVERY_MINUTE` | `processDailyByDigestTime()` | `notifications/digest.cron.ts:31` | email-дайджест: дневной по персональному времени пользователя |
| `EVERY_5_MINUTES` | `refresh()` | `streaming/streaming.service.ts:83` | обновление статусов стримов (Twitch/YouTube API) |

## Наблюдения
- Единственная защита от наложения — флаг `this.checking` в `MonitoringService` (работает только внутри одного процесса).
- Retention: `ServerStatusLog` — 30 дней, `AuditLog` — 90 дней (жёстко в коде, не настраивается).
- Зависимости: PostgreSQL (все), Redis (monitoring), внешние API (Twitch/YouTube для streaming, SMTP для digest).
- Failure behaviour: исключение внутри cron-метода не повторяется до следующего тика; метрик/алертов на падение jobs нет.
