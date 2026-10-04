# 25 — Audit Log

Модель: `AuditLog` (`audit_logs`): `id`, `actorId` (FK → `User`, **обязателен**), `action String`, `targetType?`, `targetId?`, `changes Json?`, `ipAddress?`, `userAgent?`, `severity String @default("info")` (`info|warning|critical`), `duration Int?`, `createdAt`. Индексы: `actorId`, `action`, `severity`, `createdAt`.
Сервис: `AuditService` (`apps/api/src/modules/admin/audit.service.ts`): `log(input)` — **ошибка записи проглатывается** (`logger.warn`), т.е. аудит не гарантирован; `list({page,limit≤100,action,actorId,severity,targetType,q,from,to})`; cron `cleanupOld()` в 04:00 удаляет записи старше **90 дней** (retention жёстко в коде).
Endpoints: см. 04-API-REFERENCE.md (`/admin/audit-log*`; Min RoleGroup и proposed permission `audit_log.view|stats|export`).

## Что логируется сейчас (21 вызов `audit.log` в 6 файлах)
Файлы: `admin/admin.controller.ts`, `admin/admin-users.service.ts`, `moderation/quick-moderation.service.ts`, `minecraft/admin-servers.controller.ts`, `minecraft/server-categories.controller.ts`, `reports/reports.service.ts`.
Действия (`action`): `user.warn`, `user.mute`, `user.kick`, `user.ban`, `user.delete`, `user.change-role`, `settings.update`, `server.create|update|delete`, `server_category.create|update|delete`, `report.archive|unarchive|delete`, `report.message.delete`, `notification.broadcast`, `message.hard-delete`, `comment.hard-delete`.

## Покрытие
Staff-мутаций (POST/PATCH/PUT/DELETE с `@Roles`): **186**; вызовов audit: **21**. Без audit остаются целиком: `store` (25 мутаций: товары, категории, бандлы, скидки, промокоды, валюты, заказы, возвраты), `news` (11), `forms` (11), `topics` (8), `achievements` (7), `departments`, `custom-positions`, `positions`, `awards`, `decorations`, `emojis`, `events`, `voting`, `streaming`, `activity`, `export`, `system/maintenance`, `chat` (каналы/настройки). Массовый бан в `AdminUsersService.bulk` — проверить, что логируется на каждого пользователя.

## Обязательные новые действия (REQUIRED)
`role.create|update|delete`, `role.permissions.update`, `role.assign|revoke`, `user.ban|unban|delete` (включая bulk — по записи на цель), `order.refund|cancel`, `finance.export`, `store.product.*|category.*|bundle.*|promocode.*|discount.*|currency.*`, `settings.update` (с diff в `changes`), `server.*`, `moderation.*`, `file.delete` (при появлении модели файлов), `auth.session.revoke_all`, `bootstrap.account.create`. Рекомендация: писать audit **в той же транзакции**, что и мутация, и сделать падение записи ошибкой для severity `critical`.
