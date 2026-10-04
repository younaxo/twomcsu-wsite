# 04 — API Reference

> Документ сгенерирован из исходного кода (`@Controller` / `@Get` / `@Post` / `@Put` / `@Patch` / `@Delete`). Каждый endpoint снабжён ссылкой `файл:строка`. Поля, которые нельзя вывести статически без чтения сервиса (точный формат ответа, полный список ошибок), помечены `см. сервис`. Ничего не выдумано.

## Статистика (контрольные числа)

| Показатель | Значение |
|---|---|
| Контроллерных классов (`@Controller`) | **73** |
| Всего HTTP endpoints | **497** |
| GET | **202** |
| POST | **147** |
| PUT | **3** |
| PATCH | **72** |
| DELETE | **73** |
| WebSocket namespaces | **3** (`chat`, `messages`, `notifications`) |
| WebSocket client→server events (`@SubscribeMessage`) | **19** (chat 10, messages 9, notifications 0) |

## Глобальная конфигурация API

- Global prefix: **нет** (`apps/api/src/main.ts` не вызывает `setGlobalPrefix`). Пути вида `/auth/login`, не `/api/auth/login`. Frontend ходит напрямую на `NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:4000`).
- Versioning: **нет**.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — лишние поля в body/query → 400.
- `helmet({ crossOriginResourcePolicy: cross-origin })`, `cookieParser()`, CORS: `origin = WEB_ORIGIN`, `credentials: true`.
- Глобальные `APP_GUARD`: `ThrottlerGuard` (default: 100 запросов / 60 с на клиента). Глобальный `APP_INTERCEPTOR`: `LastActivityInterceptor` (обновляет `User.lastActivityAt`).
- **Глобального `JwtAuthGuard` нет**: аутентификация включается на каждом контроллере/методе через `@UseGuards(JwtAuthGuard)`; endpoint без guard — публичный.
- Статика: `UPLOADS_DIR` отдаётся Express-static по `UPLOADS_ROUTE` с `maxAge: 7d` (локальное хранилище, см. 26-CDN-FILES.md).
- Формат ошибки: стандартный Nest `{ statusCode, message, error }` (message может быть массивом строк от `class-validator`). Единого кастомного filter нет.

## Условные обозначения
- **Auth**: `public` / `optional` (`OptionalJwtAuthGuard`) / `required` (`JwtAuthGuard`) / `NONE` (guard отсутствует — фактически публичный).
- **Min RoleGroup**: значение `@Roles(RoleGroup.X)` (X и выше; иерархия PLAYER<HELPER<MODERATOR<ADMIN<OWNER). `-` = ограничения по роли нет (проверки владения — внутри сервиса).
- **Proposed permission**: предлагаемый ключ новой RBAC (см. 10-RBAC-PERMISSIONS.md); присутствует только у staff-endpoints.


---

# Модуль `achievements`

## Controller `AchievementsController` — prefix `/achievements`
`achievements/achievements.controller.ts:22`  |  class decorators: `—`

### GET `/achievements`

- Handler: `AchievementsController.list()` — `achievements/achievements.controller.ts:26`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `AchievementCategory`, `AchievementRarity`, `AchievementFilter`, `string`
- Service call: `achievements.getAllAchievements()`
- Response type: `Promise<AchievementWithProgress[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/achievements/stats`

- Handler: `AchievementsController.stats()` — `achievements/achievements.controller.ts:45`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `achievements.getStats()`
- Response type: `Promise<AchievementsStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/achievements/:slug`

- Handler: `AchievementsController.bySlug()` — `achievements/achievements.controller.ts:50`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `achievements.getAchievementBySlug()`
- Response type: `Promise<AchievementDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminAchievementsController` — prefix `/admin/achievements`
`achievements/admin-achievements.controller.ts:29`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/achievements`

- Handler: `AdminAchievementsController.list()` — `achievements/admin-achievements.controller.ts:35`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.view`
- Service call: `achievements.listAdmin()`
- Response type: `Promise<Achievement[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/achievements`

- Handler: `AdminAchievementsController.create()` — `achievements/admin-achievements.controller.ts:40`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.create`
- Body DTO: `CreateAchievementDto`
- Service call: `achievements.create()`
- Response type: `Promise<Achievement>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/achievements/:id`

- Handler: `AdminAchievementsController.update()` — `achievements/admin-achievements.controller.ts:46`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.edit`
- Path params: `id`
- Body DTO: `UpdateAchievementDto`
- Service call: `achievements.update()`
- Response type: `Promise<Achievement>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/achievements/:id`

- Handler: `AdminAchievementsController.remove()` — `achievements/admin-achievements.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.delete`
- Path params: `id`
- Service call: `achievements.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/achievements/upload-icon`

- Handler: `AdminAchievementsController.uploadIcon()` — `achievements/admin-achievements.controller.ts:60`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.upload_icon.create`
- Upload: multipart (Multer interceptor)
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/achievements/check-all-users`

- Handler: `AdminAchievementsController.checkAll()` — `achievements/admin-achievements.controller.ts:76`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `achievements.check_all_users.create`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ModerationAchievementsController` — prefix `/moderation/users`
`achievements/moderation-achievements.controller.ts:16`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.MODERATOR)`

### POST `/moderation/users/:userId/achievements/:achievementId/grant`

- Handler: `ModerationAchievementsController.grant()` — `achievements/moderation-achievements.controller.ts:22`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.achievements.grant`
- Path params: `userId`, `achievementId`
- Service call: `achievements.grantAchievement()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/users/:userId/achievements/:achievementId`

- Handler: `ModerationAchievementsController.revoke()` — `achievements/moderation-achievements.controller.ts:31`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.achievements`
- Path params: `userId`, `achievementId`
- Service call: `achievements.revokeAchievement()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `UserAchievementsController` — prefix `/`
`achievements/user-achievements.controller.ts:19`  |  class decorators: `—`

### GET `/users/me/achievements`

- Handler: `UserAchievementsController.myAchievements()` — `achievements/user-achievements.controller.ts:23`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `achievements.getUserAchievements()`
- Response type: `Promise<UserAchievementsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/achievements`

- Handler: `UserAchievementsController.byUsername()` — `achievements/user-achievements.controller.ts:29`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `achievements.getUserAchievementsByUsername()`
- Response type: `Promise<UserAchievementsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/me/achievements/showcase`

- Handler: `UserAchievementsController.setShowcase()` — `achievements/user-achievements.controller.ts:38`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `SetShowcaseDto`
- Service call: `achievements.setShowcase()`
- Response type: `Promise<UserAchievementsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/me/achievements/showcase/:achievementId`

- Handler: `UserAchievementsController.removeShowcase()` — `achievements/user-achievements.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `achievementId`
- Service call: `achievements.removeFromShowcase()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `activity`

## Controller `ActivityAdminController` — prefix `/admin/activity`
`activity/activity-admin.controller.ts:25`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/activity/stats`

- Handler: `ActivityAdminController.stats()` — `activity/activity-admin.controller.ts:31`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `activity.stats`
- Service call: `activity.getStats()`
- Response type: `Promise<ActivityStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/activity`

- Handler: `ActivityAdminController.list()` — `activity/activity-admin.controller.ts:36`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `activity.view`
- Query DTO: `AdminListActivityQueryDto`
- Service call: `activity.adminList()`
- Response type: `Promise<PaginatedResponse<ActivityItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/activity/custom`

- Handler: `ActivityAdminController.custom()` — `activity/activity-admin.controller.ts:43`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `activity.custom.create`
- Body DTO: `CreateCustomActivityDto`
- Service call: `activity.createCustom()`
- Response type: `Promise<ActivityItem | null>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ActivityModerationController` — prefix `/moderation/activity`
`activity/activity-moderation.controller.ts:19`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.MODERATOR)`

### DELETE `/moderation/activity/comments/:id`

- Handler: `ActivityModerationController.deleteComment()` — `activity/activity-moderation.controller.ts:25`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `activity.comments.delete`
- Path params: `id`
- Service call: `activity.deleteComment()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/activity/:id/pin`

- Handler: `ActivityModerationController.pin()` — `activity/activity-moderation.controller.ts:34`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `activity.pin`
- Path params: `id`
- Service call: `activity.pinActivity()`
- Response type: `Promise<ActivityItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/activity/:id/pin`

- Handler: `ActivityModerationController.unpin()` — `activity/activity-moderation.controller.ts:40`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `activity.pin`
- Path params: `id`
- Service call: `activity.pinActivity()`
- Response type: `Promise<ActivityItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/activity/:id`

- Handler: `ActivityModerationController.hide()` — `activity/activity-moderation.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `activity.delete`
- Path params: `id`
- Body DTO: `HideActivityDto`
- Service call: `activity.hideActivity()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ActivityController` — prefix `/activity`
`activity/activity.controller.ts:34`  |  class decorators: `—`

### GET `/activity/feed`

- Handler: `ActivityController.feed()` — `activity/activity.controller.ts:38`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ListActivityFeedQueryDto`
- Service call: `activity.getFeed()`
- Response type: `Promise<PaginatedResponse<ActivityItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/activity/feed/user/:username`

- Handler: `ActivityController.userFeed()` — `activity/activity.controller.ts:47`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Query DTO: `ListActivityFeedQueryDto`
- Service call: `activity.getUserFeed()`
- Response type: `Promise<PaginatedResponse<ActivityItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/activity/feed/global-highlights`

- Handler: `ActivityController.highlights()` — `activity/activity.controller.ts:57`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ActivityHighlightsQueryDto`
- Service call: `activity.getHighlights()`
- Response type: `Promise<ActivityItem[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/activity/settings`

- Handler: `ActivityController.settings()` — `activity/activity.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `activity.getSettings()`
- Response type: `Promise<ActivityFeedSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/activity/settings`

- Handler: `ActivityController.updateSettings()` — `activity/activity.controller.ts:78`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateActivitySettingsDto`
- Service call: `activity.updateSettings()`
- Response type: `Promise<ActivityFeedSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/activity/:id`

- Handler: `ActivityController.byId()` — `activity/activity.controller.ts:87`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `activity.getById()`
- Response type: `Promise<ActivityDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/activity/:id/reactions`

- Handler: `ActivityController.react()` — `activity/activity.controller.ts:96`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `ActivityReactionDto`
- Throttle: @Throttle({ default: { limit: 30, ttl: 60_000 } })
- Service call: `activity.toggleReaction()`
- Response type: `Promise<ActivityItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/activity/:id/comments`

- Handler: `ActivityController.addComment()` — `activity/activity.controller.ts:108`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `CreateActivityCommentDto`
- Throttle: @Throttle({ default: { limit: 20, ttl: 60_000 } })
- Service call: `activity.addComment()`
- Response type: `Promise<ActivityDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/activity/comments/:id`

- Handler: `ActivityController.deleteComment()` — `activity/activity.controller.ts:119`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `activity.deleteComment()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `admin`

## Controller `AdminPanelController` — prefix `/admin`
`admin/admin-panel.controller.ts:127`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/users`

- Handler: `AdminPanelController.listUsers()` — `admin/admin-panel.controller.ts:139`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.view`
- Query DTO: `string`, `string`, `string`, `string`, `string`, `string`, `string`, `string`, `string`, `string`
- Service call: `users.listUsers()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/users/bulk`

- Handler: `AdminPanelController.bulkUsers()` — `admin/admin-panel.controller.ts:172`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.bulk.edit`
- Body DTO: `BulkUsersDto`
- Service call: `users.bulkUpdate()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/users/:id/full`

- Handler: `AdminPanelController.userFull()` — `admin/admin-panel.controller.ts:177`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.full`
- Path params: `id`
- Service call: `users.getUserFull()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/saved-filters`

- Handler: `AdminPanelController.savedFilters()` — `admin/admin-panel.controller.ts:185`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `saved_filters.view`
- Query DTO: `string`
- Service call: `tools.listSavedFilters()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/saved-filters`

- Handler: `AdminPanelController.createSavedFilter()` — `admin/admin-panel.controller.ts:190`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `saved_filters.create`
- Body DTO: `SavedFilterDto`
- Service call: `tools.createSavedFilter()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/saved-filters/:id`

- Handler: `AdminPanelController.updateSavedFilter()` — `admin/admin-panel.controller.ts:198`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `saved_filters.edit`
- Path params: `id`
- Body DTO: `Partial<SavedFilterDto>`
- Service call: `tools.updateSavedFilter()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/saved-filters/:id`

- Handler: `AdminPanelController.deleteSavedFilter()` — `admin/admin-panel.controller.ts:211`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `saved_filters.delete`
- Path params: `id`
- Service call: `tools.deleteSavedFilter()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/bookmarks`

- Handler: `AdminPanelController.bookmarks()` — `admin/admin-panel.controller.ts:217`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `bookmarks.view`
- Service call: `tools.listBookmarks()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/bookmarks`

- Handler: `AdminPanelController.createBookmark()` — `admin/admin-panel.controller.ts:222`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `bookmarks.create`
- Body DTO: `BookmarkDto`
- Service call: `tools.createBookmark()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/bookmarks/:id`

- Handler: `AdminPanelController.updateBookmark()` — `admin/admin-panel.controller.ts:227`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `bookmarks.edit`
- Path params: `id`
- Body DTO: `Partial<BookmarkDto>`
- Service call: `tools.updateBookmark()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/bookmarks/:id`

- Handler: `AdminPanelController.deleteBookmark()` — `admin/admin-panel.controller.ts:236`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `bookmarks.delete`
- Path params: `id`
- Service call: `tools.deleteBookmark()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/bookmarks/reorder`

- Handler: `AdminPanelController.reorderBookmarks()` — `admin/admin-panel.controller.ts:241`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `bookmarks.reorder`
- Service call: `tools.reorderBookmarks()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/exports/scheduled`

- Handler: `AdminPanelController.scheduledExports()` — `admin/admin-panel.controller.ts:250`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `exports.scheduled.view`
- Service call: `tools.listScheduledExports()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/exports/scheduled`

- Handler: `AdminPanelController.createScheduled()` — `admin/admin-panel.controller.ts:255`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `exports.scheduled.create`
- Body DTO: `ScheduledExportDto`
- Service call: `tools.createScheduledExport()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/exports/scheduled/:id`

- Handler: `AdminPanelController.updateScheduled()` — `admin/admin-panel.controller.ts:266`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `exports.scheduled.edit`
- Path params: `id`
- Body DTO: `Partial<ScheduledExportDto`
- Service call: `tools.updateScheduledExport()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/exports/scheduled/:id`

- Handler: `AdminPanelController.deleteScheduled()` — `admin/admin-panel.controller.ts:282`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `exports.scheduled.delete`
- Path params: `id`
- Service call: `tools.deleteScheduledExport()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/settings/site`

- Handler: `AdminPanelController.siteSettings()` — `admin/admin-panel.controller.ts:288`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `settings.site.view`
- Service call: `tools.getSiteSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/settings/site`

- Handler: `AdminPanelController.updateSiteSettings()` — `admin/admin-panel.controller.ts:293`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `settings.site.edit`
- Body DTO: `Record<string`
- Service call: `tools.updateSiteSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/security/sessions`

- Handler: `AdminPanelController.sessions()` — `admin/admin-panel.controller.ts:302`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `security.sessions.view`
- Query DTO: `string`
- Service call: `tools.listActiveSessions()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/security/suspicious`

- Handler: `AdminPanelController.suspicious()` — `admin/admin-panel.controller.ts:311`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `security.suspicious.view`
- Service call: `tools.listSuspiciousActivity()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/security/logins`

- Handler: `AdminPanelController.logins()` — `admin/admin-panel.controller.ts:316`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `security.logins.view`
- Query DTO: `string`
- Service call: `tools.listLoginHistory()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/security/ip-whitelist`

- Handler: `AdminPanelController.ipWhitelist()` — `admin/admin-panel.controller.ts:325`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `security.ip_whitelist.create`
- Body DTO: `IpWhitelistDto`
- Service call: `tools.updateIpWhitelist()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/content/dashboard`

- Handler: `AdminPanelController.contentDashboard()` — `admin/admin-panel.controller.ts:331`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `content.view`
- Service call: `finance.getContentDashboard()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/finance/overview`

- Handler: `AdminPanelController.financeOverview()` — `admin/admin-panel.controller.ts:337`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `finance.overview.view`
- Service call: `finance.getFinanceOverview()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/finance/transactions`

- Handler: `AdminPanelController.financeTransactions()` — `admin/admin-panel.controller.ts:342`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `finance.transactions.view`
- Query DTO: `OrderStatus`, `string`, `string`, `string`
- Service call: `finance.listTransactions()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/finance/refunds`

- Handler: `AdminPanelController.financeRefunds()` — `admin/admin-panel.controller.ts:361`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `finance.refunds.view`
- Service call: `finance.listRefunds()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/finance/export`

- Handler: `AdminPanelController.financeExport()` — `admin/admin-panel.controller.ts:369`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `finance.export`
- Service call: `exportService.exportOrders()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminController` — prefix `/admin`
`admin/admin.controller.ts:81`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/dashboard`

- Handler: `AdminController.getDashboard()` — `admin/admin.controller.ts:91`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `misc.view`
- Service call: `dashboard.getDashboard()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/audit-log`

- Handler: `AdminController.auditLog()` — `admin/admin.controller.ts:96`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `audit_log.view`
- Query DTO: `string`, `string`, `string`, `string`, `string`, `string`, `string`
- Service call: `audit.list()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/audit-log/stats`

- Handler: `AdminController.auditStats()` — `admin/admin.controller.ts:121`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `audit_log.stats`
- Service call: `statistics.getAuditLogStats()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/broadcast`

- Handler: `AdminController.broadcast()` — `admin/admin.controller.ts:128`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `broadcast.create`
- Body DTO: `BroadcastDto`
- Service call: `dashboard.broadcast()`, `audit.log()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/settings`

- Handler: `AdminController.getSettings()` — `admin/admin.controller.ts:142`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `settings.view`
- Service call: `dashboard.getSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/settings`

- Handler: `AdminController.updateSettings()` — `admin/admin.controller.ts:147`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `settings.edit`
- Body DTO: `UpsertSettingsDto`
- Service call: `dashboard.getSettings()`, `dashboard.upsertSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `auth`

## Controller `AuthController` — prefix `/auth`
`auth/auth.controller.ts:41`  |  class decorators: `—`

### POST `/auth/register`

- Handler: `AuthController.register()` — `auth/auth.controller.ts:48`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `RegisterDto`
- Throttle: @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
- Service call: `authService.register()`
- Response type: `Promise<RegisterResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/login`

- Handler: `AuthController.login()` — `auth/auth.controller.ts:61`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `LoginDto`
- Throttle: @Throttle({ default: { limit: 10, ttl: 60_000 } })
- Service call: `authService.login()`
- Response type: `Promise<LoginResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/refresh`

- Handler: `AuthController.refresh()` — `auth/auth.controller.ts:78`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `RefreshDto`
- Throttle: @Throttle({ default: { limit: 20, ttl: 60_000 } })
- Service call: `authService.refresh()`
- Response type: `Promise<RefreshResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/forgot-password`

- Handler: `AuthController.forgotPassword()` — `auth/auth.controller.ts:92`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `ForgotPasswordDto`
- Throttle: @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
- Service call: `authService.forgotPassword()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/reset-password`

- Handler: `AuthController.resetPassword()` — `auth/auth.controller.ts:107`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `ResetPasswordDto`
- Throttle: @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
- Service call: `authService.resetPassword()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/change-password`

- Handler: `AuthController.changePassword()` — `auth/auth.controller.ts:119`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `ChangePasswordDto`
- Throttle: @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
- Service call: `authService.changePassword()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/auth/sessions`

- Handler: `AuthController.listSessions()` — `auth/auth.controller.ts:135`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `authService.listSessions()`
- Response type: `Promise<SessionInfo[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/auth/sessions`

- Handler: `AuthController.revokeAllSessions()` — `auth/auth.controller.ts:144`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `authService.revokeAllSessions()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/auth/sessions/:id`

- Handler: `AuthController.revokeSession()` — `auth/auth.controller.ts:155`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `authService.revokeSession()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/auth/logout`

- Handler: `AuthController.logout()` — `auth/auth.controller.ts:165`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/auth/me`

- Handler: `AuthController.me()` — `auth/auth.controller.ts:178`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `authService.findById()`
- Response type: `Promise<PublicUser>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `awards`

## Controller `AwardsController` — prefix `/`
`awards/awards.controller.ts:22`  |  class decorators: `—`

### GET `/awards`

- Handler: `AwardsController.listPublic()` — `awards/awards.controller.ts:26`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `awards.listPublic()`
- Response type: `Promise<Award[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/awards`

- Handler: `AwardsController.listAdmin()` — `awards/awards.controller.ts:31`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `awards.view`
- Service call: `awards.listAdmin()`
- Response type: `Promise<Award[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/awards`

- Handler: `AwardsController.create()` — `awards/awards.controller.ts:38`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `awards.create`
- Body DTO: `CreateAwardDto`
- Service call: `awards.create()`
- Response type: `Promise<Award>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/awards/:id`

- Handler: `AwardsController.update()` — `awards/awards.controller.ts:46`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `awards.edit`
- Path params: `id`
- Body DTO: `UpdateAwardDto`
- Service call: `awards.update()`
- Response type: `Promise<Award>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/awards/:id`

- Handler: `AwardsController.remove()` — `awards/awards.controller.ts:53`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `awards.delete`
- Path params: `id`
- Service call: `awards.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/awards/:awardId`

- Handler: `AwardsController.assign()` — `awards/awards.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.awards`
- Path params: `userId`, `awardId`
- Service call: `awards.assign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/users/:userId/awards/:awardId`

- Handler: `AwardsController.revoke()` — `awards/awards.controller.ts:73`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.awards`
- Path params: `userId`, `awardId`
- Service call: `awards.revoke()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `chat`

## Controller `AdminChatController` — prefix `/admin/chat`
`chat/admin-chat.controller.ts:27`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### POST `/admin/chat/channels`

- Handler: `AdminChatController.createChannel()` — `chat/admin-chat.controller.ts:37`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.channels.create`
- Body DTO: `CreateChannelDto`
- Service call: `channels.create()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/chat/channels/:id`

- Handler: `AdminChatController.updateChannel()` — `chat/admin-chat.controller.ts:43`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.channels.edit`
- Path params: `id`
- Body DTO: `UpdateChannelDto`
- Service call: `channels.update()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/chat/channels/:id`

- Handler: `AdminChatController.deleteChannel()` — `chat/admin-chat.controller.ts:48`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.channels.delete`
- Path params: `id`
- Service call: `channels.remove()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/chat/mutes`

- Handler: `AdminChatController.listMutes()` — `chat/admin-chat.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.mutes.view`
- Service call: `moderation.listMutes()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/chat/mutes/:id`

- Handler: `AdminChatController.unmute()` — `chat/admin-chat.controller.ts:59`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.mutes.delete`
- Path params: `id`
- Service call: `moderation.unmute()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/chat/bans`

- Handler: `AdminChatController.listBans()` — `chat/admin-chat.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.bans.view`
- Service call: `moderation.listBans()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/chat/bans/:id`

- Handler: `AdminChatController.unban()` — `chat/admin-chat.controller.ts:69`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.bans.delete`
- Path params: `id`
- Service call: `moderation.unban()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/chat/messages/search`

- Handler: `AdminChatController.search()` — `chat/admin-chat.controller.ts:74`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.messages.search.view`
- Query DTO: `string`
- Service call: `messages.search()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/chat/messages/:id`

- Handler: `AdminChatController.getMessage()` — `chat/admin-chat.controller.ts:82`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.messages.view`
- Path params: `id`
- Service call: `messages.getById()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/chat/settings`

- Handler: `AdminChatController.getSettings()` — `chat/admin-chat.controller.ts:87`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.settings.view`
- Service call: `moderation.getSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/chat/settings`

- Handler: `AdminChatController.updateSettings()` — `chat/admin-chat.controller.ts:92`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `chat.settings.edit`
- Body DTO: `ChatSettingsDto`
- Service call: `moderation.updateSettings()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ChatController` — prefix `/chat`
`chat/chat.controller.ts:15`  |  class decorators: `—`

### GET `/chat/channels`

- Handler: `ChatController.listChannels()` — `chat/chat.controller.ts:22`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `channels.listActive()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/chat/channels/:slug`

- Handler: `ChatController.getChannel()` — `chat/chat.controller.ts:27`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `channels.getBySlug()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/chat/channels/:slug/messages`

- Handler: `ChatController.getMessages()` — `chat/chat.controller.ts:32`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Query DTO: `string`
- Service call: `messages.getHistory()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/chat/channels/:slug/online`

- Handler: `ChatController.getOnline()` — `chat/chat.controller.ts:43`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `channels.getBySlug()`, `messages.getOnlineUsers()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/chat/channels/:slug/pinned`

- Handler: `ChatController.getPinned()` — `chat/chat.controller.ts:49`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `messages.getPinned()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `comments`

## Controller `CommentsController` — prefix `/users/:username/comments`
`comments/comments.controller.ts:43`  |  class decorators: `—`

### GET `/users/:username/comments`

- Handler: `CommentsController.list()` — `comments/comments.controller.ts:47`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Query DTO: `string`
- Service call: `comments.getComments()`
- Response type: `Promise<ProfileCommentsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/comments`

- Handler: `CommentsController.create()` — `comments/comments.controller.ts:66`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Body DTO: `CreateCommentDto`
- Service call: `comments.createComment()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/:username/comments/:id`

- Handler: `CommentsController.update()` — `comments/comments.controller.ts:77`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Body DTO: `UpdateCommentDto`
- Service call: `comments.updateComment()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/:username/comments/:id`

- Handler: `CommentsController.remove()` — `comments/comments.controller.ts:88`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Body DTO: `DeleteCommentDto`
- Service call: `comments.deleteComment()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/comments/:id/pin`

- Handler: `CommentsController.pin()` — `comments/comments.controller.ts:100`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Service call: `comments.pinComment()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/comments/:id/unpin`

- Handler: `CommentsController.unpin()` — `comments/comments.controller.ts:111`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Service call: `comments.unpinComment()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/comments/:id/reactions`

- Handler: `CommentsController.addReaction()` — `comments/comments.controller.ts:122`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Body DTO: `AddCommentReactionDto`
- Service call: `comments.addReaction()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/:username/comments/:id/reactions/:emoji`

- Handler: `CommentsController.removeReaction()` — `comments/comments.controller.ts:134`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`, `emoji`
- Service call: `comments.removeReaction()`
- Response type: `Promise<ProfileComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/comments/:id/report`

- Handler: `CommentsController.report()` — `comments/comments.controller.ts:146`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`, `id`
- Body DTO: `ReportCommentDto`
- Service call: `comments.reportComment()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminCommentsController` — prefix `/admin`
`comments/comments.controller.ts:159`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.MODERATOR)`

### POST `/admin/users/:userId/comments/disable`

- Handler: `AdminCommentsController.disable()` — `comments/comments.controller.ts:165`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.comments.disable`
- Path params: `userId`
- Body DTO: `ForceDisableCommentsDto`
- Service call: `comments.forceDisableComments()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/comments/enable`

- Handler: `AdminCommentsController.enable()` — `comments/comments.controller.ts:175`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.comments.enable`
- Path params: `userId`
- Service call: `comments.forceEnableComments()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/comment-reports`

- Handler: `AdminCommentsController.listReports()` — `comments/comments.controller.ts:184`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `comment_reports.view`
- Query DTO: `string`
- Service call: `comments.listCommentReports()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/comment-reports/:id`

- Handler: `AdminCommentsController.reviewReport()` — `comments/comments.controller.ts:198`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `comment_reports.edit`
- Path params: `id`
- Body DTO: `ReviewCommentReportDto`
- Service call: `comments.reviewCommentReport()`
- Response type: `Promise<CommentReport>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/comments/:id`

- Handler: `AdminCommentsController.hardDelete()` — `comments/comments.controller.ts:207`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `comments.delete`
- Path params: `id`
- Service call: `comments.hardDeleteComment()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `consent`

## Controller `ConsentController` — prefix `/users/me/consent`
`consent/consent.controller.ts:21`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/users/me/consent`

- Handler: `ConsentController.get()` — `consent/consent.controller.ts:26`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `consent.get()`
- Response type: `Promise<CookieConsentRecord | null>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PUT `/users/me/consent`

- Handler: `ConsentController.save()` — `consent/consent.controller.ts:31`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateConsentDto`
- Service call: `consent.save()`
- Response type: `Promise<CookieConsentRecord>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `custom-positions`

## Controller `CustomPositionsController` — prefix `/`
`custom-positions/custom-positions.controller.ts:23`  |  class decorators: `—`

### GET `/custom-positions`

- Handler: `CustomPositionsController.listPublic()` — `custom-positions/custom-positions.controller.ts:27`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `customPositions.listPublic()`
- Response type: `Promise<CustomPosition[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/custom-positions`

- Handler: `CustomPositionsController.listAdmin()` — `custom-positions/custom-positions.controller.ts:32`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `custom_positions.view`
- Service call: `customPositions.listAdmin()`
- Response type: `Promise<CustomPosition[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/custom-positions`

- Handler: `CustomPositionsController.create()` — `custom-positions/custom-positions.controller.ts:39`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `custom_positions.create`
- Body DTO: `CreateCustomPositionDto`
- Service call: `customPositions.create()`
- Response type: `Promise<CustomPosition>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/custom-positions/:id`

- Handler: `CustomPositionsController.update()` — `custom-positions/custom-positions.controller.ts:50`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `custom_positions.edit`
- Path params: `id`
- Body DTO: `UpdateCustomPositionDto`
- Service call: `customPositions.update()`
- Response type: `Promise<CustomPosition>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/custom-positions/:id`

- Handler: `CustomPositionsController.remove()` — `custom-positions/custom-positions.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `custom_positions.delete`
- Path params: `id`
- Service call: `customPositions.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/custom-position`

- Handler: `CustomPositionsController.assign()` — `custom-positions/custom-positions.controller.ts:65`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `users.custom_position`
- Path params: `userId`
- Body DTO: `AssignCustomPositionDto`
- Service call: `customPositions.assign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/users/:userId/custom-position`

- Handler: `CustomPositionsController.unassign()` — `custom-positions/custom-positions.controller.ts:77`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `users.custom_position`
- Path params: `userId`
- Service call: `customPositions.unassign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `decorations`

## Controller `DecorationsController` — prefix `/decorations`
`decorations/decorations.controller.ts:11`  |  class decorators: `—`

### GET `/decorations`

- Handler: `DecorationsController.catalog()` — `decorations/decorations.controller.ts:15`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `decorations.catalog()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/decorations/mine`

- Handler: `DecorationsController.mine()` — `decorations/decorations.controller.ts:21`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `decorations.owned()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/decorations/user/:username/selected`

- Handler: `DecorationsController.selectedForUser()` — `decorations/decorations.controller.ts:27`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `decorations.selectedForUser()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/decorations/selected`

- Handler: `DecorationsController.select()` — `decorations/decorations.controller.ts:32`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `SelectDecorationDto`
- Service call: `decorations.select()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminDecorationsController` — prefix `/admin/decorations`
`decorations/decorations.controller.ts:39`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/decorations`

- Handler: `AdminDecorationsController.catalog()` — `decorations/decorations.controller.ts:45`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `decorations.view`
- Service call: `decorations.adminCatalog()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/decorations/ownerships`

- Handler: `AdminDecorationsController.ownerships()` — `decorations/decorations.controller.ts:48`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `decorations.ownerships.view`
- Query DTO: `string`
- Service call: `decorations.userOwnerships()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/decorations/grant`

- Handler: `AdminDecorationsController.grant()` — `decorations/decorations.controller.ts:51`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `decorations.grant`
- Body DTO: `GrantDecorationDto`
- Service call: `decorations.grant()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/decorations/:decorationId/users/:userId`

- Handler: `AdminDecorationsController.revoke()` — `decorations/decorations.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `decorations.users`
- Path params: `decorationId`, `userId`
- Service call: `decorations.revoke()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/decorations/:id`

- Handler: `AdminDecorationsController.update()` — `decorations/decorations.controller.ts:62`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `decorations.edit`
- Path params: `id`
- Body DTO: `UpdateDecorationDto`
- Service call: `decorations.update()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `departments`

## Controller `DepartmentsController` — prefix `/`
`departments/departments.controller.ts:24`  |  class decorators: `—`

### GET `/departments`

- Handler: `DepartmentsController.listPublic()` — `departments/departments.controller.ts:28`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `departments.listPublic()`
- Response type: `Promise<Department[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/departments`

- Handler: `DepartmentsController.listAdmin()` — `departments/departments.controller.ts:33`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `departments.view`
- Service call: `departments.listAdmin()`
- Response type: `Promise<Department[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/departments`

- Handler: `DepartmentsController.create()` — `departments/departments.controller.ts:40`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `departments.create`
- Body DTO: `CreateDepartmentDto`
- Service call: `departments.create()`
- Response type: `Promise<Department>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/departments/:id`

- Handler: `DepartmentsController.update()` — `departments/departments.controller.ts:51`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `departments.edit`
- Path params: `id`
- Body DTO: `UpdateDepartmentDto`
- Service call: `departments.update()`
- Response type: `Promise<Department>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/departments/:id`

- Handler: `DepartmentsController.remove()` — `departments/departments.controller.ts:58`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `departments.delete`
- Path params: `id`
- Service call: `departments.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/departments`

- Handler: `DepartmentsController.assign()` — `departments/departments.controller.ts:66`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.departments`
- Path params: `userId`
- Body DTO: `AssignDepartmentDto`
- Service call: `departments.assign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/users/:userId/departments/:departmentId`

- Handler: `DepartmentsController.unassign()` — `departments/departments.controller.ts:78`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.departments`
- Path params: `userId`, `departmentId`
- Service call: `departments.unassign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/users/:userId/departments/order`

- Handler: `DepartmentsController.reorder()` — `departments/departments.controller.ts:89`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.departments.order.edit`
- Path params: `userId`
- Body DTO: `ReorderDepartmentsDto`
- Service call: `departments.reorder()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `direct-messages`

## Controller `DirectMessagesController` — prefix `/messages`
`direct-messages/direct-messages.controller.ts:37`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/messages/conversations`

- Handler: `DirectMessagesController.list()` — `direct-messages/direct-messages.controller.ts:45`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `messages.listConversations()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/conversations/:id`

- Handler: `DirectMessagesController.getConversation()` — `direct-messages/direct-messages.controller.ts:50`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `messages.getConversation()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/direct`

- Handler: `DirectMessagesController.createDirect()` — `direct-messages/direct-messages.controller.ts:55`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateDirectConversationDto`
- Service call: `messages.createDirect()`, `gateway.syncConversationRooms()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/group`

- Handler: `DirectMessagesController.createGroup()` — `direct-messages/direct-messages.controller.ts:62`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateGroupConversationDto`
- Service call: `messages.createGroup()`, `gateway.syncConversationRooms()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/messages/conversations/:id`

- Handler: `DirectMessagesController.updateConversation()` — `direct-messages/direct-messages.controller.ts:69`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `UpdateConversationDto`
- Service call: `messages.updateConversation()`, `gateway.emitConversationChanged()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/conversations/:id/messages`

- Handler: `DirectMessagesController.getMessages()` — `direct-messages/direct-messages.controller.ts:80`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Query DTO: `string`
- Service call: `messages.getMessages()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/:id/messages`

- Handler: `DirectMessagesController.sendMessage()` — `direct-messages/direct-messages.controller.ts:90`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `SendDirectMessageDto`
- Service call: `messages.sendMessage()`, `gateway.emitNewMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/:id/messages/upload`

- Handler: `DirectMessagesController.sendAttachment()` — `direct-messages/direct-messages.controller.ts:101`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `string`, `string`
- Upload: multipart (Multer interceptor)
- Service call: `messages.sendAttachment()`, `gateway.emitNewMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/messages/messages/:messageId`

- Handler: `DirectMessagesController.editMessage()` — `direct-messages/direct-messages.controller.ts:116`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `messageId`
- Body DTO: `EditDirectMessageDto`
- Service call: `messages.editMessage()`, `gateway.emitUpdatedMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/messages/messages/:messageId`

- Handler: `DirectMessagesController.deleteMessage()` — `direct-messages/direct-messages.controller.ts:127`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `messageId`
- Service call: `messages.deleteMessage()`, `gateway.emitUpdatedMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/messages/:messageId/reactions`

- Handler: `DirectMessagesController.react()` — `direct-messages/direct-messages.controller.ts:135`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `messageId`
- Body DTO: `ReactToDirectMessageDto`
- Service call: `messages.toggleReaction()`, `gateway.emitUpdatedMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/:id/read`

- Handler: `DirectMessagesController.markRead()` — `direct-messages/direct-messages.controller.ts:146`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `MarkConversationReadDto`
- Service call: `messages.markRead()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/:id/members`

- Handler: `DirectMessagesController.addMember()` — `direct-messages/direct-messages.controller.ts:157`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `AddConversationMemberDto`
- Service call: `messages.addMember()`, `gateway.syncConversationRooms()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/messages/conversations/:id/members/:memberId`

- Handler: `DirectMessagesController.removeMember()` — `direct-messages/direct-messages.controller.ts:168`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`, `memberId`
- Service call: `messages.removeMember()`, `gateway.emitConversationChanged()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/messages/conversations/:id/members/:memberId`

- Handler: `DirectMessagesController.updateMemberRole()` — `direct-messages/direct-messages.controller.ts:179`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`, `memberId`
- Body DTO: `UpdateConversationMemberDto`
- Service call: `messages.updateMemberRole()`, `gateway.emitConversationChanged()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/conversations/:id/invites`

- Handler: `DirectMessagesController.listInvites()` — `direct-messages/direct-messages.controller.ts:191`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `messages.listInvites()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/conversations/:id/invites`

- Handler: `DirectMessagesController.createInvite()` — `direct-messages/direct-messages.controller.ts:196`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `CreateGroupInviteDto`
- Service call: `messages.createInvite()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/messages/conversations/:id/invites/:code`

- Handler: `DirectMessagesController.revokeInvite()` — `direct-messages/direct-messages.controller.ts:205`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`, `code`
- Service call: `messages.revokeInvite()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/invites/:code`

- Handler: `DirectMessagesController.previewInvite()` — `direct-messages/direct-messages.controller.ts:214`
- Authentication: **public**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `code`
- Service call: `messages.previewInvite()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/messages/invites/:code/join`

- Handler: `DirectMessagesController.joinInvite()` — `direct-messages/direct-messages.controller.ts:220`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `code`
- Service call: `messages.joinInvite()`, `gateway.syncConversationRooms()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/privacy`

- Handler: `DirectMessagesController.getPrivacy()` — `direct-messages/direct-messages.controller.ts:227`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `messages.getPrivacy()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/messages/privacy`

- Handler: `DirectMessagesController.updatePrivacy()` — `direct-messages/direct-messages.controller.ts:232`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateDirectMessagePrivacyDto`
- Service call: `messages.updatePrivacy()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/messages/gift-fee/:username`

- Handler: `DirectMessagesController.giftFee()` — `direct-messages/direct-messages.controller.ts:237`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `messages.giftFee()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `emojis`

## Controller `AdminEmojisController` — prefix `/admin/emojis`
`emojis/admin-emojis.controller.ts:27`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/emojis`

- Handler: `AdminEmojisController.listAll()` — `emojis/admin-emojis.controller.ts:33`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `emojis.view`
- Service call: `emojis.listAll()`
- Response type: `Promise<CustomEmoji[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/emojis`

- Handler: `AdminEmojisController.create()` — `emojis/admin-emojis.controller.ts:38`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `emojis.create`
- Body DTO: `CreateEmojiDto`
- Upload: multipart (Multer interceptor)
- Service call: `emojis.create()`
- Response type: `Promise<CustomEmoji>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/emojis/:id`

- Handler: `AdminEmojisController.update()` — `emojis/admin-emojis.controller.ts:59`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `emojis.edit`
- Path params: `id`
- Body DTO: `UpdateEmojiDto`
- Upload: multipart (Multer interceptor)
- Service call: `emojis.update()`
- Response type: `Promise<CustomEmoji>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/emojis/:id`

- Handler: `AdminEmojisController.remove()` — `emojis/admin-emojis.controller.ts:79`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `emojis.delete`
- Path params: `id`
- Service call: `emojis.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `EmojisController` — prefix `/emojis/custom`
`emojis/emojis.controller.ts:7`  |  class decorators: `—`

### GET `/emojis/custom`

- Handler: `EmojisController.list()` — `emojis/emojis.controller.ts:11`
- Authentication: **public**
- Min RoleGroup: `-`
- Service call: `emojis.listActive()`
- Response type: `Promise<CustomEmoji[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/emojis/custom/search`

- Handler: `EmojisController.search()` — `emojis/emojis.controller.ts:17`
- Authentication: **public**
- Min RoleGroup: `-`
- Query DTO: `SearchEmojisDto`
- Service call: `emojis.search()`
- Response type: `Promise<CustomEmoji[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `events`

## Controller `EventsController` — prefix `/events`
`events/events.controller.ts:12`  |  class decorators: `—`

### GET `/events`

- Handler: `EventsController.list()` — `events/events.controller.ts:16`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ListEventsQueryDto`
- Service call: `events.list()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/events/featured`

- Handler: `EventsController.featured()` — `events/events.controller.ts:22`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `events.featured()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/events/mine`

- Handler: `EventsController.mine()` — `events/events.controller.ts:26`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `events.my()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/events/:slug`

- Handler: `EventsController.bySlug()` — `events/events.controller.ts:30`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `events.bySlug()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/events/:id/attendance`

- Handler: `EventsController.attend()` — `events/events.controller.ts:36`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `EventAttendanceDto`
- Service call: `events.attend()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/events/:id/attendance`

- Handler: `EventsController.leave()` — `events/events.controller.ts:42`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `events.leave()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminEventsController` — prefix `/admin/events`
`events/events.controller.ts:50`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/events`

- Handler: `AdminEventsController.list()` — `events/events.controller.ts:55`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.view`
- Service call: `events.adminList()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/events`

- Handler: `AdminEventsController.create()` — `events/events.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.create`
- Body DTO: `CreateEventDto`
- Service call: `events.create()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/events/:id`

- Handler: `AdminEventsController.update()` — `events/events.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.edit`
- Path params: `id`
- Body DTO: `UpdateEventDto`
- Service call: `events.update()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/events/:id/publish`

- Handler: `AdminEventsController.publish()` — `events/events.controller.ts:58`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.publish`
- Path params: `id`
- Service call: `events.setStatus()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/events/:id/cancel`

- Handler: `AdminEventsController.cancel()` — `events/events.controller.ts:59`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.cancel`
- Path params: `id`
- Service call: `events.setStatus()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/events/:id`

- Handler: `AdminEventsController.remove()` — `events/events.controller.ts:60`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `events.delete`
- Path params: `id`
- Service call: `events.remove()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `export`

## Controller `ExportController` — prefix `/admin`
`export/export.controller.ts:125`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### POST `/admin/users/export`

- Handler: `ExportController.exportUsers()` — `export/export.controller.ts:131`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.export`
- Body DTO: `ExportUsersDto`
- Service call: `exportService.exportUsers()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/orders/export`

- Handler: `ExportController.exportOrders()` — `export/export.controller.ts:147`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `orders.export`
- Body DTO: `ExportOrdersDto`
- Service call: `exportService.exportOrders()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/reports/export`

- Handler: `ExportController.exportReports()` — `export/export.controller.ts:161`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.export`
- Body DTO: `ExportReportsDto`
- Service call: `exportService.exportReports()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/export`

- Handler: `ExportController.exportNews()` — `export/export.controller.ts:175`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.export`
- Body DTO: `ExportNewsDto`
- Service call: `exportService.exportNews()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/audit-log/export`

- Handler: `ExportController.exportAudit()` — `export/export.controller.ts:188`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `audit_log.export`
- Body DTO: `ExportAuditDto`
- Service call: `exportService.exportAuditLog()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `forms`

## Controller `FormsAdminController` — prefix `/admin/forms`
`forms/forms-admin.controller.ts:36`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/forms`

- Handler: `FormsAdminController.list()` — `forms/forms-admin.controller.ts:46`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.view`
- Query DTO: `ListFormsQueryDto`
- Service call: `forms.listAdmin()`
- Response type: `Promise<PaginatedResult<FormSummary>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/templates`

- Handler: `FormsAdminController.listTemplates()` — `forms/forms-admin.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.templates.view`
- Service call: `forms.listTemplates()`
- Response type: `Promise<FormSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms`

- Handler: `FormsAdminController.create()` — `forms/forms-admin.controller.ts:63`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.create`
- Body DTO: `CreateFormDto`
- Service call: `forms.createForm()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/from-template/:slug`

- Handler: `FormsAdminController.createFromTemplate()` — `forms/forms-admin.controller.ts:73`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.from_template.create`
- Path params: `slug`
- Body DTO: `CreateFromTemplateDto`
- Service call: `forms.createFromTemplate()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/:id`

- Handler: `FormsAdminController.getById()` — `forms/forms-admin.controller.ts:88`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.view`
- Path params: `id`
- Service call: `forms.getFormById()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/forms/:id`

- Handler: `FormsAdminController.update()` — `forms/forms-admin.controller.ts:94`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.edit`
- Path params: `id`
- Body DTO: `UpdateFormDto`
- Service call: `forms.updateForm()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/forms/:id`

- Handler: `FormsAdminController.remove()` — `forms/forms-admin.controller.ts:103`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.delete`
- Path params: `id`
- Service call: `forms.deleteForm()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/:id/publish`

- Handler: `FormsAdminController.publish()` — `forms/forms-admin.controller.ts:109`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.publish`
- Path params: `id`
- Service call: `forms.publishForm()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/:id/close`

- Handler: `FormsAdminController.close()` — `forms/forms-admin.controller.ts:115`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.close`
- Path params: `id`
- Service call: `forms.closeForm()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/:id/duplicate`

- Handler: `FormsAdminController.duplicate()` — `forms/forms-admin.controller.ts:121`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.duplicate`
- Path params: `id`
- Service call: `forms.duplicateForm()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/:id/responses`

- Handler: `FormsAdminController.getResponses()` — `forms/forms-admin.controller.ts:131`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.responses`
- Path params: `id`
- Query DTO: `ListResponsesQueryDto`
- Service call: `responses.getResponses()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/:id/responses/:responseId`

- Handler: `FormsAdminController.getResponse()` — `forms/forms-admin.controller.ts:139`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.responses`
- Path params: `id`, `responseId`
- Service call: `responses.getResponse()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/forms/:id/responses/:responseId`

- Handler: `FormsAdminController.deleteResponse()` — `forms/forms-admin.controller.ts:147`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.responses`
- Path params: `id`, `responseId`
- Service call: `responses.deleteResponse()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/:id/export`

- Handler: `FormsAdminController.exportResponses()` — `forms/forms-admin.controller.ts:156`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.export`
- Path params: `id`
- Body DTO: `ExportFormDto`
- Service call: `exporter.exportResponses()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/:id/stats`

- Handler: `FormsAdminController.getStats()` — `forms/forms-admin.controller.ts:171`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.stats`
- Path params: `id`
- Service call: `forms.getStats()`
- Response type: `Promise<FormStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/forms/:id/invites`

- Handler: `FormsAdminController.listInvites()` — `forms/forms-admin.controller.ts:176`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.invites`
- Path params: `id`
- Service call: `forms.listInvites()`
- Response type: `Promise<FormInviteView[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/forms/:id/invites`

- Handler: `FormsAdminController.createInvite()` — `forms/forms-admin.controller.ts:181`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.invites`
- Path params: `id`
- Body DTO: `CreateInviteDto`
- Service call: `forms.createInvite()`
- Response type: `Promise<FormInviteView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/forms/:id/invites/:code`

- Handler: `FormsAdminController.deleteInvite()` — `forms/forms-admin.controller.ts:191`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `forms.invites`
- Path params: `id`, `code`
- Service call: `forms.deleteInvite()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `FormsController` — prefix `/forms`
`forms/forms.controller.ts:38`  |  class decorators: `—`

### GET `/forms`

- Handler: `FormsController.listPublished()` — `forms/forms.controller.ts:46`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `forms.listPublished()`
- Response type: `Promise<FormSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/forms/my`

- Handler: `FormsController.listMy()` — `forms/forms.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `forms.getMyForms()`
- Response type: `Promise<FormSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/forms/my/responses`

- Handler: `FormsController.listMyResponses()` — `forms/forms.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `responses.getMyResponses()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/forms/autofill`

- Handler: `FormsController.autofill()` — `forms/forms.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `forms.getAutofill()`
- Response type: `Promise<FormAutofill>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/forms/invite/:code`

- Handler: `FormsController.getByInvite()` — `forms/forms.controller.ts:76`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `code`
- Service call: `forms.getFormByInviteCode()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/forms/:slug`

- Handler: `FormsController.getBySlug()` — `forms/forms.controller.ts:83`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `forms.getFormBySlug()`
- Response type: `Promise<FormDetail>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/forms/:slug/responses`

- Handler: `FormsController.submit()` — `forms/forms.controller.ts:96`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Body DTO: `SubmitResponseDto`
- Throttle: @Throttle({ default: { limit: 10, ttl: 60_000 } })
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/forms/:slug/responses/save-draft`

- Handler: `FormsController.saveDraft()` — `forms/forms.controller.ts:116`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Body DTO: `SaveDraftDto`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/forms/:slug/responses/upload`

- Handler: `FormsController.uploadResponseFile()` — `forms/forms.controller.ts:127`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Upload: multipart (Multer interceptor)
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `friends`

## Controller `FriendsController` — prefix `/friends`
`friends/friends.controller.ts:28`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### POST `/friends/request/:username`

- Handler: `FriendsController.sendRequest()` — `friends/friends.controller.ts:33`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Throttle: @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
- Service call: `friends.sendRequest()`
- Response type: `Promise<FriendRequestItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/friends/accept/:requestId`

- Handler: `FriendsController.acceptRequest()` — `friends/friends.controller.ts:43`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `requestId`
- Throttle: @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
- Service call: `friends.acceptRequest()`
- Response type: `Promise<FriendListItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/friends/reject/:requestId`

- Handler: `FriendsController.rejectRequest()` — `friends/friends.controller.ts:52`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `requestId`
- Service call: `friends.rejectRequest()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/friends/requests/:requestId`

- Handler: `FriendsController.cancelRequest()` — `friends/friends.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `requestId`
- Service call: `friends.cancelRequest()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/friends/block/:username`

- Handler: `FriendsController.unblockUser()` — `friends/friends.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `friends.unblockUser()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/friends/block/:username`

- Handler: `FriendsController.blockUser()` — `friends/friends.controller.ts:79`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Throttle: @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
- Service call: `friends.blockUser()`
- Response type: `Promise<BlockedUserItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/friends/:username`

- Handler: `FriendsController.removeFriend()` — `friends/friends.controller.ts:89`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `friends.removeFriend()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends`

- Handler: `FriendsController.getFriends()` — `friends/friends.controller.ts:98`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `string`
- Service call: `friends.getFriendsList()`
- Response type: `Promise<PaginatedResponse<FriendListItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/requests/incoming`

- Handler: `FriendsController.getIncoming()` — `friends/friends.controller.ts:108`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `friends.getIncomingRequests()`
- Response type: `Promise<PaginatedResponse<FriendRequestItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/requests/incoming/count`

- Handler: `FriendsController.getIncomingCount()` — `friends/friends.controller.ts:117`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `friends.getIncomingCount()`
- Response type: `Promise<FriendsCountResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/requests/outgoing`

- Handler: `FriendsController.getOutgoing()` — `friends/friends.controller.ts:122`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `friends.getOutgoingRequests()`
- Response type: `Promise<PaginatedResponse<FriendRequestItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/blocked`

- Handler: `FriendsController.getBlocked()` — `friends/friends.controller.ts:131`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `friends.getBlockedUsers()`
- Response type: `Promise<PaginatedResponse<BlockedUserItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/status/:username`

- Handler: `FriendsController.getStatus()` — `friends/friends.controller.ts:140`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `friends.getFriendshipStatus()`
- Response type: `Promise<FriendshipStatusResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/count`

- Handler: `FriendsController.getMyCount()` — `friends/friends.controller.ts:148`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `friends.getFriendsCount()`
- Response type: `Promise<FriendsCountResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/friends/count/:username`

- Handler: `FriendsController.getCountByUsername()` — `friends/friends.controller.ts:153`
- Authentication: **public**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `friends.getFriendsCountByUsername()`
- Response type: `Promise<FriendsCountResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `health`

## Controller `HealthController` — prefix `/health`
`health/health.controller.ts:6`  |  class decorators: `—`

### GET `/health`

- Handler: `HealthController.check()` — `health/health.controller.ts:15`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: см. тело метода
- Response type: `Promise<HealthResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `leaderboards`

## Controller `LeaderboardsController` — prefix `/leaderboards`
`leaderboards/leaderboards.controller.ts:12`  |  class decorators: `—`

### GET `/leaderboards`

- Handler: `LeaderboardsController.list()` — `leaderboards/leaderboards.controller.ts:16`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `leaderboards.list()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `minecraft`

## Controller `AdminServersController` — prefix `/admin/servers`
`minecraft/admin-servers.controller.ts:26`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/servers`

- Handler: `AdminServersController.list()` — `minecraft/admin-servers.controller.ts:35`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `servers.view`
- Service call: `servers.listAllAdmin()`
- Response type: `Promise<GameServer[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/servers`

- Handler: `AdminServersController.create()` — `minecraft/admin-servers.controller.ts:40`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `servers.create`
- Body DTO: `CreateServerDto`
- Service call: `servers.create()`, `audit.log()`
- Response type: `Promise<GameServer>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/servers/:id`

- Handler: `AdminServersController.update()` — `minecraft/admin-servers.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `servers.edit`
- Path params: `id`
- Body DTO: `UpdateServerDto`
- Service call: `servers.update()`, `audit.log()`
- Response type: `Promise<GameServer>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/servers/:id`

- Handler: `AdminServersController.remove()` — `minecraft/admin-servers.controller.ts:74`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `servers.delete`
- Path params: `id`
- Service call: `servers.remove()`, `audit.log()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/servers/:id/logs`

- Handler: `AdminServersController.logs()` — `minecraft/admin-servers.controller.ts:89`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `servers.logs`
- Path params: `id`
- Query DTO: `string`, `string`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ServerCategoriesController` — prefix `/`
`minecraft/server-categories.controller.ts:26`  |  class decorators: `—`

### GET `/server-categories`

- Handler: `ServerCategoriesController.list()` — `minecraft/server-categories.controller.ts:30`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `categories.listActive()`
- Response type: `Promise<ServerCategory[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminServerCategoriesController` — prefix `/admin/server-categories`
`minecraft/server-categories.controller.ts:36`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/server-categories`

- Handler: `AdminServerCategoriesController.listAdmin()` — `minecraft/server-categories.controller.ts:45`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `server_categories.view`
- Service call: `categories.listAllAdmin()`
- Response type: `Promise<ServerCategory[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/server-categories`

- Handler: `AdminServerCategoriesController.create()` — `minecraft/server-categories.controller.ts:50`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `server_categories.create`
- Body DTO: `CreateServerCategoryDto`
- Service call: `categories.create()`, `audit.log()`
- Response type: `Promise<ServerCategory>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/server-categories/:id`

- Handler: `AdminServerCategoriesController.update()` — `minecraft/server-categories.controller.ts:67`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `server_categories.edit`
- Path params: `id`
- Body DTO: `UpdateServerCategoryDto`
- Service call: `categories.update()`, `audit.log()`
- Response type: `Promise<ServerCategory>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/server-categories/:id`

- Handler: `AdminServerCategoriesController.remove()` — `minecraft/server-categories.controller.ts:84`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `server_categories.delete`
- Path params: `id`
- Service call: `categories.remove()`, `audit.log()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ServersController` — prefix `/servers`
`minecraft/servers.controller.ts:19`  |  class decorators: `—`

### GET `/servers`

- Handler: `ServersController.list()` — `minecraft/servers.controller.ts:23`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `servers.listActive()`
- Response type: `Promise<GameServer[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/overview`

- Handler: `ServersController.overview()` — `minecraft/servers.controller.ts:28`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `servers.getOverview()`
- Response type: `Promise<ServersOverview>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/widget`

- Handler: `ServersController.widget()` — `minecraft/servers.controller.ts:33`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Query DTO: `string`
- Service call: `servers.listActive()`
- Response type: `Promise<string>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/:slug`

- Handler: `ServersController.getOne()` — `minecraft/servers.controller.ts:56`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `servers.getBySlug()`
- Response type: `Promise<GameServer>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/:slug/status`

- Handler: `ServersController.status()` — `minecraft/servers.controller.ts:61`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `servers.getStatus()`
- Response type: `Promise<ServerStatusSnapshot>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/:slug/players`

- Handler: `ServersController.players()` — `minecraft/servers.controller.ts:66`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `servers.getPlayers()`
- Response type: `Promise<ServerPlayer[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/servers/:slug/history`

- Handler: `ServersController.history()` — `minecraft/servers.controller.ts:71`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `servers.getHistory()`
- Response type: `Promise<ServerHistoryPoint[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `moderation`

## Controller `QuickModerationController` — prefix `/`
`moderation/quick-moderation.controller.ts:75`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard)`

### POST `/moderation/users/:userId/mute`

- Handler: `QuickModerationController.mute()` — `moderation/quick-moderation.controller.ts:80`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `users.mute`
- Path params: `userId`
- Body DTO: `MuteDto`
- Service call: `moderation.mute()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/users/:userId/warn`

- Handler: `QuickModerationController.warn()` — `moderation/quick-moderation.controller.ts:90`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `users.warn`
- Path params: `userId`
- Body DTO: `WarnDto`
- Service call: `moderation.warn()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/messages/:messageId/hard-delete`

- Handler: `QuickModerationController.hardDeleteMessage()` — `moderation/quick-moderation.controller.ts:100`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `messages.hard_delete`
- Path params: `messageId`
- Body DTO: `HardDeleteDto`
- Service call: `moderation.hardDeleteMessage()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/comments/:commentId/hard-delete`

- Handler: `QuickModerationController.hardDeleteComment()` — `moderation/quick-moderation.controller.ts:110`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `comments.hard_delete`
- Path params: `commentId`
- Body DTO: `HardDeleteDto`
- Service call: `moderation.hardDeleteComment()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/users/:userId/kick`

- Handler: `QuickModerationController.kick()` — `moderation/quick-moderation.controller.ts:120`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.kick`
- Path params: `userId`
- Body DTO: `KickDto`
- Service call: `moderation.kick()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/users/:userId/ban`

- Handler: `QuickModerationController.ban()` — `moderation/quick-moderation.controller.ts:130`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.ban`
- Path params: `userId`
- Body DTO: `BanDto`
- Service call: `moderation.ban()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/change-role`

- Handler: `QuickModerationController.changeRole()` — `moderation/quick-moderation.controller.ts:140`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `users.change_role`
- Path params: `userId`
- Body DTO: `ChangeRoleDto`
- Service call: `moderation.changeRole()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/users/:userId`

- Handler: `QuickModerationController.deleteAccount()` — `moderation/quick-moderation.controller.ts:150`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `users.delete`
- Path params: `userId`
- Service call: `moderation.deleteAccount()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `news`

## Controller `NewsAdminController` — prefix `/admin/news`
`news/news-admin.controller.ts:31`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/news`

- Handler: `NewsAdminController.list()` — `news/news-admin.controller.ts:37`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.view`
- Query DTO: `AdminListNewsQueryDto`
- Service call: `news.listAdmin()`
- Response type: `Promise<PaginatedResponse<NewsAdminItem>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/news/stats`

- Handler: `NewsAdminController.stats()` — `news/news-admin.controller.ts:42`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.stats`
- Service call: `news.stats()`
- Response type: `Promise<NewsStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/news/:id`

- Handler: `NewsAdminController.getById()` — `news/news-admin.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.view`
- Path params: `id`
- Service call: `news.getAdminById()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news`

- Handler: `NewsAdminController.create()` — `news/news-admin.controller.ts:52`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.create`
- Body DTO: `CreateNewsDto`
- Service call: `news.create()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/upload-image`

- Handler: `NewsAdminController.uploadImage()` — `news/news-admin.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.upload_image.create`
- Upload: multipart (Multer interceptor)
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/news/:id`

- Handler: `NewsAdminController.update()` — `news/news-admin.controller.ts:79`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.edit`
- Path params: `id`
- Body DTO: `UpdateNewsDto`
- Service call: `news.update()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/news/:id`

- Handler: `NewsAdminController.remove()` — `news/news-admin.controller.ts:88`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.delete`
- Path params: `id`
- Service call: `news.archive()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/:id/pin`

- Handler: `NewsAdminController.pin()` — `news/news-admin.controller.ts:94`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.pin`
- Path params: `id`
- Service call: `news.setPinned()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/:id/unpin`

- Handler: `NewsAdminController.unpin()` — `news/news-admin.controller.ts:99`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.unpin`
- Path params: `id`
- Service call: `news.setPinned()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/:id/feature`

- Handler: `NewsAdminController.feature()` — `news/news-admin.controller.ts:104`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.feature`
- Path params: `id`
- Service call: `news.setFeatured()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/news/:id/unfeature`

- Handler: `NewsAdminController.unfeature()` — `news/news-admin.controller.ts:109`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `news.unfeature`
- Path params: `id`
- Service call: `news.setFeatured()`
- Response type: `Promise<NewsAdminItem>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `NewsModerationController` — prefix `/moderation/news/comments`
`news/news-moderation.controller.ts:17`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.MODERATOR)`

### PATCH `/moderation/news/comments/:commentId/pin`

- Handler: `NewsModerationController.pin()` — `news/news-moderation.controller.ts:23`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `news.comments.pin`
- Path params: `commentId`
- Service call: `comments.pin()`
- Response type: `Promise<NewsComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/news/comments/:commentId/unpin`

- Handler: `NewsModerationController.unpin()` — `news/news-moderation.controller.ts:28`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `news.comments.unpin`
- Path params: `commentId`
- Service call: `comments.pin()`
- Response type: `Promise<NewsComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/news/comments/:commentId`

- Handler: `NewsModerationController.remove()` — `news/news-moderation.controller.ts:33`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `news.comments.delete`
- Path params: `commentId`
- Service call: `comments.moderateDelete()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `NewsController` — prefix `/`
`news/news.controller.ts:42`  |  class decorators: `—`

### GET `/news`

- Handler: `NewsController.list()` — `news/news.controller.ts:49`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ListNewsQueryDto`
- Service call: `news.listPublic()`
- Response type: `Promise<PaginatedResponse<NewsSummary>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/featured`

- Handler: `NewsController.featured()` — `news/news.controller.ts:58`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `news.featured()`
- Response type: `Promise<NewsSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/latest`

- Handler: `NewsController.latest()` — `news/news.controller.ts:66`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `LatestNewsQueryDto`
- Service call: `news.latest()`
- Response type: `Promise<NewsSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/popular`

- Handler: `NewsController.popular()` — `news/news.controller.ts:75`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `news.popular()`
- Response type: `Promise<NewsSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/categories`

- Handler: `NewsController.categories()` — `news/news.controller.ts:83`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `news.categories()`
- Response type: `Promise<NewsCategoryCount[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/tags`

- Handler: `NewsController.tags()` — `news/news.controller.ts:88`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Query DTO: `TagsQueryDto`
- Service call: `news.tags()`
- Response type: `Promise<NewsTagCount[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/rss/news`

- Handler: `NewsController.rss()` — `news/news.controller.ts:93`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `news.buildRssFeed()`
- Response type: `Promise<string>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/:slug`

- Handler: `NewsController.getBySlug()` — `news/news.controller.ts:100`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `news.getBySlug()`
- Response type: `Promise<NewsDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/news/:id/like`

- Handler: `NewsController.like()` — `news/news.controller.ts:116`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/news/:slug/comments`

- Handler: `NewsController.listComments()` — `news/news.controller.ts:126`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Query DTO: `ListNewsCommentsQueryDto`
- Service call: `comments.list()`
- Response type: `Promise<PaginatedResponse<NewsComment>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/news/:slug/comments`

- Handler: `NewsController.createComment()` — `news/news.controller.ts:136`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Body DTO: `CreateNewsCommentDto`
- Throttle: @Throttle({ default: { limit: 5, ttl: 60_000 } })
- Service call: `comments.create()`
- Response type: `Promise<NewsComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/news/:slug/comments/:commentId`

- Handler: `NewsController.updateComment()` — `news/news.controller.ts:148`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`, `commentId`
- Body DTO: `UpdateNewsCommentDto`
- Service call: `comments.update()`
- Response type: `Promise<NewsComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/news/:slug/comments/:commentId`

- Handler: `NewsController.deleteComment()` — `news/news.controller.ts:159`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`, `commentId`
- Service call: `comments.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/news/:slug/comments/:commentId/reactions`

- Handler: `NewsController.react()` — `news/news.controller.ts:170`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`, `commentId`
- Body DTO: `NewsCommentReactionDto`
- Service call: `comments.toggleReaction()`
- Response type: `Promise<NewsComment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `notifications`

## Controller `AdminNotificationsController` — prefix `/admin/notifications`
`notifications/admin-notifications.controller.ts:31`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/notifications/webhooks`

- Handler: `AdminNotificationsController.listWebhooks()` — `notifications/admin-notifications.controller.ts:40`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.webhooks.view`
- Service call: `discord.listWebhooks()`
- Response type: `Promise<DiscordWebhookView[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/notifications/webhooks`

- Handler: `AdminNotificationsController.createWebhook()` — `notifications/admin-notifications.controller.ts:45`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.webhooks.create`
- Body DTO: `AdminWebhookDto`
- Service call: `discord.createWebhook()`
- Response type: `Promise<DiscordWebhookView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/notifications/webhooks/:id`

- Handler: `AdminNotificationsController.updateWebhook()` — `notifications/admin-notifications.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.webhooks.edit`
- Path params: `id`
- Body DTO: `UpdateAdminWebhookDto`
- Service call: `discord.updateWebhook()`
- Response type: `Promise<DiscordWebhookView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/notifications/webhooks/:id`

- Handler: `AdminNotificationsController.deleteWebhook()` — `notifications/admin-notifications.controller.ts:62`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.webhooks.delete`
- Path params: `id`
- Service call: `discord.deleteWebhook()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/notifications/broadcast`

- Handler: `AdminNotificationsController.broadcast()` — `notifications/admin-notifications.controller.ts:68`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.broadcast`
- Body DTO: `BroadcastNotificationDto`
- Service call: `notifications.broadcast()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/notifications/stats`

- Handler: `AdminNotificationsController.stats()` — `notifications/admin-notifications.controller.ts:81`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `notifications.stats`
- Service call: `notifications.stats()`
- Response type: `Promise<NotificationStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `NotificationsController` — prefix `/notifications`
`notifications/notifications.controller.ts:39`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/notifications`

- Handler: `NotificationsController.list()` — `notifications/notifications.controller.ts:49`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `notifications.list()`
- Response type: `Promise<NotificationsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/notifications/unread-count`

- Handler: `NotificationsController.unreadCount()` — `notifications/notifications.controller.ts:59`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `notifications.unreadCount()`
- Response type: `Promise<UnreadNotificationsCount>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/notifications/settings`

- Handler: `NotificationsController.getSettings()` — `notifications/notifications.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `settings.getOrCreate()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/notifications/settings`

- Handler: `NotificationsController.updateSettings()` — `notifications/notifications.controller.ts:69`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateNotificationSettingsDto`
- Service call: `settings.update()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/notifications/settings/type/:type`

- Handler: `NotificationsController.updateTypeSettings()` — `notifications/notifications.controller.ts:77`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `type`
- Body DTO: `UpdateTypeSettingDto`
- Service call: `settings.updateType()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/notifications/settings/reset`

- Handler: `NotificationsController.resetSettings()` — `notifications/notifications.controller.ts:86`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `settings.reset()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/notifications/push/vapid-key`

- Handler: `NotificationsController.vapidKey()` — `notifications/notifications.controller.ts:92`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `push.getVapidPublicKey()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/notifications/push/subscribe`

- Handler: `NotificationsController.subscribePush()` — `notifications/notifications.controller.ts:97`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `PushSubscribeDto`
- Service call: `push.subscribe()`
- Response type: `Promise<PushSubscriptionView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/notifications/push/subscribe/:id`

- Handler: `NotificationsController.unsubscribePush()` — `notifications/notifications.controller.ts:106`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `push.unsubscribe()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/notifications/discord/webhook`

- Handler: `NotificationsController.saveDiscordWebhook()` — `notifications/notifications.controller.ts:115`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `DiscordPersonalWebhookDto`
- Service call: `settings.update()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/notifications/discord/webhook`

- Handler: `NotificationsController.deleteDiscordWebhook()` — `notifications/notifications.controller.ts:127`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `settings.update()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/notifications/discord/webhook/test`

- Handler: `NotificationsController.testDiscordWebhook()` — `notifications/notifications.controller.ts:136`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `settings.getOrCreate()`, `discord.sendToWebhook()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/notifications/digest`

- Handler: `NotificationsController.updateDigest()` — `notifications/notifications.controller.ts:151`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateDigestDto`
- Service call: `settings.update()`
- Response type: `Promise<NotificationSettings>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/notifications/digest/test`

- Handler: `NotificationsController.testDigest()` — `notifications/notifications.controller.ts:162`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `notifications.sendDigestForUser()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/notifications/read-all`

- Handler: `NotificationsController.markAllRead()` — `notifications/notifications.controller.ts:169`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/notifications/:id/read`

- Handler: `NotificationsController.markRead()` — `notifications/notifications.controller.ts:174`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `notifications.markRead()`
- Response type: `Promise<AppNotification>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/notifications/:id`

- Handler: `NotificationsController.remove()` — `notifications/notifications.controller.ts:182`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `notifications.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `positions`

## Controller `PositionsController` — prefix `/positions`
`positions/positions.controller.ts:25`  |  class decorators: `—`

### GET `/positions`

- Handler: `PositionsController.list()` — `positions/positions.controller.ts:29`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Query DTO: `ListPositionsDto`
- Service call: `positions.findAll()`
- Response type: `Promise<PositionSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/positions/manage`

- Handler: `PositionsController.listAll()` — `positions/positions.controller.ts:35`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `positions.manage.view`
- Query DTO: `ListPositionsDto`
- Service call: `positions.findAll()`
- Response type: `Promise<PositionSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/positions/:slug`

- Handler: `PositionsController.find()` — `positions/positions.controller.ts:42`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `positions.findBySlug()`
- Response type: `Promise<PositionDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/positions`

- Handler: `PositionsController.create()` — `positions/positions.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `positions.create`
- Body DTO: `CreatePositionDto`
- Service call: `positions.create()`
- Response type: `Promise<PositionSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/positions/:id`

- Handler: `PositionsController.update()` — `positions/positions.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `positions.edit`
- Path params: `id`
- Body DTO: `UpdatePositionDto`
- Service call: `positions.update()`
- Response type: `Promise<PositionSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/positions/:id`

- Handler: `PositionsController.remove()` — `positions/positions.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `positions.delete`
- Path params: `id`
- Service call: `positions.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/positions/:id/assign`

- Handler: `PositionsController.assign()` — `positions/positions.controller.ts:69`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `positions.assign`
- Path params: `id`
- Body DTO: `AssignPositionDto`
- Service call: `positions.assign()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `reports`

## Controller `ReportsController` — prefix `/`
`reports/reports.controller.ts:62`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/reports/rules`

- Handler: `ReportsController.getRules()` — `reports/reports.controller.ts:70`
- Authentication: **public**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ReportRulesQueryDto`
- Service call: `reports.getRules()`
- Response type: `Promise<TopicDetails | null>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/reports`

- Handler: `ReportsController.listMine()` — `reports/reports.controller.ts:76`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ListReportsQueryDto`
- Service call: `reports.listMine()`
- Response type: `Promise<ReportListResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/reports/:reportNumber`

- Handler: `ReportsController.getOne()` — `reports/reports.controller.ts:84`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `reportNumber`
- Service call: `reports.getByNumber()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/reports`

- Handler: `ReportsController.create()` — `reports/reports.controller.ts:92`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateReportDto`
- Service call: `reports.createReport()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/reports/:reportNumber/messages`

- Handler: `ReportsController.addMessage()` — `reports/reports.controller.ts:102`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `reportNumber`
- Body DTO: `AddReportMessageDto`
- Service call: `reports.addMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/reports/:reportNumber/messages/:messageId`

- Handler: `ReportsController.updateOwnMessage()` — `reports/reports.controller.ts:112`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `reportNumber`, `messageId`
- Body DTO: `UpdateOwnReportMessageDto`
- Service call: `reports.updateOwnMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/reports/:reportNumber/attachments`

- Handler: `ReportsController.uploadAttachment()` — `reports/reports.controller.ts:128`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `reportNumber`
- Upload: multipart (Multer interceptor)
- Service call: `reports.uploadAttachment()`
- Response type: `Promise<ReportAttachment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/reports/:reportNumber/messages/:messageId/attachments`

- Handler: `ReportsController.uploadMessageAttachment()` — `reports/reports.controller.ts:149`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `reportNumber`, `messageId`
- Upload: multipart (Multer interceptor)
- Service call: `reports.uploadMessageAttachment()`
- Response type: `Promise<ReportMessageAttachment>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/game-reports`

- Handler: `ReportsController.listGameReports()` — `reports/reports.controller.ts:177`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `reports.listGameReports()`
- Response type: `Promise<GameReportSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/game-reports/incoming`

- Handler: `ReportsController.listIncomingGameReports()` — `reports/reports.controller.ts:182`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `reports.listIncomingGameReports()`
- Response type: `Promise<GameReportSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/game-reports/outgoing`

- Handler: `ReportsController.listOutgoingGameReports()` — `reports/reports.controller.ts:189`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `reports.listOutgoingGameReports()`
- Response type: `Promise<GameReportSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/bans`

- Handler: `ReportsController.listActiveGamePunishments()` — `reports/reports.controller.ts:196`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `reports.listActiveGamePunishments()`
- Response type: `Promise<GamePunishmentSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/punishments-history`

- Handler: `ReportsController.listGamePunishmentHistory()` — `reports/reports.controller.ts:201`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `reports.listGamePunishmentHistory()`
- Response type: `Promise<GamePunishmentSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/me/game-punishments`

- Handler: `ReportsController.listMyGamePunishments()` — `reports/reports.controller.ts:208`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `reports.listMyGamePunishments()`
- Response type: `Promise<GamePunishmentSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/moderation/reports`

- Handler: `ReportsController.listModeration()` — `reports/reports.controller.ts:213`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.view`
- Query DTO: `ListReportsQueryDto`
- Service call: `reports.listModeration()`
- Response type: `Promise<ReportListResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/assign`

- Handler: `ReportsController.assign()` — `reports/reports.controller.ts:223`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.assign`
- Path params: `reportNumber`
- Body DTO: `AssignReportDto`
- Service call: `reports.assign()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/status`

- Handler: `ReportsController.changeStatus()` — `reports/reports.controller.ts:234`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.status`
- Path params: `reportNumber`
- Body DTO: `ChangeReportStatusDto`
- Service call: `reports.changeStatus()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/verdict`

- Handler: `ReportsController.setVerdict()` — `reports/reports.controller.ts:245`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.verdict`
- Path params: `reportNumber`
- Body DTO: `SetVerdictDto`
- Service call: `reports.setVerdict()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/reports/:reportNumber/messages`

- Handler: `ReportsController.moderationMessage()` — `reports/reports.controller.ts:256`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.messages`
- Path params: `reportNumber`
- Body DTO: `AddReportMessageDto`
- Service call: `reports.addMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/reports/:reportNumber/messages/:messageId`

- Handler: `ReportsController.softDeleteMessage()` — `reports/reports.controller.ts:270`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.messages`
- Path params: `reportNumber`, `messageId`
- Body DTO: `SoftDeleteMessageDto`
- Service call: `reports.softDeleteMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/messages/:messageId/pin`

- Handler: `ReportsController.pinMessage()` — `reports/reports.controller.ts:288`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.messages.pin`
- Path params: `reportNumber`, `messageId`
- Service call: `reports.pinMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/messages/:messageId/unpin`

- Handler: `ReportsController.unpinMessage()` — `reports/reports.controller.ts:299`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.messages.unpin`
- Path params: `reportNumber`, `messageId`
- Service call: `reports.unpinMessage()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/reports/:reportNumber/notes`

- Handler: `ReportsController.createModeratorNote()` — `reports/reports.controller.ts:310`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.notes`
- Path params: `reportNumber`
- Body DTO: `CreateModeratorNoteDto`
- Service call: `reports.createModeratorNote()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/notes/:noteId`

- Handler: `ReportsController.updateModeratorNote()` — `reports/reports.controller.ts:322`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.notes`
- Path params: `reportNumber`, `noteId`
- Body DTO: `UpdateModeratorNoteDto`
- Service call: `reports.updateModeratorNote()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/moderation/reports/:reportNumber/notes/:noteId`

- Handler: `ReportsController.deleteModeratorNote()` — `reports/reports.controller.ts:340`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.notes`
- Path params: `reportNumber`, `noteId`
- Service call: `reports.deleteModeratorNote()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/moderation/reports/:reportNumber/notes/:noteId/pin`

- Handler: `ReportsController.pinModeratorNote()` — `reports/reports.controller.ts:351`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `HELPER`; Proposed permission: `reports.notes.pin`
- Path params: `reportNumber`, `noteId`
- Service call: `reports.pinModeratorNote()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/moderation/reports/:reportNumber/lock`

- Handler: `ReportsController.lock()` — `reports/reports.controller.ts:362`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.lock`
- Path params: `reportNumber`
- Body DTO: `LockReportDto`
- Service call: `reports.lock()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/reports/stats`

- Handler: `ReportsController.stats()` — `reports/reports.controller.ts:374`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.stats`
- Service call: `reports.stats()`
- Response type: `Promise<ReportStats>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/reports/archived`

- Handler: `ReportsController.listArchived()` — `reports/reports.controller.ts:381`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.archived.view`
- Query DTO: `ListReportsQueryDto`
- Service call: `reports.listArchived()`
- Response type: `Promise<ReportListResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/reports/:reportNumber/archive`

- Handler: `ReportsController.archiveReport()` — `reports/reports.controller.ts:391`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.archive`
- Path params: `reportNumber`
- Body DTO: `ArchiveReportDto`
- Service call: `reports.archiveReport()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/reports/:reportNumber/unarchive`

- Handler: `ReportsController.unarchiveReport()` — `reports/reports.controller.ts:403`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.unarchive`
- Path params: `reportNumber`
- Service call: `reports.unarchiveReport()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/reports/:reportNumber`

- Handler: `ReportsController.deleteReport()` — `reports/reports.controller.ts:414`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.delete`
- Path params: `reportNumber`
- Service call: `reports.deleteReport()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/reports/:reportNumber/messages/:messageId`

- Handler: `ReportsController.hardDeleteMessage()` — `reports/reports.controller.ts:425`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.messages`
- Path params: `reportNumber`, `messageId`
- Service call: `reports.hardDeleteMessage()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/reports/ban/:userId`

- Handler: `ReportsController.banUser()` — `reports/reports.controller.ts:442`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.ban`
- Path params: `userId`
- Body DTO: `BanReportsDto`
- Service call: `reports.banUser()`
- Response type: `Promise<ReportBanInfo>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/reports/ban/:userId`

- Handler: `ReportsController.unbanUser()` — `reports/reports.controller.ts:454`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `reports.ban`
- Path params: `userId`
- Service call: `reports.unbanUser()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/support/donation-problem`

- Handler: `ReportsController.donationProblem()` — `reports/reports.controller.ts:462`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateDonationProblemDto`
- Service call: `reports.createDonationProblem()`
- Response type: `Promise<ReportDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/support/donations`

- Handler: `ReportsController.listDonations()` — `reports/reports.controller.ts:472`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `support.donations.view`
- Query DTO: `ListReportsQueryDto`
- Service call: `reports.listDonations()`
- Response type: `Promise<ReportListResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/me/punishments`

- Handler: `ReportsController.listMyPunishments()` — `reports/reports.controller.ts:479`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `MyPunishmentsQueryDto`
- Service call: `punishments.listMyPunishments()`
- Response type: `Promise<UserPunishmentSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/users/:username/punishments`

- Handler: `ReportsController.listUserPunishments()` — `reports/reports.controller.ts:487`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.punishments`
- Path params: `username`
- Service call: `punishments.listByUsername()`
- Response type: `Promise<UserPunishmentSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/punishments`

- Handler: `ReportsController.issuePunishment()` — `reports/reports.controller.ts:496`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.punishments`
- Path params: `userId`
- Body DTO: `CreatePunishmentDto`
- Service call: `punishments.issuePunishment()`
- Response type: `Promise<UserPunishmentSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/users/:userId/punishments/:id`

- Handler: `ReportsController.updatePunishment()` — `reports/reports.controller.ts:508`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `MODERATOR`; Proposed permission: `users.punishments`
- Path params: `userId`, `id`
- Body DTO: `UpdatePunishmentDto`
- Service call: `punishments.updatePunishment()`
- Response type: `Promise<UserPunishmentSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `statistics`

## Controller `StatisticsController` — prefix `/admin/dashboard`
`statistics/statistics.controller.ts:15`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/dashboard/overview`

- Handler: `StatisticsController.getOverview()` — `statistics/statistics.controller.ts:21`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `overview.view`
- Service call: `statistics.getDashboardOverview()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/charts/users`

- Handler: `StatisticsController.usersChart()` — `statistics/statistics.controller.ts:26`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `charts.users.view`
- Service call: `statistics.getUsersChartData()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/charts/revenue`

- Handler: `StatisticsController.revenueChart()` — `statistics/statistics.controller.ts:31`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `charts.revenue.view`
- Service call: `statistics.getRevenueChartData()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/charts/reports`

- Handler: `StatisticsController.reportsChart()` — `statistics/statistics.controller.ts:36`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `charts.reports.view`
- Service call: `statistics.getReportsChartData()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/charts/servers`

- Handler: `StatisticsController.serversChart()` — `statistics/statistics.controller.ts:41`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `charts.servers.view`
- Service call: `statistics.getServerOnlineChartData()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/top-products`

- Handler: `StatisticsController.topProducts()` — `statistics/statistics.controller.ts:46`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `top_products.view`
- Service call: `statistics.getTopProducts()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/top-buyers`

- Handler: `StatisticsController.topBuyers()` — `statistics/statistics.controller.ts:51`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `top_buyers.view`
- Service call: `statistics.getTopBuyers()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/dashboard/moderator-activity`

- Handler: `StatisticsController.moderatorActivity()` — `statistics/statistics.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `moderator_activity.view`
- Service call: `statistics.getModeratorActivity()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `store`

## Controller `BundlesController` — prefix `/store/bundles`
`store/bundles.controller.ts:20`  |  class decorators: `—`

### GET `/store/bundles`

- Handler: `BundlesController.list()` — `store/bundles.controller.ts:24`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `bundles.list()`
- Response type: `Promise<StoreBundle[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/bundles/:slug`

- Handler: `BundlesController.getBySlug()` — `store/bundles.controller.ts:29`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `bundles.getBySlug()`
- Response type: `Promise<StoreBundle>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminBundlesController` — prefix `/admin/store/bundles`
`store/bundles.controller.ts:35`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### POST `/admin/store/bundles`

- Handler: `AdminBundlesController.create()` — `store/bundles.controller.ts:41`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.bundles.create`
- Body DTO: `CreateBundleDto`
- Service call: `bundles.create()`
- Response type: `Promise<StoreBundle>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/bundles/:id`

- Handler: `AdminBundlesController.update()` — `store/bundles.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.bundles.edit`
- Path params: `id`
- Body DTO: `UpdateBundleDto`
- Service call: `bundles.update()`
- Response type: `Promise<StoreBundle>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/bundles/:id`

- Handler: `AdminBundlesController.remove()` — `store/bundles.controller.ts:52`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.bundles.delete`
- Path params: `id`
- Service call: `bundles.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `CartController` — prefix `/store/cart`
`store/cart.controller.ts:24`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/store/cart`

- Handler: `CartController.getCart()` — `store/cart.controller.ts:29`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `cart.getCart()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/cart/items`

- Handler: `CartController.addItem()` — `store/cart.controller.ts:34`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `AddCartItemDto`
- Service call: `cart.addItem()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/store/cart/items/:id`

- Handler: `CartController.updateItem()` — `store/cart.controller.ts:43`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Body DTO: `UpdateCartItemDto`
- Service call: `cart.updateItem()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/store/cart/items/:id`

- Handler: `CartController.removeItem()` — `store/cart.controller.ts:52`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `id`
- Service call: `cart.removeItem()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/store/cart`

- Handler: `CartController.clear()` — `store/cart.controller.ts:60`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `cart.clear()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/cart/apply-promo`

- Handler: `CartController.applyPromo()` — `store/cart.controller.ts:66`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `ApplyPromoDto`
- Service call: `cart.applyPromo()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/store/cart/promo`

- Handler: `CartController.removePromo()` — `store/cart.controller.ts:74`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `cart.removePromo()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/cart/calculate`

- Handler: `CartController.calculate()` — `store/cart.controller.ts:79`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CalculateCartDto`
- Service call: `cart.calculate()`
- Response type: `Promise<CartResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `CategoriesController` — prefix `/store/categories`
`store/categories.controller.ts:21`  |  class decorators: `—`

### GET `/store/categories`

- Handler: `CategoriesController.list()` — `store/categories.controller.ts:25`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `categories.listTree()`
- Response type: `Promise<StoreCategory[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminCategoriesController` — prefix `/admin/store/categories`
`store/categories.controller.ts:31`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/store/categories`

- Handler: `AdminCategoriesController.listAdmin()` — `store/categories.controller.ts:37`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.categories.view`
- Query DTO: `string`
- Service call: `categories.listAdmin()`
- Response type: `Promise<StoreCategory[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/store/categories`

- Handler: `AdminCategoriesController.create()` — `store/categories.controller.ts:42`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.categories.create`
- Body DTO: `CreateCategoryDto`
- Service call: `categories.create()`
- Response type: `Promise<StoreCategory>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/categories/:id`

- Handler: `AdminCategoriesController.update()` — `store/categories.controller.ts:48`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.categories.edit`
- Path params: `id`
- Body DTO: `UpdateCategoryDto`
- Service call: `categories.update()`
- Response type: `Promise<StoreCategory>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/categories/:id`

- Handler: `AdminCategoriesController.remove()` — `store/categories.controller.ts:53`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.categories.delete`
- Path params: `id`
- Service call: `categories.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `GameCurrencyController` — prefix `/store`
`store/currencies.controller.ts:29`  |  class decorators: `—`

### GET `/store/currency-rates`

- Handler: `GameCurrencyController.getGameRates()` — `store/currencies.controller.ts:33`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `currencies.getGameCurrencyRates()`
- Response type: `Promise<GameCurrencyRates>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/exchange`

- Handler: `GameCurrencyController.exchange()` — `store/currencies.controller.ts:38`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CurrencyExchangeDto`
- Service call: `currencies.exchange()`
- Response type: `Promise<CurrencyExchangeResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `CurrenciesController` — prefix `/store/currencies`
`store/currencies.controller.ts:49`  |  class decorators: `—`

### GET `/store/currencies`

- Handler: `CurrenciesController.listActive()` — `store/currencies.controller.ts:53`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `currencies.listActive()`
- Response type: `Promise<CurrencyRate[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminCurrenciesController` — prefix `/admin/store/currencies`
`store/currencies.controller.ts:59`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/store/currencies`

- Handler: `AdminCurrenciesController.listAdmin()` — `store/currencies.controller.ts:65`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.currencies.view`
- Service call: `currencies.listAdmin()`
- Response type: `Promise<CurrencyRate[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/store/currencies`

- Handler: `AdminCurrenciesController.create()` — `store/currencies.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.currencies.create`
- Body DTO: `CreateCurrencyRateDto`
- Service call: `currencies.create()`
- Response type: `Promise<CurrencyRate>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/currencies/:currency`

- Handler: `AdminCurrenciesController.update()` — `store/currencies.controller.ts:76`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.currencies.edit`
- Path params: `currency`
- Body DTO: `UpdateCurrencyRateDto`
- Service call: `currencies.update()`
- Response type: `Promise<CurrencyRate>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `DiscountsController` — prefix `/store/discounts`
`store/discounts.controller.ts:29`  |  class decorators: `—`

### GET `/store/discounts/bulk`

- Handler: `DiscountsController.listBulk()` — `store/discounts.controller.ts:33`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `discounts.listBulk()`
- Response type: `Promise<BulkDiscount[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/discounts/loyalty`

- Handler: `DiscountsController.listLoyalty()` — `store/discounts.controller.ts:38`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `discounts.listLoyalty()`
- Response type: `Promise<LoyaltyDiscount[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminDiscountsController` — prefix `/admin/store/discounts`
`store/discounts.controller.ts:44`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### POST `/admin/store/discounts/bulk`

- Handler: `AdminDiscountsController.createBulk()` — `store/discounts.controller.ts:50`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.bulk.create`
- Body DTO: `CreateBulkDiscountDto`
- Service call: `discounts.createBulk()`
- Response type: `Promise<BulkDiscount>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/discounts/bulk/:id`

- Handler: `AdminDiscountsController.updateBulk()` — `store/discounts.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.bulk.edit`
- Path params: `id`
- Body DTO: `UpdateBulkDiscountDto`
- Service call: `discounts.updateBulk()`
- Response type: `Promise<BulkDiscount>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/discounts/bulk/:id`

- Handler: `AdminDiscountsController.removeBulk()` — `store/discounts.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.bulk.delete`
- Path params: `id`
- Service call: `discounts.removeBulk()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/store/discounts/loyalty`

- Handler: `AdminDiscountsController.createLoyalty()` — `store/discounts.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.loyalty.create`
- Body DTO: `CreateLoyaltyDiscountDto`
- Service call: `discounts.createLoyalty()`
- Response type: `Promise<LoyaltyDiscount>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/discounts/loyalty/:id`

- Handler: `AdminDiscountsController.updateLoyalty()` — `store/discounts.controller.ts:76`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.loyalty.edit`
- Path params: `id`
- Body DTO: `UpdateLoyaltyDiscountDto`
- Service call: `discounts.updateLoyalty()`
- Response type: `Promise<LoyaltyDiscount>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/discounts/loyalty/:id`

- Handler: `AdminDiscountsController.removeLoyalty()` — `store/discounts.controller.ts:84`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.discounts.loyalty.delete`
- Path params: `id`
- Service call: `discounts.removeLoyalty()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `StoreExtrasController` — prefix `/store`
`store/orders.controller.ts:31`  |  class decorators: `—`

### GET `/store/recent-purchases`

- Handler: `StoreExtrasController.recentPurchases()` — `store/orders.controller.ts:35`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `orders.recentPurchases()`
- Response type: `Promise<RecentPurchaseItem[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/quick-buy`

- Handler: `StoreExtrasController.quickBuy()` — `store/orders.controller.ts:42`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Body DTO: `QuickBuyDto`
- Service call: `orders.quickBuy()`
- Response type: `Promise<QuickBuyResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `OrdersController` — prefix `/store/orders`
`store/orders.controller.ts:49`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### POST `/store/orders`

- Handler: `OrdersController.create()` — `store/orders.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateOrderDto`
- Service call: `orders.createFromCart()`
- Response type: `Promise<CreateOrderResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/orders`

- Handler: `OrdersController.list()` — `store/orders.controller.ts:63`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `orders.listMine()`
- Response type: `Promise<OrdersResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/orders/:orderNumber`

- Handler: `OrdersController.getByNumber()` — `store/orders.controller.ts:72`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `orderNumber`
- Service call: `orders.getByOrderNumber()`
- Response type: `Promise<StoreOrder>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/orders/:orderId/mock-complete`

- Handler: `OrdersController.mockComplete()` — `store/orders.controller.ts:80`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `orderId`
- Service call: `orders.mockComplete()`
- Response type: `Promise<StoreOrder>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminOrdersController` — prefix `/admin/orders`
`store/orders.controller.ts:89`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/orders`

- Handler: `AdminOrdersController.list()` — `store/orders.controller.ts:95`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `orders.view`
- Query DTO: `OrderStatus`, `string`
- Service call: `orders.listAdmin()`
- Response type: `Promise<OrdersResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/orders/stats`

- Handler: `AdminOrdersController.stats()` — `store/orders.controller.ts:105`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `orders.stats`
- Service call: `orders.stats()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/orders/:id/cancel`

- Handler: `AdminOrdersController.cancel()` — `store/orders.controller.ts:110`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `orders.cancel`
- Path params: `id`
- Body DTO: `CancelOrderDto`
- Service call: `orders.cancel()`
- Response type: `Promise<StoreOrder>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/orders/:id/refund`

- Handler: `AdminOrdersController.refund()` — `store/orders.controller.ts:118`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `orders.refund`
- Path params: `id`
- Body DTO: `RefundOrderDto`
- Service call: `orders.refund()`
- Response type: `Promise<StoreOrder>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `ProductsController` — prefix `/store/products`
`store/products.controller.ts:37`  |  class decorators: `—`

### GET `/store/products`

- Handler: `ProductsController.list()` — `store/products.controller.ts:41`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Query DTO: `string`, `ProductType`, `string`
- Service call: `products.list()`
- Response type: `Promise<StoreProductsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/products/:slug/bought-together`

- Handler: `ProductsController.getBoughtTogether()` — `store/products.controller.ts:66`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `products.getBoughtTogether()`
- Response type: `Promise<StoreProduct[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/products/:slug`

- Handler: `ProductsController.getBySlug()` — `store/products.controller.ts:71`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `products.getBySlug()`
- Response type: `Promise<StoreProduct>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminProductsController` — prefix `/admin/store/products`
`store/products.controller.ts:81`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/store/products`

- Handler: `AdminProductsController.listAdmin()` — `store/products.controller.ts:87`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.view`
- Query DTO: `string`
- Service call: `products.listAdmin()`
- Response type: `Promise<StoreProductsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/store/products`

- Handler: `AdminProductsController.create()` — `store/products.controller.ts:96`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.create`
- Body DTO: `CreateProductDto`
- Service call: `products.create()`
- Response type: `Promise<StoreProduct>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/products/:id`

- Handler: `AdminProductsController.update()` — `store/products.controller.ts:102`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.edit`
- Path params: `id`
- Body DTO: `UpdateProductDto`
- Service call: `products.update()`
- Response type: `Promise<StoreProduct>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/products/:id`

- Handler: `AdminProductsController.remove()` — `store/products.controller.ts:107`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.delete`
- Path params: `id`
- Service call: `products.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/store/products/:id/variants`

- Handler: `AdminProductsController.createVariant()` — `store/products.controller.ts:113`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.variants`
- Path params: `id`
- Body DTO: `CreateVariantDto`
- Service call: `products.createVariant()`
- Response type: `Promise<ProductVariant>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/store/products/:id/variants/:variantId`

- Handler: `AdminProductsController.updateVariant()` — `store/products.controller.ts:122`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.variants`
- Path params: `id`, `variantId`
- Body DTO: `UpdateVariantDto`
- Service call: `products.updateVariant()`
- Response type: `Promise<ProductVariant>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/store/products/:id/variants/:variantId`

- Handler: `AdminProductsController.removeVariant()` — `store/products.controller.ts:131`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.products.variants`
- Path params: `id`, `variantId`
- Service call: `products.removeVariant()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `PromocodesController` — prefix `/store/promocodes`
`store/promocodes.controller.ts:25`  |  class decorators: `—`

### POST `/store/promocodes/validate`

- Handler: `PromocodesController.validate()` — `store/promocodes.controller.ts:29`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `ValidatePromoDto`
- Service call: `cart.validatePromo()`
- Response type: `Promise<PromoValidationResult>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminPromocodesController` — prefix `/admin/promocodes`
`store/promocodes.controller.ts:39`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/promocodes`

- Handler: `AdminPromocodesController.list()` — `store/promocodes.controller.ts:45`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `promocodes.view`
- Query DTO: `string`
- Service call: `promocodes.list()`
- Response type: `Promise<PromoCodeAdminView[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/promocodes`

- Handler: `AdminPromocodesController.create()` — `store/promocodes.controller.ts:50`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `promocodes.create`
- Body DTO: `CreatePromoCodeDto`
- Service call: `promocodes.create()`
- Response type: `Promise<PromoCodeAdminView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/promocodes/:id`

- Handler: `AdminPromocodesController.update()` — `store/promocodes.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `promocodes.edit`
- Path params: `id`
- Body DTO: `UpdatePromoCodeDto`
- Service call: `promocodes.update()`
- Response type: `Promise<PromoCodeAdminView>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/promocodes/:id`

- Handler: `AdminPromocodesController.remove()` — `store/promocodes.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `promocodes.delete`
- Path params: `id`
- Service call: `promocodes.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminStoreStatsController` — prefix `/admin/store/stats`
`store/stats.controller.ts:21`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/store/stats`

- Handler: `AdminStoreStatsController.getAll()` — `store/stats.controller.ts:27`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats`
- Service call: `stats.getAll()`
- Response type: `Promise<AdminStoreStatsResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/store/stats/overview`

- Handler: `AdminStoreStatsController.overview()` — `store/stats.controller.ts:32`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats.overview.view`
- Service call: `stats.overview()`
- Response type: `Promise<AdminStoreStatsOverview>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/store/stats/sales-by-day`

- Handler: `AdminStoreStatsController.salesByDay()` — `store/stats.controller.ts:37`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats.sales_by_day.view`
- Service call: `stats.salesByDay()`
- Response type: `Promise<AdminStoreStatsPoint[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/store/stats/sales-by-category`

- Handler: `AdminStoreStatsController.salesByCategory()` — `store/stats.controller.ts:44`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats.sales_by_category.view`
- Service call: `stats.salesByCategory()`
- Response type: `Promise<AdminStoreStatsBreakdown[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/store/stats/top-products`

- Handler: `AdminStoreStatsController.topProducts()` — `store/stats.controller.ts:49`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats.top_products.view`
- Service call: `stats.topProducts()`
- Response type: `Promise<AdminStoreStatsBreakdown[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/store/stats/revenue-by-week`

- Handler: `AdminStoreStatsController.revenueByWeek()` — `store/stats.controller.ts:56`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `store.stats.revenue_by_week.view`
- Service call: `stats.revenueByWeek()`
- Response type: `Promise<AdminStoreStatsPoint[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `WishlistController` — prefix `/store/wishlist`
`store/wishlist.controller.ts:23`  |  class decorators: `—`

### GET `/store/wishlist`

- Handler: `WishlistController.getWishlist()` — `store/wishlist.controller.ts:27`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `wishlist.getWishlist()`
- Response type: `Promise<WishlistResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/wishlist/items/:productId`

- Handler: `WishlistController.addItem()` — `store/wishlist.controller.ts:33`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `productId`
- Service call: `wishlist.addItem()`
- Response type: `Promise<WishlistResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/store/wishlist/items/:productId`

- Handler: `WishlistController.removeItem()` — `store/wishlist.controller.ts:43`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `productId`
- Service call: `wishlist.removeItem()`
- Response type: `Promise<WishlistResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/store/wishlist`

- Handler: `WishlistController.updateVisibility()` — `store/wishlist.controller.ts:52`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateWishlistDto`
- Service call: `wishlist.updateVisibility()`
- Response type: `Promise<WishlistResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/store/wishlist/items/:productId/gift`

- Handler: `WishlistController.giftItem()` — `store/wishlist.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `productId`
- Body DTO: `GiftWishlistItemDto`
- Service call: см. тело метода
- Response type: `Promise<`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/store/wishlist/:username`

- Handler: `WishlistController.getPublic()` — `store/wishlist.controller.ts:71`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `wishlist.getPublicByUsername()`
- Response type: `Promise<PublicWishlistResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `streaming`

## Controller `StreamingController` — prefix `/streams`
`streaming/streaming.controller.ts:20`  |  class decorators: `—`

### GET `/streams`

- Handler: `StreamingController.list()` — `streaming/streaming.controller.ts:24`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `streaming.publicList()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminStreamingController` — prefix `/admin/streams`
`streaming/streaming.controller.ts:30`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/streams`

- Handler: `AdminStreamingController.list()` — `streaming/streaming.controller.ts:36`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `streams.view`
- Service call: `streaming.adminList()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/streams`

- Handler: `AdminStreamingController.create()` — `streaming/streaming.controller.ts:41`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `streams.create`
- Body DTO: `CreateStreamChannelDto`
- Service call: `streaming.create()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/streams/:id`

- Handler: `AdminStreamingController.update()` — `streaming/streaming.controller.ts:46`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `streams.edit`
- Path params: `id`
- Body DTO: `UpdateStreamChannelDto`
- Service call: `streaming.update()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/streams/:id`

- Handler: `AdminStreamingController.remove()` — `streaming/streaming.controller.ts:51`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `streams.delete`
- Path params: `id`
- Service call: `streaming.remove()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/streams/refresh`

- Handler: `AdminStreamingController.refresh()` — `streaming/streaming.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `streams.refresh.create`
- Service call: `streaming.refresh()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `system`

## Controller `SystemController` — prefix `/`
`system/system.controller.ts:102`  |  class decorators: `—`

### GET `/system/status`

- Handler: `SystemController.getStatus()` — `system/system.controller.ts:106`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `system.getPublicStatus()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/system/modules`

- Handler: `SystemController.getModules()` — `system/system.controller.ts:111`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `system.listModules()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/announcements/active`

- Handler: `SystemController.getActiveAnnouncements()` — `system/system.controller.ts:116`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `system.listActiveAnnouncements()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/maintenance/enable`

- Handler: `SystemController.enableMaintenance()` — `system/system.controller.ts:121`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `maintenance.enable`
- Body DTO: `EnableMaintenanceDto`
- Service call: `system.enableMaintenance()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/maintenance/disable`

- Handler: `SystemController.disableMaintenance()` — `system/system.controller.ts:131`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `maintenance.disable`
- Service call: `system.disableMaintenance()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/maintenance/status`

- Handler: `SystemController.maintenanceStatus()` — `system/system.controller.ts:138`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `maintenance.status`
- Service call: `system.getMaintenanceStatus()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/modules/:module`

- Handler: `SystemController.updateModule()` — `system/system.controller.ts:145`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `modules.edit`
- Path params: `module`
- Body DTO: `UpdateModuleDto`
- Service call: `system.updateModule()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/announcements`

- Handler: `SystemController.listAnnouncements()` — `system/system.controller.ts:156`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `announcements.view`
- Service call: `system.listAllAnnouncements()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/announcements`

- Handler: `SystemController.createAnnouncement()` — `system/system.controller.ts:163`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `announcements.create`
- Body DTO: `AnnouncementDto`
- Service call: `system.createAnnouncement()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/announcements/:id`

- Handler: `SystemController.updateAnnouncement()` — `system/system.controller.ts:173`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `announcements.edit`
- Path params: `id`
- Body DTO: `Partial<AnnouncementDto>`
- Service call: `system.updateAnnouncement()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/announcements/:id`

- Handler: `SystemController.deleteAnnouncement()` — `system/system.controller.ts:180`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `announcements.delete`
- Path params: `id`
- Service call: `system.deleteAnnouncement()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `topics`

## Controller `TopicsController` — prefix `/`
`topics/topics.controller.ts:39`  |  class decorators: `—`

### GET `/topics`

- Handler: `TopicsController.list()` — `topics/topics.controller.ts:43`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `ListTopicsQueryDto`
- Service call: `topics.listPublic()`
- Response type: `Promise<PaginatedResponse<TopicSummary>>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/topics/:slug`

- Handler: `TopicsController.getBySlug()` — `topics/topics.controller.ts:52`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `slug`
- Service call: `topics.getBySlug()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/topics`

- Handler: `TopicsController.listAdmin()` — `topics/topics.controller.ts:61`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.view`
- Service call: `topics.listAdmin()`
- Response type: `Promise<TopicSummary[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/topics/:id`

- Handler: `TopicsController.getAdminById()` — `topics/topics.controller.ts:68`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.view`
- Path params: `id`
- Service call: `topics.getAdminById()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/topics`

- Handler: `TopicsController.create()` — `topics/topics.controller.ts:75`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.create`
- Body DTO: `CreateTopicDto`
- Service call: `topics.create()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/topics/:id`

- Handler: `TopicsController.update()` — `topics/topics.controller.ts:86`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.edit`
- Path params: `id`
- Body DTO: `UpdateTopicDto`
- Service call: `topics.update()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/topics/:id`

- Handler: `TopicsController.remove()` — `topics/topics.controller.ts:97`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.delete`
- Path params: `id`
- Service call: `topics.remove()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/topics/reorder`

- Handler: `TopicsController.reorder()` — `topics/topics.controller.ts:105`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.reorder`
- Body DTO: `ReorderTopicsDto`
- Service call: `topics.reorder()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/topics/:id/pin`

- Handler: `TopicsController.pin()` — `topics/topics.controller.ts:113`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.pin`
- Path params: `id`
- Service call: `topics.pin()`
- Response type: `Promise<TopicSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/topics/:id/unpin`

- Handler: `TopicsController.unpin()` — `topics/topics.controller.ts:123`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.unpin`
- Path params: `id`
- Service call: `topics.unpin()`
- Response type: `Promise<TopicSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/topics/:id/attachments`

- Handler: `TopicsController.addAttachment()` — `topics/topics.controller.ts:133`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.attachments`
- Path params: `id`
- Upload: multipart (Multer interceptor)
- Service call: `topics.addAttachment()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/topics/:id/attachments/:attachmentId`

- Handler: `TopicsController.removeAttachment()` — `topics/topics.controller.ts:155`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `OWNER`; Proposed permission: `topics.attachments`
- Path params: `id`, `attachmentId`
- Service call: `topics.removeAttachment()`
- Response type: `Promise<TopicDetails>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `users`

## Controller `MeController` — prefix `/users/me`
`users/me.controller.ts:39`  |  class decorators: `@UseGuards(JwtAuthGuard)`

### GET `/users/me/profile`

- Handler: `MeController.getProfile()` — `users/me.controller.ts:44`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `users.getMyProfile()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/me/profile`

- Handler: `MeController.updateProfile()` — `users/me.controller.ts:49`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateProfileDto`
- Service call: `users.updateMyProfile()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/me/badges/order`

- Handler: `MeController.updateBadgesOrder()` — `users/me.controller.ts:57`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateBadgesOrderDto`
- Service call: `users.updateBadgesOrder()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/me/awards/order`

- Handler: `MeController.updateAwardsOrder()` — `users/me.controller.ts:65`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `UpdateAwardsOrderDto`
- Service call: `users.updateAwardsOrder()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/me/display-badge`

- Handler: `MeController.setDisplayBadge()` — `users/me.controller.ts:73`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `SetDisplayBadgeDto`
- Service call: `users.setDisplayBadge()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/me/avatar`

- Handler: `MeController.uploadAvatar()` — `users/me.controller.ts:81`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Upload: multipart (Multer interceptor)
- Service call: `users.uploadAvatar()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/me/avatar`

- Handler: `MeController.deleteAvatar()` — `users/me.controller.ts:98`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `users.deleteAvatar()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/me/banner`

- Handler: `MeController.uploadBanner()` — `users/me.controller.ts:103`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Upload: multipart (Multer interceptor)
- Service call: `users.uploadBanner()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/me/banner`

- Handler: `MeController.deleteBanner()` — `users/me.controller.ts:120`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `users.deleteBanner()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/users/me/banner/preset`

- Handler: `MeController.setBannerPreset()` — `users/me.controller.ts:125`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `SetBannerPresetDto`
- Service call: `users.setBannerPreset()`
- Response type: `Promise<MyProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/me/socials`

- Handler: `MeController.listSocials()` — `users/me.controller.ts:133`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `users.listMySocials()`
- Response type: `Promise<SocialLink[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PUT `/users/me/socials/:platform`

- Handler: `MeController.upsertSocial()` — `users/me.controller.ts:138`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `platform`
- Body DTO: `UpsertSocialLinkDto`
- Service call: `users.upsertSocial()`
- Response type: `Promise<SocialLink>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/users/me/socials/:platform`

- Handler: `MeController.deleteSocial()` — `users/me.controller.ts:147`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `platform`
- Service call: `users.deleteSocial()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/me/media-request`

- Handler: `MeController.createMediaRequest()` — `users/me.controller.ts:156`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Body DTO: `CreateMediaRequestDto`
- Service call: `users.createMediaRequest()`
- Response type: `Promise<MediaBadgeRequest>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/me/media-requests`

- Handler: `MeController.listMediaRequests()` — `users/me.controller.ts:165`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `users.listMyMediaRequests()`
- Response type: `Promise<MediaBadgeRequest[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `BannersController` — prefix `/banners`
`users/me.controller.ts:171`  |  class decorators: `—`

### GET `/banners/presets`

- Handler: `BannersController.listPresets()` — `users/me.controller.ts:175`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Service call: `users.listBannerPresets()`
- Response type: `Promise<BannerPreset[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `UsersController` — prefix `/users`
`users/users.controller.ts:43`  |  class decorators: `—`

### GET `/users/search`

- Handler: `UsersController.search()` — `users/users.controller.ts:47`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `SearchUsersDto`
- Service call: `users.search()`
- Response type: `Promise<UserSearchResult[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/search-mentions`

- Handler: `UsersController.searchMentions()` — `users/users.controller.ts:53`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Query DTO: `SearchMentionsDto`
- Service call: `users.searchMentions()`
- Response type: `Promise<MentionSearchResult[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/search-hint`

- Handler: `UsersController.searchHint()` — `users/users.controller.ts:59`
- Authentication: **public**
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `users.searchHint()`
- Response type: `Promise<UserSearchHint>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/public`

- Handler: `UsersController.findPublic()` — `users/users.controller.ts:65`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `users.findPublicProfile()`
- Response type: `Promise<UserProfile>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/users/:username/statistics`

- Handler: `UsersController.getStatistics()` — `users/users.controller.ts:74`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `users.getStatistics()`
- Response type: `Promise<PlayerStatistics>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/view`

- Handler: `UsersController.recordView()` — `users/users.controller.ts:83`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Service call: `users.recordView()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PUT `/users/:username/reaction`

- Handler: `UsersController.setReaction()` — `users/users.controller.ts:93`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Body DTO: `SetReactionDto`
- Service call: `users.setReaction()`
- Response type: `Promise<ProfileReactionSummary>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/users/:username/report`

- Handler: `UsersController.report()` — `users/users.controller.ts:103`
- Authentication: **required**; guards: `JwtAuthGuard`
- Min RoleGroup: `-`
- Path params: `username`
- Body DTO: `CreateProfileReportDto`
- Service call: `users.createReport()`
- Response type: `Promise<SuccessResponse>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminUsersController` — prefix `/admin`
`users/users.controller.ts:115`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/users/:userId/badges`

- Handler: `AdminUsersController.listBadges()` — `users/users.controller.ts:121`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.badges`
- Path params: `userId`
- Service call: `users.listUserBadges()`
- Response type: `Promise<UserBadge[]>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/users/:userId/badges`

- Handler: `AdminUsersController.grantBadge()` — `users/users.controller.ts:126`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.badges`
- Path params: `userId`
- Body DTO: `GrantBadgeDto`
- Service call: `users.grantBadge()`
- Response type: `Promise<UserBadge>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/users/:userId/badges/:type`

- Handler: `AdminUsersController.revokeBadge()` — `users/users.controller.ts:136`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.badges`
- Path params: `userId`, `type`
- Service call: `users.revokeBadge()`
- Response type: `Promise<void>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/users/:userId/statistics`

- Handler: `AdminUsersController.updateStatistics()` — `users/users.controller.ts:142`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `users.statistics`
- Path params: `userId`
- Body DTO: `UpdateStatisticsDto`
- Service call: `users.updateStatistics()`
- Response type: `Promise<PlayerStatistics>`
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/media-requests`

- Handler: `AdminUsersController.listMediaRequests()` — `users/users.controller.ts:150`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `media_requests.view`
- Service call: `users.listAdminMediaRequests()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/media-requests/:id`

- Handler: `AdminUsersController.reviewMediaRequest()` — `users/users.controller.ts:155`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `media_requests.edit`
- Path params: `id`
- Body DTO: `ReviewMediaRequestDto`
- Service call: `users.reviewMediaRequest()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### GET `/admin/profile-reports`

- Handler: `AdminUsersController.listReports()` — `users/users.controller.ts:164`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `profile_reports.view`
- Service call: `users.listProfileReports()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/profile-reports/:id`

- Handler: `AdminUsersController.reviewReport()` — `users/users.controller.ts:169`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `profile_reports.edit`
- Path params: `id`
- Body DTO: `ReviewProfileReportDto`
- Service call: `users.reviewProfileReport()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.


---

# Модуль `voting`

## Controller `VotingController` — prefix `/voting`
`voting/voting.controller.ts:23`  |  class decorators: `—`

### GET `/voting`

- Handler: `VotingController.overview()` — `voting/voting.controller.ts:27`
- Authentication: **optional**; guards: `OptionalJwtAuthGuard`
- Min RoleGroup: `-`
- Service call: `voting.overview()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/voting/webhook/:slug`

- Handler: `VotingController.processWebhook()` — `voting/voting.controller.ts:33`
- Authentication: **NONE (no guard)**
- Min RoleGroup: `-`
- Path params: `slug`
- Body DTO: `VoteWebhookDto`
- Service call: `voting.processWebhook()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

## Controller `AdminVotingController` — prefix `/admin/voting/sites`
`voting/voting.controller.ts:43`  |  class decorators: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleGroup.ADMIN)`

### GET `/admin/voting/sites`

- Handler: `AdminVotingController.list()` — `voting/voting.controller.ts:49`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `voting.sites.view`
- Service call: `voting.adminList()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/voting/sites`

- Handler: `AdminVotingController.create()` — `voting/voting.controller.ts:54`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `voting.sites.create`
- Body DTO: `CreateVoteSiteDto`
- Service call: `voting.create()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### PATCH `/admin/voting/sites/:id`

- Handler: `AdminVotingController.update()` — `voting/voting.controller.ts:59`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `voting.sites.edit`
- Path params: `id`
- Body DTO: `UpdateVoteSiteDto`
- Service call: `voting.update()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### DELETE `/admin/voting/sites/:id`

- Handler: `AdminVotingController.remove()` — `voting/voting.controller.ts:64`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `voting.sites.delete`
- Path params: `id`
- Service call: `voting.remove()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

### POST `/admin/voting/sites/:id/rotate-secret`

- Handler: `AdminVotingController.rotateSecret()` — `voting/voting.controller.ts:70`
- Authentication: **required**; guards: `JwtAuthGuard`, `RolesGuard`
- Min RoleGroup: `ADMIN`; Proposed permission: `voting.sites.rotate_secret`
- Path params: `id`
- Service call: `voting.rotateSecret()`
- Response type: не аннотирован; см. сервис
- Errors: 401 (если `required`), 403 (если RoleGroup/владение), 400 (validation), 429 (throttle); бизнес-ошибки 404/409 — см. сервис.

