# Q48 и Q49: единое правило снятия санкции для всех путей (ADR-0173)

## 1. Результат

Статус: DONE (код и документы), PARTIAL по проверкам: e2e и миграция не запускались (Q28, Q43). Единое правило снятия санкции применено ко всем путям: чат (мут, бан), бан аккаунта, массовое снятие, бан в обращениях. Закрыт R38. Ветка `fix/q48-unban-hierarchy-all` от `f03a0d2`; push, PR, merge не выполнялись.

Правило (порядок проверок): 1) владелец (`Role.isSuperuser`) всегда, в т.ч. с себя; 2) выдавший неизвестен (нет записи, удалён, SYSTEM) -> только владелец; 3) цель = действующий, выдал не он -> запрет; 4) сам выдавший -> можно; 5) иначе приоритет действующего >= приоритета выдавшего. Отказ — 403 `sanction_revoke_forbidden`.

## 2. Коммиты

- 9cf4b8b К1: единое правило в `PermissionService`, чат приведён к нему.
- 895b554 К2: колонка `users.bannedById`, миграция, бан и снятие бана аккаунта.
- bb52cd3 К3: бан в обращениях, `@SkipAudit()`, аудит.
- К4: e2e, ADR-0173, CHANGELOG, RISKS, runbook, технические документы, этот отчёт (SHA в handback).

## 3. Пути: было -> стало -> аудит

| Путь                                              | Было                                                             | Стало                                                                                                                                         | Аудит                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `DELETE /admin/chat/mutes/:id` (unmute)           | правило Q25, неизвестный выдавший -> порог «максимум приоритета» | `assertCanRevokeSanction`; неизвестный -> только владелец; владелец снимает с себя                                                            | `chat.mute.revoke` (ModerationService), `@SkipAudit()` на хендлере |
| `DELETE /admin/chat/bans/:id` (unban)             | то же                                                            | то же                                                                                                                                         | `chat.ban.revoke`, `@SkipAudit()`                                  |
| `PATCH /admin/users/bulk` `UNBAN`                 | любой держатель `users.bulk.edit` + `canActOn`                   | `canActOn` (для владельца на себя не применяется) + правило в `QuickModerationService.unban`; отказ по одному -> `failed` с `reason` и `code` | `user.unban` (один раз, внутри `unban`; дубль в bulk убран)        |
| Бан аккаунта (`QuickModerationService.ban/unban`) | выдавший не хранился, снимал любой                               | `ban` пишет `bannedById`; `unban(targetId, actorId)` проверяет правило, очищает `bannedById`                                                  | `user.unban`                                                       |
| `DELETE /admin/reports/ban/:userId`               | снимался любой активный бан без проверок                         | правило для КАЖДОГО активного `ReportBan` (по `bannedBy`), «всё или ничего»                                                                   | `reports.ban.revoke` на каждый бан, `@SkipAudit()` на хендлере     |

`changes` аудита: `issuerId` (или «нет записи»), `ownerOverride`, `self`, плюс `userId` для `ReportBan`. При отказе (403) запись не пишется.

## 4. Миграция целиком

`apps/api/prisma/migrations/20261117000000_user_banned_by/migration.sql`:

```sql
-- Q48, ADR-0173: кто выдал бан аккаунта. Только добавление (expand-only):
-- одна nullable-колонка без значения по умолчанию, без FK и индекса.
-- У уже выданных банов значение остаётся NULL — снять такой бан сможет
-- только владелец. Колонка не читается по значению в запросах, индекс не нужен.

ALTER TABLE "users" ADD COLUMN "bannedById" TEXT;
```

В `schema.prisma` добавлено только `bannedById String?` в модель `User`. Миграция не применялась (ни локально, ни на production).

## 5. Итоговый код правила

`apps/api/src/modules/roles/permission.service.ts`: `evaluateSanctionRevoke(actorId, issuerId, targetUserId?)` возвращает `{ allowed, ownerOverride, self, issuerKnown }`; `assertCanRevokeSanction` бросает `ForbiddenException({ code: 'sanction_revoke_forbidden', message })`; публичный `canRevokeSanction(actorId, issuerId, targetUserId?)` возвращает `allowed`. Ядро:

```ts
const self = targetUserId !== undefined && targetUserId === actorId;
if (await this.isSuperuser(actorId)) {
  return {
    allowed: true,
    ownerOverride: !issuerId || issuerId !== actorId,
    self,
    issuerKnown: Boolean(issuerId),
  };
}
const issuer = issuerId
  ? await this.prisma.user.findUnique({
      where: { id: issuerId },
      select: { id: true, accountType: true },
    })
  : null;
// ...
if (!issuer || issuer.accountType === 'SYSTEM') return deny;
if (self && issuer.id !== actorId) return deny;
if (issuer.id === actorId) return { ...deny, allowed: true };
const [actorPriority, issuerPriority] = await Promise.all([
  this.getMaxPriority(actorId),
  this.getMaxPriority(issuer.id),
]);
return { ...deny, allowed: actorPriority >= issuerPriority };
```

## 6. Проверка дублей `audit.interceptor.ts`

`AuditInterceptor` пишет запись с ключом права на каждый DELETE с `@RequirePermissions`. Поэтому `@SkipAudit()` добавлен на `unmute`, `unban` (чат, `admin-chat.controller.ts`) и `unbanUser` (`reports-admin.controller.ts`); `PATCH /admin/users/bulk` уже был с `@SkipAudit()`. Итог: одна запись на снятие, без дубля интерцептора.

## 7. Автоснятие по `bannedUntil`

В коде автоснятия нет: `bannedUntil` читается только для чата (`chat.service.ts`, `OR: bannedUntil null / > now`) и отдаётся при входе; `isBanned` аккаунта не сбрасывается ни планировщиком, ни входом. Поведение не менялось. Если автоснятие появится, оно не действие актора (правило не применяется), но должно очищать `bannedById`. R43.

## 8. FK

Колонка `TEXT NULL` без FK и индекса: у `ChatBan.bannedBy`, `ReportBan.bannedBy`, `UserPunishment.issuedBy` FK тоже нет (единообразие); FK `SET NULL` требует self-relation и обратного поля в `User` (сверх «одной колонки»); удалённый выдавший обрабатывается кодом как «неизвестный» (только владелец), то есть поведение при SET NULL и при «висячем» id одинаково; запросов по колонке нет.

## 9. Bulk

Правило проверяется на каждого пользователя; отказ по одному не валит пакет, он попадает в `failed` с `reason` и необязательным `code` (`sanction_revoke_forbidden`). Владелец на самого себя при `UNBAN`: `canActOn` не применяется, иначе Q49 не выполнялся бы. Контракт ответа расширен обратно-совместимо (новое необязательное поле), `04-API-REFERENCE.md` обновлён.

## 10. ReportBan: семантика «всё или ничего»

Если хоть один активный бан снимать нельзя, ответ 403 и ни один бан не снимается. Причины: частичное снятие оставило бы пользователя в промежуточном состоянии, а младший смог бы снять часть банов старшего, выбирая порядок вызовов. Повторный `banUser` (замена баном) правилом не покрыт: R41.

## 11. Проверки

- `tsc --noEmit` api (tsconfig без include, `test/` входит): 0 ошибок; packages/shared: 0 ошибок.
- api `jest --runInBand`: 53 набора, 517 тестов, все PASS (в К1-К3 добавлены тесты в `permission.service.spec.ts`, `moderation.service.spec.ts`, `quick-moderation.service.spec.ts`, `admin-users-bulk.service.spec.ts`, новый `reports-admin.unban.spec.ts`).
- eslint и prettier: на всех изменённых `.ts` (включая `test/unban-hierarchy.e2e-spec.ts`) и `.md`: чисто.
- e2e `apps/api/test/unban-hierarchy.e2e-spec.ts` (статически, не запускался): младший не снимает бан аккаунта старшего (код в `failed`), старший-выдавший снимает, аудит с `issuerId`; старый бан без выдавшего — старший не снимает, владелец снимает (`issuerId: 'нет записи'`, `ownerOverride`); самоснятие не-владельца бана в обращениях -> 403; младший не снимает, старший снимает бан в обращениях (аудит `reports.ban.revoke`); владелец снимает с себя -> 200, аудит `self: true`.
- Не выполнялось: e2e, prisma migrate/db/seed, БД, Docker, web-проверки (web не менялся).

## 12. Риски и блокеры

- R42: старые баны снимает только владелец; порядок миграция -> деплой; код до миграции падает на `bannedById`.
- R41: замена бана в обращениях не покрыта правилом. R43: автоснятия нет, самоснятие бана аккаунта недостижимо (забаненный не проходит `JwtStrategy`).
- Блокеров нет. Решение владельца: по R41 (нужно ли запретить замену бана старшего).

## 13. Миграции для обязательного ревью (Q28)

1. `apps/api/prisma/migrations/20261117000000_user_banned_by/migration.sql` — `ALTER TABLE "users" ADD COLUMN "bannedById" TEXT;` (expand-only, nullable, без FK и индекса, данные не трогает). Применяет только владелец; на локальной одноразовой БД агентом не применялась.
