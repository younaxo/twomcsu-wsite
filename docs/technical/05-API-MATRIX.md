# 05 — API Matrix

Автогенерируется из кода (`@Controller` + `@Get/@Post/@Put/@Patch/@Delete`). Глобального префикса `/api` и версионирования **нет** (`main.ts` не вызывает `setGlobalPrefix`/`enableVersioning`): путь = prefix контроллера + путь метода.

Всего endpoints: **497** (GET 202, POST 147, PUT 3, PATCH 72, DELETE 73). Контроллерных классов: **73**.

Колонка Auth: `public` = `@Public()`, `optional` = `OptionalJwtAuthGuard`, `required` = `JwtAuthGuard`, `NONE` = нет ни одного guard (проверить вручную). Колонка Permission сейчас содержит **минимальную RoleGroup** (`@Roles(RoleGroup.X)`), т.к. permission-системы пока нет (см. 10-RBAC-PERMISSIONS.md).

| # | Method | Endpoint | Module | Auth | Min RoleGroup | DTO (body / query) | Handler | Service call | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GET | `/achievements` | achievements | optional | - | ?AchievementCategory, ?AchievementRarity, ?AchievementFilter, ?string | `AchievementsController.list` | `achievements.getAllAchievements` | `achievements/achievements.controller.ts:26` |
| 2 | GET | `/achievements/:slug` | achievements | optional | - | - | `AchievementsController.bySlug` | `achievements.getAchievementBySlug` | `achievements/achievements.controller.ts:50` |
| 3 | GET | `/achievements/stats` | achievements | NONE (no guard) | - | - | `AchievementsController.stats` | `achievements.getStats` | `achievements/achievements.controller.ts:45` |
| 4 | GET | `/admin/achievements` | achievements | required | ADMIN | - | `AdminAchievementsController.list` | `achievements.listAdmin` | `achievements/admin-achievements.controller.ts:35` |
| 5 | POST | `/admin/achievements` | achievements | required | ADMIN | CreateAchievementDto | `AdminAchievementsController.create` | `achievements.create` | `achievements/admin-achievements.controller.ts:40` |
| 6 | DELETE | `/admin/achievements/:id` | achievements | required | ADMIN | - | `AdminAchievementsController.remove` | `achievements.remove` | `achievements/admin-achievements.controller.ts:54` |
| 7 | PATCH | `/admin/achievements/:id` | achievements | required | ADMIN | UpdateAchievementDto | `AdminAchievementsController.update` | `achievements.update` | `achievements/admin-achievements.controller.ts:46` |
| 8 | POST | `/admin/achievements/check-all-users` | achievements | required | ADMIN | - | `AdminAchievementsController.checkAll` | `-` | `achievements/admin-achievements.controller.ts:76` |
| 9 | POST | `/admin/achievements/upload-icon` | achievements | required | ADMIN | - | `AdminAchievementsController.uploadIcon` | `-` | `achievements/admin-achievements.controller.ts:60` |
| 10 | DELETE | `/moderation/users/:userId/achievements/:achievementId` | achievements | required | MODERATOR | - | `ModerationAchievementsController.revoke` | `achievements.revokeAchievement` | `achievements/moderation-achievements.controller.ts:31` |
| 11 | POST | `/moderation/users/:userId/achievements/:achievementId/grant` | achievements | required | MODERATOR | - | `ModerationAchievementsController.grant` | `achievements.grantAchievement` | `achievements/moderation-achievements.controller.ts:22` |
| 12 | GET | `/users/:username/achievements` | achievements | optional | - | - | `UserAchievementsController.byUsername` | `achievements.getUserAchievementsByUsername` | `achievements/user-achievements.controller.ts:29` |
| 13 | GET | `/users/me/achievements` | achievements | required | - | - | `UserAchievementsController.myAchievements` | `achievements.getUserAchievements` | `achievements/user-achievements.controller.ts:23` |
| 14 | POST | `/users/me/achievements/showcase` | achievements | required | - | SetShowcaseDto | `UserAchievementsController.setShowcase` | `achievements.setShowcase` | `achievements/user-achievements.controller.ts:38` |
| 15 | DELETE | `/users/me/achievements/showcase/:achievementId` | achievements | required | - | - | `UserAchievementsController.removeShowcase` | `achievements.removeFromShowcase` | `achievements/user-achievements.controller.ts:47` |
| 16 | GET | `/activity/:id` | activity | optional | - | - | `ActivityController.byId` | `activity.getById` | `activity/activity.controller.ts:87` |
| 17 | POST | `/activity/:id/comments` | activity | required | - | CreateActivityCommentDto | `ActivityController.addComment` | `activity.addComment` | `activity/activity.controller.ts:108` |
| 18 | POST | `/activity/:id/reactions` | activity | required | - | ActivityReactionDto | `ActivityController.react` | `activity.toggleReaction` | `activity/activity.controller.ts:96` |
| 19 | DELETE | `/activity/comments/:id` | activity | required | - | - | `ActivityController.deleteComment` | `activity.deleteComment` | `activity/activity.controller.ts:119` |
| 20 | GET | `/activity/feed` | activity | optional | - | ?ListActivityFeedQueryDto | `ActivityController.feed` | `activity.getFeed` | `activity/activity.controller.ts:38` |
| 21 | GET | `/activity/feed/global-highlights` | activity | optional | - | ?ActivityHighlightsQueryDto | `ActivityController.highlights` | `activity.getHighlights` | `activity/activity.controller.ts:57` |
| 22 | GET | `/activity/feed/user/:username` | activity | optional | - | ?ListActivityFeedQueryDto | `ActivityController.userFeed` | `activity.getUserFeed` | `activity/activity.controller.ts:47` |
| 23 | GET | `/activity/settings` | activity | required | - | - | `ActivityController.settings` | `activity.getSettings` | `activity/activity.controller.ts:70` |
| 24 | PATCH | `/activity/settings` | activity | required | - | UpdateActivitySettingsDto | `ActivityController.updateSettings` | `activity.updateSettings` | `activity/activity.controller.ts:78` |
| 25 | GET | `/admin/activity` | activity | required | ADMIN | ?AdminListActivityQueryDto | `ActivityAdminController.list` | `activity.adminList` | `activity/activity-admin.controller.ts:36` |
| 26 | POST | `/admin/activity/custom` | activity | required | ADMIN | CreateCustomActivityDto | `ActivityAdminController.custom` | `activity.createCustom` | `activity/activity-admin.controller.ts:43` |
| 27 | GET | `/admin/activity/stats` | activity | required | ADMIN | - | `ActivityAdminController.stats` | `activity.getStats` | `activity/activity-admin.controller.ts:31` |
| 28 | DELETE | `/moderation/activity/:id` | activity | required | MODERATOR | HideActivityDto | `ActivityModerationController.hide` | `activity.hideActivity` | `activity/activity-moderation.controller.ts:47` |
| 29 | DELETE | `/moderation/activity/:id/pin` | activity | required | ADMIN | - | `ActivityModerationController.unpin` | `activity.pinActivity` | `activity/activity-moderation.controller.ts:40` |
| 30 | POST | `/moderation/activity/:id/pin` | activity | required | ADMIN | - | `ActivityModerationController.pin` | `activity.pinActivity` | `activity/activity-moderation.controller.ts:34` |
| 31 | DELETE | `/moderation/activity/comments/:id` | activity | required | MODERATOR | - | `ActivityModerationController.deleteComment` | `activity.deleteComment` | `activity/activity-moderation.controller.ts:25` |
| 32 | GET | `/admin/audit-log` | admin | required | ADMIN | ?string, ?string, ?string, ?string, ?string, ?string, ?string | `AdminController.auditLog` | `audit.list` | `admin/admin.controller.ts:96` |
| 33 | GET | `/admin/audit-log/stats` | admin | required | ADMIN | - | `AdminController.auditStats` | `statistics.getAuditLogStats` | `admin/admin.controller.ts:121` |
| 34 | GET | `/admin/bookmarks` | admin | required | ADMIN | - | `AdminPanelController.bookmarks` | `tools.listBookmarks` | `admin/admin-panel.controller.ts:217` |
| 35 | POST | `/admin/bookmarks` | admin | required | ADMIN | BookmarkDto | `AdminPanelController.createBookmark` | `tools.createBookmark` | `admin/admin-panel.controller.ts:222` |
| 36 | DELETE | `/admin/bookmarks/:id` | admin | required | ADMIN | - | `AdminPanelController.deleteBookmark` | `tools.deleteBookmark` | `admin/admin-panel.controller.ts:236` |
| 37 | PATCH | `/admin/bookmarks/:id` | admin | required | ADMIN | Partial<BookmarkDto> | `AdminPanelController.updateBookmark` | `tools.updateBookmark` | `admin/admin-panel.controller.ts:227` |
| 38 | POST | `/admin/bookmarks/reorder` | admin | required | ADMIN | - | `AdminPanelController.reorderBookmarks` | `tools.reorderBookmarks` | `admin/admin-panel.controller.ts:241` |
| 39 | POST | `/admin/broadcast` | admin | required | ADMIN | BroadcastDto | `AdminController.broadcast` | `dashboard.broadcast, audit.log` | `admin/admin.controller.ts:128` |
| 40 | GET | `/admin/content/dashboard` | admin | required | ADMIN | - | `AdminPanelController.contentDashboard` | `finance.getContentDashboard` | `admin/admin-panel.controller.ts:331` |
| 41 | GET | `/admin/dashboard` | admin | required | ADMIN | - | `AdminController.getDashboard` | `dashboard.getDashboard` | `admin/admin.controller.ts:91` |
| 42 | GET | `/admin/exports/scheduled` | admin | required | ADMIN | - | `AdminPanelController.scheduledExports` | `tools.listScheduledExports` | `admin/admin-panel.controller.ts:250` |
| 43 | POST | `/admin/exports/scheduled` | admin | required | ADMIN | ScheduledExportDto | `AdminPanelController.createScheduled` | `tools.createScheduledExport` | `admin/admin-panel.controller.ts:255` |
| 44 | DELETE | `/admin/exports/scheduled/:id` | admin | required | ADMIN | - | `AdminPanelController.deleteScheduled` | `tools.deleteScheduledExport` | `admin/admin-panel.controller.ts:282` |
| 45 | PATCH | `/admin/exports/scheduled/:id` | admin | required | ADMIN | Partial<ScheduledExportDto | `AdminPanelController.updateScheduled` | `tools.updateScheduledExport` | `admin/admin-panel.controller.ts:266` |
| 46 | POST | `/admin/finance/export` | admin | required | ADMIN | - | `AdminPanelController.financeExport` | `exportService.exportOrders` | `admin/admin-panel.controller.ts:369` |
| 47 | GET | `/admin/finance/overview` | admin | required | ADMIN | - | `AdminPanelController.financeOverview` | `finance.getFinanceOverview` | `admin/admin-panel.controller.ts:337` |
| 48 | GET | `/admin/finance/refunds` | admin | required | ADMIN | - | `AdminPanelController.financeRefunds` | `finance.listRefunds` | `admin/admin-panel.controller.ts:361` |
| 49 | GET | `/admin/finance/transactions` | admin | required | ADMIN | ?OrderStatus, ?string, ?string, ?string | `AdminPanelController.financeTransactions` | `finance.listTransactions` | `admin/admin-panel.controller.ts:342` |
| 50 | GET | `/admin/saved-filters` | admin | required | ADMIN | ?string | `AdminPanelController.savedFilters` | `tools.listSavedFilters` | `admin/admin-panel.controller.ts:185` |
| 51 | POST | `/admin/saved-filters` | admin | required | ADMIN | SavedFilterDto | `AdminPanelController.createSavedFilter` | `tools.createSavedFilter` | `admin/admin-panel.controller.ts:190` |
| 52 | DELETE | `/admin/saved-filters/:id` | admin | required | ADMIN | - | `AdminPanelController.deleteSavedFilter` | `tools.deleteSavedFilter` | `admin/admin-panel.controller.ts:211` |
| 53 | PATCH | `/admin/saved-filters/:id` | admin | required | ADMIN | Partial<SavedFilterDto> | `AdminPanelController.updateSavedFilter` | `tools.updateSavedFilter` | `admin/admin-panel.controller.ts:198` |
| 54 | POST | `/admin/security/ip-whitelist` | admin | required | ADMIN | IpWhitelistDto | `AdminPanelController.ipWhitelist` | `tools.updateIpWhitelist` | `admin/admin-panel.controller.ts:325` |
| 55 | GET | `/admin/security/logins` | admin | required | ADMIN | ?string | `AdminPanelController.logins` | `tools.listLoginHistory` | `admin/admin-panel.controller.ts:316` |
| 56 | GET | `/admin/security/sessions` | admin | required | ADMIN | ?string | `AdminPanelController.sessions` | `tools.listActiveSessions` | `admin/admin-panel.controller.ts:302` |
| 57 | GET | `/admin/security/suspicious` | admin | required | ADMIN | - | `AdminPanelController.suspicious` | `tools.listSuspiciousActivity` | `admin/admin-panel.controller.ts:311` |
| 58 | GET | `/admin/settings` | admin | required | ADMIN | - | `AdminController.getSettings` | `dashboard.getSettings` | `admin/admin.controller.ts:142` |
| 59 | PATCH | `/admin/settings` | admin | required | ADMIN | UpsertSettingsDto | `AdminController.updateSettings` | `dashboard.getSettings, dashboard.upsertSettings` | `admin/admin.controller.ts:147` |
| 60 | GET | `/admin/settings/site` | admin | required | ADMIN | - | `AdminPanelController.siteSettings` | `tools.getSiteSettings` | `admin/admin-panel.controller.ts:288` |
| 61 | PATCH | `/admin/settings/site` | admin | required | ADMIN | Record<string | `AdminPanelController.updateSiteSettings` | `tools.updateSiteSettings` | `admin/admin-panel.controller.ts:293` |
| 62 | GET | `/admin/users` | admin | required | ADMIN | ?string, ?string, ?string, ?string, ?string, ?string, ?string, ?string, ?string, ?string | `AdminPanelController.listUsers` | `users.listUsers` | `admin/admin-panel.controller.ts:139` |
| 63 | GET | `/admin/users/:id/full` | admin | required | ADMIN | - | `AdminPanelController.userFull` | `users.getUserFull` | `admin/admin-panel.controller.ts:177` |
| 64 | PATCH | `/admin/users/bulk` | admin | required | ADMIN | BulkUsersDto | `AdminPanelController.bulkUsers` | `users.bulkUpdate` | `admin/admin-panel.controller.ts:172` |
| 65 | POST | `/auth/change-password` | auth | required | - | ChangePasswordDto | `AuthController.changePassword` | `authService.changePassword` | `auth/auth.controller.ts:119` |
| 66 | POST | `/auth/forgot-password` | auth | NONE (no guard) | - | ForgotPasswordDto | `AuthController.forgotPassword` | `authService.forgotPassword` | `auth/auth.controller.ts:92` |
| 67 | POST | `/auth/login` | auth | NONE (no guard) | - | LoginDto | `AuthController.login` | `authService.login` | `auth/auth.controller.ts:61` |
| 68 | POST | `/auth/logout` | auth | required | - | - | `AuthController.logout` | `-` | `auth/auth.controller.ts:165` |
| 69 | GET | `/auth/me` | auth | required | - | - | `AuthController.me` | `authService.findById` | `auth/auth.controller.ts:178` |
| 70 | POST | `/auth/refresh` | auth | NONE (no guard) | - | RefreshDto | `AuthController.refresh` | `authService.refresh` | `auth/auth.controller.ts:78` |
| 71 | POST | `/auth/register` | auth | NONE (no guard) | - | RegisterDto | `AuthController.register` | `authService.register` | `auth/auth.controller.ts:48` |
| 72 | POST | `/auth/reset-password` | auth | NONE (no guard) | - | ResetPasswordDto | `AuthController.resetPassword` | `authService.resetPassword` | `auth/auth.controller.ts:107` |
| 73 | DELETE | `/auth/sessions` | auth | required | - | - | `AuthController.revokeAllSessions` | `authService.revokeAllSessions` | `auth/auth.controller.ts:144` |
| 74 | GET | `/auth/sessions` | auth | required | - | - | `AuthController.listSessions` | `authService.listSessions` | `auth/auth.controller.ts:135` |
| 75 | DELETE | `/auth/sessions/:id` | auth | required | - | - | `AuthController.revokeSession` | `authService.revokeSession` | `auth/auth.controller.ts:155` |
| 76 | GET | `/admin/awards` | awards | required | ADMIN | - | `AwardsController.listAdmin` | `awards.listAdmin` | `awards/awards.controller.ts:31` |
| 77 | POST | `/admin/awards` | awards | required | OWNER | CreateAwardDto | `AwardsController.create` | `awards.create` | `awards/awards.controller.ts:38` |
| 78 | DELETE | `/admin/awards/:id` | awards | required | OWNER | - | `AwardsController.remove` | `awards.remove` | `awards/awards.controller.ts:53` |
| 79 | PATCH | `/admin/awards/:id` | awards | required | OWNER | UpdateAwardDto | `AwardsController.update` | `awards.update` | `awards/awards.controller.ts:46` |
| 80 | DELETE | `/admin/users/:userId/awards/:awardId` | awards | required | ADMIN | - | `AwardsController.revoke` | `awards.revoke` | `awards/awards.controller.ts:73` |
| 81 | POST | `/admin/users/:userId/awards/:awardId` | awards | required | ADMIN | - | `AwardsController.assign` | `awards.assign` | `awards/awards.controller.ts:61` |
| 82 | GET | `/awards` | awards | NONE (no guard) | - | - | `AwardsController.listPublic` | `awards.listPublic` | `awards/awards.controller.ts:26` |
| 83 | GET | `/admin/chat/bans` | chat | required | ADMIN | - | `AdminChatController.listBans` | `moderation.listBans` | `chat/admin-chat.controller.ts:64` |
| 84 | DELETE | `/admin/chat/bans/:id` | chat | required | ADMIN | - | `AdminChatController.unban` | `moderation.unban` | `chat/admin-chat.controller.ts:69` |
| 85 | POST | `/admin/chat/channels` | chat | required | ADMIN | CreateChannelDto | `AdminChatController.createChannel` | `channels.create` | `chat/admin-chat.controller.ts:37` |
| 86 | DELETE | `/admin/chat/channels/:id` | chat | required | ADMIN | - | `AdminChatController.deleteChannel` | `channels.remove` | `chat/admin-chat.controller.ts:48` |
| 87 | PATCH | `/admin/chat/channels/:id` | chat | required | ADMIN | UpdateChannelDto | `AdminChatController.updateChannel` | `channels.update` | `chat/admin-chat.controller.ts:43` |
| 88 | GET | `/admin/chat/messages/:id` | chat | required | ADMIN | - | `AdminChatController.getMessage` | `messages.getById` | `chat/admin-chat.controller.ts:82` |
| 89 | GET | `/admin/chat/messages/search` | chat | required | ADMIN | ?string | `AdminChatController.search` | `messages.search` | `chat/admin-chat.controller.ts:74` |
| 90 | GET | `/admin/chat/mutes` | chat | required | ADMIN | - | `AdminChatController.listMutes` | `moderation.listMutes` | `chat/admin-chat.controller.ts:54` |
| 91 | DELETE | `/admin/chat/mutes/:id` | chat | required | ADMIN | - | `AdminChatController.unmute` | `moderation.unmute` | `chat/admin-chat.controller.ts:59` |
| 92 | GET | `/admin/chat/settings` | chat | required | ADMIN | - | `AdminChatController.getSettings` | `moderation.getSettings` | `chat/admin-chat.controller.ts:87` |
| 93 | PATCH | `/admin/chat/settings` | chat | required | ADMIN | ChatSettingsDto | `AdminChatController.updateSettings` | `moderation.updateSettings` | `chat/admin-chat.controller.ts:92` |
| 94 | GET | `/chat/channels` | chat | NONE (no guard) | - | - | `ChatController.listChannels` | `channels.listActive` | `chat/chat.controller.ts:22` |
| 95 | GET | `/chat/channels/:slug` | chat | NONE (no guard) | - | - | `ChatController.getChannel` | `channels.getBySlug` | `chat/chat.controller.ts:27` |
| 96 | GET | `/chat/channels/:slug/messages` | chat | optional | - | ?string | `ChatController.getMessages` | `messages.getHistory` | `chat/chat.controller.ts:32` |
| 97 | GET | `/chat/channels/:slug/online` | chat | NONE (no guard) | - | - | `ChatController.getOnline` | `channels.getBySlug, messages.getOnlineUsers` | `chat/chat.controller.ts:43` |
| 98 | GET | `/chat/channels/:slug/pinned` | chat | optional | - | - | `ChatController.getPinned` | `messages.getPinned` | `chat/chat.controller.ts:49` |
| 99 | GET | `/admin/comment-reports` | comments | required | MODERATOR | ?string | `AdminCommentsController.listReports` | `comments.listCommentReports` | `comments/comments.controller.ts:184` |
| 100 | PATCH | `/admin/comment-reports/:id` | comments | required | MODERATOR | ReviewCommentReportDto | `AdminCommentsController.reviewReport` | `comments.reviewCommentReport` | `comments/comments.controller.ts:198` |
| 101 | DELETE | `/admin/comments/:id` | comments | required | MODERATOR | - | `AdminCommentsController.hardDelete` | `comments.hardDeleteComment` | `comments/comments.controller.ts:207` |
| 102 | POST | `/admin/users/:userId/comments/disable` | comments | required | MODERATOR | ForceDisableCommentsDto | `AdminCommentsController.disable` | `comments.forceDisableComments` | `comments/comments.controller.ts:165` |
| 103 | POST | `/admin/users/:userId/comments/enable` | comments | required | MODERATOR | - | `AdminCommentsController.enable` | `comments.forceEnableComments` | `comments/comments.controller.ts:175` |
| 104 | GET | `/users/:username/comments` | comments | optional | - | ?string | `CommentsController.list` | `comments.getComments` | `comments/comments.controller.ts:47` |
| 105 | POST | `/users/:username/comments` | comments | required | - | CreateCommentDto | `CommentsController.create` | `comments.createComment` | `comments/comments.controller.ts:66` |
| 106 | DELETE | `/users/:username/comments/:id` | comments | required | - | DeleteCommentDto | `CommentsController.remove` | `comments.deleteComment` | `comments/comments.controller.ts:88` |
| 107 | PATCH | `/users/:username/comments/:id` | comments | required | - | UpdateCommentDto | `CommentsController.update` | `comments.updateComment` | `comments/comments.controller.ts:77` |
| 108 | POST | `/users/:username/comments/:id/pin` | comments | required | - | - | `CommentsController.pin` | `comments.pinComment` | `comments/comments.controller.ts:100` |
| 109 | POST | `/users/:username/comments/:id/reactions` | comments | required | - | AddCommentReactionDto | `CommentsController.addReaction` | `comments.addReaction` | `comments/comments.controller.ts:122` |
| 110 | DELETE | `/users/:username/comments/:id/reactions/:emoji` | comments | required | - | - | `CommentsController.removeReaction` | `comments.removeReaction` | `comments/comments.controller.ts:134` |
| 111 | POST | `/users/:username/comments/:id/report` | comments | required | - | ReportCommentDto | `CommentsController.report` | `comments.reportComment` | `comments/comments.controller.ts:146` |
| 112 | POST | `/users/:username/comments/:id/unpin` | comments | required | - | - | `CommentsController.unpin` | `comments.unpinComment` | `comments/comments.controller.ts:111` |
| 113 | GET | `/users/me/consent` | consent | required | - | - | `ConsentController.get` | `consent.get` | `consent/consent.controller.ts:26` |
| 114 | PUT | `/users/me/consent` | consent | required | - | UpdateConsentDto | `ConsentController.save` | `consent.save` | `consent/consent.controller.ts:31` |
| 115 | GET | `/admin/custom-positions` | custom-positions | required | OWNER | - | `CustomPositionsController.listAdmin` | `customPositions.listAdmin` | `custom-positions/custom-positions.controller.ts:32` |
| 116 | POST | `/admin/custom-positions` | custom-positions | required | OWNER | CreateCustomPositionDto | `CustomPositionsController.create` | `customPositions.create` | `custom-positions/custom-positions.controller.ts:39` |
| 117 | DELETE | `/admin/custom-positions/:id` | custom-positions | required | OWNER | - | `CustomPositionsController.remove` | `customPositions.remove` | `custom-positions/custom-positions.controller.ts:57` |
| 118 | PATCH | `/admin/custom-positions/:id` | custom-positions | required | OWNER | UpdateCustomPositionDto | `CustomPositionsController.update` | `customPositions.update` | `custom-positions/custom-positions.controller.ts:50` |
| 119 | DELETE | `/admin/users/:userId/custom-position` | custom-positions | required | OWNER | - | `CustomPositionsController.unassign` | `customPositions.unassign` | `custom-positions/custom-positions.controller.ts:77` |
| 120 | POST | `/admin/users/:userId/custom-position` | custom-positions | required | OWNER | AssignCustomPositionDto | `CustomPositionsController.assign` | `customPositions.assign` | `custom-positions/custom-positions.controller.ts:65` |
| 121 | GET | `/custom-positions` | custom-positions | NONE (no guard) | - | - | `CustomPositionsController.listPublic` | `customPositions.listPublic` | `custom-positions/custom-positions.controller.ts:27` |
| 122 | GET | `/admin/decorations` | decorations | required | ADMIN | - | `AdminDecorationsController.catalog` | `decorations.adminCatalog` | `decorations/decorations.controller.ts:45` |
| 123 | DELETE | `/admin/decorations/:decorationId/users/:userId` | decorations | required | ADMIN | - | `AdminDecorationsController.revoke` | `decorations.revoke` | `decorations/decorations.controller.ts:56` |
| 124 | PATCH | `/admin/decorations/:id` | decorations | required | ADMIN | UpdateDecorationDto | `AdminDecorationsController.update` | `decorations.update` | `decorations/decorations.controller.ts:62` |
| 125 | POST | `/admin/decorations/grant` | decorations | required | ADMIN | GrantDecorationDto | `AdminDecorationsController.grant` | `decorations.grant` | `decorations/decorations.controller.ts:51` |
| 126 | GET | `/admin/decorations/ownerships` | decorations | required | ADMIN | ?string | `AdminDecorationsController.ownerships` | `decorations.userOwnerships` | `decorations/decorations.controller.ts:48` |
| 127 | GET | `/decorations` | decorations | optional | - | - | `DecorationsController.catalog` | `decorations.catalog` | `decorations/decorations.controller.ts:15` |
| 128 | GET | `/decorations/mine` | decorations | required | - | - | `DecorationsController.mine` | `decorations.owned` | `decorations/decorations.controller.ts:21` |
| 129 | PATCH | `/decorations/selected` | decorations | required | - | SelectDecorationDto | `DecorationsController.select` | `decorations.select` | `decorations/decorations.controller.ts:32` |
| 130 | GET | `/decorations/user/:username/selected` | decorations | NONE (no guard) | - | - | `DecorationsController.selectedForUser` | `decorations.selectedForUser` | `decorations/decorations.controller.ts:27` |
| 131 | GET | `/admin/departments` | departments | required | OWNER | - | `DepartmentsController.listAdmin` | `departments.listAdmin` | `departments/departments.controller.ts:33` |
| 132 | POST | `/admin/departments` | departments | required | OWNER | CreateDepartmentDto | `DepartmentsController.create` | `departments.create` | `departments/departments.controller.ts:40` |
| 133 | DELETE | `/admin/departments/:id` | departments | required | OWNER | - | `DepartmentsController.remove` | `departments.remove` | `departments/departments.controller.ts:58` |
| 134 | PATCH | `/admin/departments/:id` | departments | required | OWNER | UpdateDepartmentDto | `DepartmentsController.update` | `departments.update` | `departments/departments.controller.ts:51` |
| 135 | POST | `/admin/users/:userId/departments` | departments | required | ADMIN | AssignDepartmentDto | `DepartmentsController.assign` | `departments.assign` | `departments/departments.controller.ts:66` |
| 136 | DELETE | `/admin/users/:userId/departments/:departmentId` | departments | required | ADMIN | - | `DepartmentsController.unassign` | `departments.unassign` | `departments/departments.controller.ts:78` |
| 137 | PATCH | `/admin/users/:userId/departments/order` | departments | required | ADMIN | ReorderDepartmentsDto | `DepartmentsController.reorder` | `departments.reorder` | `departments/departments.controller.ts:89` |
| 138 | GET | `/departments` | departments | NONE (no guard) | - | - | `DepartmentsController.listPublic` | `departments.listPublic` | `departments/departments.controller.ts:28` |
| 139 | GET | `/messages/conversations` | direct-messages | required | - | - | `DirectMessagesController.list` | `messages.listConversations` | `direct-messages/direct-messages.controller.ts:45` |
| 140 | GET | `/messages/conversations/:id` | direct-messages | required | - | - | `DirectMessagesController.getConversation` | `messages.getConversation` | `direct-messages/direct-messages.controller.ts:50` |
| 141 | PATCH | `/messages/conversations/:id` | direct-messages | required | - | UpdateConversationDto | `DirectMessagesController.updateConversation` | `messages.updateConversation, gateway.emitConversationChanged` | `direct-messages/direct-messages.controller.ts:69` |
| 142 | GET | `/messages/conversations/:id/invites` | direct-messages | required | - | - | `DirectMessagesController.listInvites` | `messages.listInvites` | `direct-messages/direct-messages.controller.ts:191` |
| 143 | POST | `/messages/conversations/:id/invites` | direct-messages | required | - | CreateGroupInviteDto | `DirectMessagesController.createInvite` | `messages.createInvite` | `direct-messages/direct-messages.controller.ts:196` |
| 144 | DELETE | `/messages/conversations/:id/invites/:code` | direct-messages | required | - | - | `DirectMessagesController.revokeInvite` | `messages.revokeInvite` | `direct-messages/direct-messages.controller.ts:205` |
| 145 | POST | `/messages/conversations/:id/members` | direct-messages | required | - | AddConversationMemberDto | `DirectMessagesController.addMember` | `messages.addMember, gateway.syncConversationRooms` | `direct-messages/direct-messages.controller.ts:157` |
| 146 | DELETE | `/messages/conversations/:id/members/:memberId` | direct-messages | required | - | - | `DirectMessagesController.removeMember` | `messages.removeMember, gateway.emitConversationChanged` | `direct-messages/direct-messages.controller.ts:168` |
| 147 | PATCH | `/messages/conversations/:id/members/:memberId` | direct-messages | required | - | UpdateConversationMemberDto | `DirectMessagesController.updateMemberRole` | `messages.updateMemberRole, gateway.emitConversationChanged` | `direct-messages/direct-messages.controller.ts:179` |
| 148 | GET | `/messages/conversations/:id/messages` | direct-messages | required | - | ?string | `DirectMessagesController.getMessages` | `messages.getMessages` | `direct-messages/direct-messages.controller.ts:80` |
| 149 | POST | `/messages/conversations/:id/messages` | direct-messages | required | - | SendDirectMessageDto | `DirectMessagesController.sendMessage` | `messages.sendMessage, gateway.emitNewMessage` | `direct-messages/direct-messages.controller.ts:90` |
| 150 | POST | `/messages/conversations/:id/messages/upload` | direct-messages | required | - | string, string | `DirectMessagesController.sendAttachment` | `messages.sendAttachment, gateway.emitNewMessage` | `direct-messages/direct-messages.controller.ts:101` |
| 151 | POST | `/messages/conversations/:id/read` | direct-messages | required | - | MarkConversationReadDto | `DirectMessagesController.markRead` | `messages.markRead` | `direct-messages/direct-messages.controller.ts:146` |
| 152 | POST | `/messages/conversations/direct` | direct-messages | required | - | CreateDirectConversationDto | `DirectMessagesController.createDirect` | `messages.createDirect, gateway.syncConversationRooms` | `direct-messages/direct-messages.controller.ts:55` |
| 153 | POST | `/messages/conversations/group` | direct-messages | required | - | CreateGroupConversationDto | `DirectMessagesController.createGroup` | `messages.createGroup, gateway.syncConversationRooms` | `direct-messages/direct-messages.controller.ts:62` |
| 154 | GET | `/messages/gift-fee/:username` | direct-messages | required | - | - | `DirectMessagesController.giftFee` | `messages.giftFee` | `direct-messages/direct-messages.controller.ts:237` |
| 155 | GET | `/messages/invites/:code` | direct-messages | public | - | - | `DirectMessagesController.previewInvite` | `messages.previewInvite` | `direct-messages/direct-messages.controller.ts:214` |
| 156 | POST | `/messages/invites/:code/join` | direct-messages | required | - | - | `DirectMessagesController.joinInvite` | `messages.joinInvite, gateway.syncConversationRooms` | `direct-messages/direct-messages.controller.ts:220` |
| 157 | DELETE | `/messages/messages/:messageId` | direct-messages | required | - | - | `DirectMessagesController.deleteMessage` | `messages.deleteMessage, gateway.emitUpdatedMessage` | `direct-messages/direct-messages.controller.ts:127` |
| 158 | PATCH | `/messages/messages/:messageId` | direct-messages | required | - | EditDirectMessageDto | `DirectMessagesController.editMessage` | `messages.editMessage, gateway.emitUpdatedMessage` | `direct-messages/direct-messages.controller.ts:116` |
| 159 | POST | `/messages/messages/:messageId/reactions` | direct-messages | required | - | ReactToDirectMessageDto | `DirectMessagesController.react` | `messages.toggleReaction, gateway.emitUpdatedMessage` | `direct-messages/direct-messages.controller.ts:135` |
| 160 | GET | `/messages/privacy` | direct-messages | required | - | - | `DirectMessagesController.getPrivacy` | `messages.getPrivacy` | `direct-messages/direct-messages.controller.ts:227` |
| 161 | PATCH | `/messages/privacy` | direct-messages | required | - | UpdateDirectMessagePrivacyDto | `DirectMessagesController.updatePrivacy` | `messages.updatePrivacy` | `direct-messages/direct-messages.controller.ts:232` |
| 162 | GET | `/admin/emojis` | emojis | required | ADMIN | - | `AdminEmojisController.listAll` | `emojis.listAll` | `emojis/admin-emojis.controller.ts:33` |
| 163 | POST | `/admin/emojis` | emojis | required | ADMIN | CreateEmojiDto | `AdminEmojisController.create` | `emojis.create` | `emojis/admin-emojis.controller.ts:38` |
| 164 | DELETE | `/admin/emojis/:id` | emojis | required | ADMIN | - | `AdminEmojisController.remove` | `emojis.remove` | `emojis/admin-emojis.controller.ts:79` |
| 165 | PATCH | `/admin/emojis/:id` | emojis | required | ADMIN | UpdateEmojiDto | `AdminEmojisController.update` | `emojis.update` | `emojis/admin-emojis.controller.ts:59` |
| 166 | GET | `/emojis/custom` | emojis | public | - | - | `EmojisController.list` | `emojis.listActive` | `emojis/emojis.controller.ts:11` |
| 167 | GET | `/emojis/custom/search` | emojis | public | - | ?SearchEmojisDto | `EmojisController.search` | `emojis.search` | `emojis/emojis.controller.ts:17` |
| 168 | GET | `/admin/events` | events | required | ADMIN | - | `AdminEventsController.list` | `events.adminList` | `events/events.controller.ts:55` |
| 169 | POST | `/admin/events` | events | required | ADMIN | CreateEventDto | `AdminEventsController.create` | `events.create` | `events/events.controller.ts:56` |
| 170 | DELETE | `/admin/events/:id` | events | required | ADMIN | - | `AdminEventsController.remove` | `events.remove` | `events/events.controller.ts:60` |
| 171 | PATCH | `/admin/events/:id` | events | required | ADMIN | UpdateEventDto | `AdminEventsController.update` | `events.update` | `events/events.controller.ts:57` |
| 172 | POST | `/admin/events/:id/cancel` | events | required | ADMIN | - | `AdminEventsController.cancel` | `events.setStatus` | `events/events.controller.ts:59` |
| 173 | POST | `/admin/events/:id/publish` | events | required | ADMIN | - | `AdminEventsController.publish` | `events.setStatus` | `events/events.controller.ts:58` |
| 174 | GET | `/events` | events | optional | - | ?ListEventsQueryDto | `EventsController.list` | `events.list` | `events/events.controller.ts:16` |
| 175 | DELETE | `/events/:id/attendance` | events | required | - | - | `EventsController.leave` | `events.leave` | `events/events.controller.ts:42` |
| 176 | POST | `/events/:id/attendance` | events | required | - | EventAttendanceDto | `EventsController.attend` | `events.attend` | `events/events.controller.ts:36` |
| 177 | GET | `/events/:slug` | events | optional | - | - | `EventsController.bySlug` | `events.bySlug` | `events/events.controller.ts:30` |
| 178 | GET | `/events/featured` | events | optional | - | - | `EventsController.featured` | `events.featured` | `events/events.controller.ts:22` |
| 179 | GET | `/events/mine` | events | required | - | - | `EventsController.mine` | `events.my` | `events/events.controller.ts:26` |
| 180 | POST | `/admin/audit-log/export` | export | required | ADMIN | ExportAuditDto | `ExportController.exportAudit` | `exportService.exportAuditLog` | `export/export.controller.ts:188` |
| 181 | POST | `/admin/news/export` | export | required | ADMIN | ExportNewsDto | `ExportController.exportNews` | `exportService.exportNews` | `export/export.controller.ts:175` |
| 182 | POST | `/admin/orders/export` | export | required | ADMIN | ExportOrdersDto | `ExportController.exportOrders` | `exportService.exportOrders` | `export/export.controller.ts:147` |
| 183 | POST | `/admin/reports/export` | export | required | ADMIN | ExportReportsDto | `ExportController.exportReports` | `exportService.exportReports` | `export/export.controller.ts:161` |
| 184 | POST | `/admin/users/export` | export | required | ADMIN | ExportUsersDto | `ExportController.exportUsers` | `exportService.exportUsers` | `export/export.controller.ts:131` |
| 185 | GET | `/admin/forms` | forms | required | ADMIN | ?ListFormsQueryDto | `FormsAdminController.list` | `forms.listAdmin` | `forms/forms-admin.controller.ts:46` |
| 186 | POST | `/admin/forms` | forms | required | ADMIN | CreateFormDto | `FormsAdminController.create` | `forms.createForm` | `forms/forms-admin.controller.ts:63` |
| 187 | DELETE | `/admin/forms/:id` | forms | required | ADMIN | - | `FormsAdminController.remove` | `forms.deleteForm` | `forms/forms-admin.controller.ts:103` |
| 188 | GET | `/admin/forms/:id` | forms | required | ADMIN | - | `FormsAdminController.getById` | `forms.getFormById` | `forms/forms-admin.controller.ts:88` |
| 189 | PATCH | `/admin/forms/:id` | forms | required | ADMIN | UpdateFormDto | `FormsAdminController.update` | `forms.updateForm` | `forms/forms-admin.controller.ts:94` |
| 190 | POST | `/admin/forms/:id/close` | forms | required | ADMIN | - | `FormsAdminController.close` | `forms.closeForm` | `forms/forms-admin.controller.ts:115` |
| 191 | POST | `/admin/forms/:id/duplicate` | forms | required | ADMIN | - | `FormsAdminController.duplicate` | `forms.duplicateForm` | `forms/forms-admin.controller.ts:121` |
| 192 | POST | `/admin/forms/:id/export` | forms | required | ADMIN | ExportFormDto | `FormsAdminController.exportResponses` | `exporter.exportResponses` | `forms/forms-admin.controller.ts:156` |
| 193 | GET | `/admin/forms/:id/invites` | forms | required | ADMIN | - | `FormsAdminController.listInvites` | `forms.listInvites` | `forms/forms-admin.controller.ts:176` |
| 194 | POST | `/admin/forms/:id/invites` | forms | required | ADMIN | CreateInviteDto | `FormsAdminController.createInvite` | `forms.createInvite` | `forms/forms-admin.controller.ts:181` |
| 195 | DELETE | `/admin/forms/:id/invites/:code` | forms | required | ADMIN | - | `FormsAdminController.deleteInvite` | `forms.deleteInvite` | `forms/forms-admin.controller.ts:191` |
| 196 | POST | `/admin/forms/:id/publish` | forms | required | ADMIN | - | `FormsAdminController.publish` | `forms.publishForm` | `forms/forms-admin.controller.ts:109` |
| 197 | GET | `/admin/forms/:id/responses` | forms | required | ADMIN | ?ListResponsesQueryDto | `FormsAdminController.getResponses` | `responses.getResponses` | `forms/forms-admin.controller.ts:131` |
| 198 | DELETE | `/admin/forms/:id/responses/:responseId` | forms | required | ADMIN | - | `FormsAdminController.deleteResponse` | `responses.deleteResponse` | `forms/forms-admin.controller.ts:147` |
| 199 | GET | `/admin/forms/:id/responses/:responseId` | forms | required | ADMIN | - | `FormsAdminController.getResponse` | `responses.getResponse` | `forms/forms-admin.controller.ts:139` |
| 200 | GET | `/admin/forms/:id/stats` | forms | required | ADMIN | - | `FormsAdminController.getStats` | `forms.getStats` | `forms/forms-admin.controller.ts:171` |
| 201 | POST | `/admin/forms/from-template/:slug` | forms | required | ADMIN | CreateFromTemplateDto | `FormsAdminController.createFromTemplate` | `forms.createFromTemplate` | `forms/forms-admin.controller.ts:73` |
| 202 | GET | `/admin/forms/templates` | forms | required | ADMIN | - | `FormsAdminController.listTemplates` | `forms.listTemplates` | `forms/forms-admin.controller.ts:57` |
| 203 | GET | `/forms` | forms | optional | - | - | `FormsController.listPublished` | `forms.listPublished` | `forms/forms.controller.ts:46` |
| 204 | GET | `/forms/:slug` | forms | optional | - | - | `FormsController.getBySlug` | `forms.getFormBySlug` | `forms/forms.controller.ts:83` |
| 205 | POST | `/forms/:slug/responses` | forms | optional | - | SubmitResponseDto | `FormsController.submit` | `-` | `forms/forms.controller.ts:96` |
| 206 | POST | `/forms/:slug/responses/save-draft` | forms | required | - | SaveDraftDto | `FormsController.saveDraft` | `-` | `forms/forms.controller.ts:116` |
| 207 | POST | `/forms/:slug/responses/upload` | forms | optional | - | - | `FormsController.uploadResponseFile` | `-` | `forms/forms.controller.ts:127` |
| 208 | GET | `/forms/autofill` | forms | required | - | - | `FormsController.autofill` | `forms.getAutofill` | `forms/forms.controller.ts:70` |
| 209 | GET | `/forms/invite/:code` | forms | optional | - | - | `FormsController.getByInvite` | `forms.getFormByInviteCode` | `forms/forms.controller.ts:76` |
| 210 | GET | `/forms/my` | forms | required | - | - | `FormsController.listMy` | `forms.getMyForms` | `forms/forms.controller.ts:57` |
| 211 | GET | `/forms/my/responses` | forms | required | - | - | `FormsController.listMyResponses` | `responses.getMyResponses` | `forms/forms.controller.ts:64` |
| 212 | GET | `/friends` | friends | required | - | ?string | `FriendsController.getFriends` | `friends.getFriendsList` | `friends/friends.controller.ts:98` |
| 213 | DELETE | `/friends/:username` | friends | required | - | - | `FriendsController.removeFriend` | `friends.removeFriend` | `friends/friends.controller.ts:89` |
| 214 | POST | `/friends/accept/:requestId` | friends | required | - | - | `FriendsController.acceptRequest` | `friends.acceptRequest` | `friends/friends.controller.ts:43` |
| 215 | DELETE | `/friends/block/:username` | friends | required | - | - | `FriendsController.unblockUser` | `friends.unblockUser` | `friends/friends.controller.ts:70` |
| 216 | POST | `/friends/block/:username` | friends | required | - | - | `FriendsController.blockUser` | `friends.blockUser` | `friends/friends.controller.ts:79` |
| 217 | GET | `/friends/blocked` | friends | required | - | - | `FriendsController.getBlocked` | `friends.getBlockedUsers` | `friends/friends.controller.ts:131` |
| 218 | GET | `/friends/count` | friends | required | - | - | `FriendsController.getMyCount` | `friends.getFriendsCount` | `friends/friends.controller.ts:148` |
| 219 | GET | `/friends/count/:username` | friends | public | - | - | `FriendsController.getCountByUsername` | `friends.getFriendsCountByUsername` | `friends/friends.controller.ts:153` |
| 220 | POST | `/friends/reject/:requestId` | friends | required | - | - | `FriendsController.rejectRequest` | `friends.rejectRequest` | `friends/friends.controller.ts:52` |
| 221 | POST | `/friends/request/:username` | friends | required | - | - | `FriendsController.sendRequest` | `friends.sendRequest` | `friends/friends.controller.ts:33` |
| 222 | DELETE | `/friends/requests/:requestId` | friends | required | - | - | `FriendsController.cancelRequest` | `friends.cancelRequest` | `friends/friends.controller.ts:61` |
| 223 | GET | `/friends/requests/incoming` | friends | required | - | - | `FriendsController.getIncoming` | `friends.getIncomingRequests` | `friends/friends.controller.ts:108` |
| 224 | GET | `/friends/requests/incoming/count` | friends | required | - | - | `FriendsController.getIncomingCount` | `friends.getIncomingCount` | `friends/friends.controller.ts:117` |
| 225 | GET | `/friends/requests/outgoing` | friends | required | - | - | `FriendsController.getOutgoing` | `friends.getOutgoingRequests` | `friends/friends.controller.ts:122` |
| 226 | GET | `/friends/status/:username` | friends | required | - | - | `FriendsController.getStatus` | `friends.getFriendshipStatus` | `friends/friends.controller.ts:140` |
| 227 | GET | `/health` | health | NONE (no guard) | - | - | `HealthController.check` | `-` | `health/health.controller.ts:15` |
| 228 | GET | `/leaderboards` | leaderboards | NONE (no guard) | - | - | `LeaderboardsController.list` | `leaderboards.list` | `leaderboards/leaderboards.controller.ts:16` |
| 229 | GET | `/admin/server-categories` | minecraft | required | ADMIN | - | `AdminServerCategoriesController.listAdmin` | `categories.listAllAdmin` | `minecraft/server-categories.controller.ts:45` |
| 230 | POST | `/admin/server-categories` | minecraft | required | ADMIN | CreateServerCategoryDto | `AdminServerCategoriesController.create` | `categories.create, audit.log` | `minecraft/server-categories.controller.ts:50` |
| 231 | DELETE | `/admin/server-categories/:id` | minecraft | required | ADMIN | - | `AdminServerCategoriesController.remove` | `categories.remove, audit.log` | `minecraft/server-categories.controller.ts:84` |
| 232 | PATCH | `/admin/server-categories/:id` | minecraft | required | ADMIN | UpdateServerCategoryDto | `AdminServerCategoriesController.update` | `categories.update, audit.log` | `minecraft/server-categories.controller.ts:67` |
| 233 | GET | `/admin/servers` | minecraft | required | ADMIN | - | `AdminServersController.list` | `servers.listAllAdmin` | `minecraft/admin-servers.controller.ts:35` |
| 234 | POST | `/admin/servers` | minecraft | required | ADMIN | CreateServerDto | `AdminServersController.create` | `servers.create, audit.log` | `minecraft/admin-servers.controller.ts:40` |
| 235 | DELETE | `/admin/servers/:id` | minecraft | required | ADMIN | - | `AdminServersController.remove` | `servers.remove, audit.log` | `minecraft/admin-servers.controller.ts:74` |
| 236 | PATCH | `/admin/servers/:id` | minecraft | required | ADMIN | UpdateServerDto | `AdminServersController.update` | `servers.update, audit.log` | `minecraft/admin-servers.controller.ts:57` |
| 237 | GET | `/admin/servers/:id/logs` | minecraft | required | ADMIN | ?string, ?string | `AdminServersController.logs` | `-` | `minecraft/admin-servers.controller.ts:89` |
| 238 | GET | `/server-categories` | minecraft | NONE (no guard) | - | - | `ServerCategoriesController.list` | `categories.listActive` | `minecraft/server-categories.controller.ts:30` |
| 239 | GET | `/servers` | minecraft | NONE (no guard) | - | - | `ServersController.list` | `servers.listActive` | `minecraft/servers.controller.ts:23` |
| 240 | GET | `/servers/:slug` | minecraft | NONE (no guard) | - | - | `ServersController.getOne` | `servers.getBySlug` | `minecraft/servers.controller.ts:56` |
| 241 | GET | `/servers/:slug/history` | minecraft | NONE (no guard) | - | - | `ServersController.history` | `servers.getHistory` | `minecraft/servers.controller.ts:71` |
| 242 | GET | `/servers/:slug/players` | minecraft | NONE (no guard) | - | - | `ServersController.players` | `servers.getPlayers` | `minecraft/servers.controller.ts:66` |
| 243 | GET | `/servers/:slug/status` | minecraft | NONE (no guard) | - | - | `ServersController.status` | `servers.getStatus` | `minecraft/servers.controller.ts:61` |
| 244 | GET | `/servers/overview` | minecraft | NONE (no guard) | - | - | `ServersController.overview` | `servers.getOverview` | `minecraft/servers.controller.ts:28` |
| 245 | GET | `/servers/widget` | minecraft | NONE (no guard) | - | ?string | `ServersController.widget` | `servers.listActive` | `minecraft/servers.controller.ts:33` |
| 246 | DELETE | `/admin/users/:userId` | moderation | required | OWNER | - | `QuickModerationController.deleteAccount` | `moderation.deleteAccount` | `moderation/quick-moderation.controller.ts:150` |
| 247 | POST | `/admin/users/:userId/change-role` | moderation | required | OWNER | ChangeRoleDto | `QuickModerationController.changeRole` | `moderation.changeRole` | `moderation/quick-moderation.controller.ts:140` |
| 248 | POST | `/moderation/comments/:commentId/hard-delete` | moderation | required | MODERATOR | HardDeleteDto | `QuickModerationController.hardDeleteComment` | `moderation.hardDeleteComment` | `moderation/quick-moderation.controller.ts:110` |
| 249 | POST | `/moderation/messages/:messageId/hard-delete` | moderation | required | MODERATOR | HardDeleteDto | `QuickModerationController.hardDeleteMessage` | `moderation.hardDeleteMessage` | `moderation/quick-moderation.controller.ts:100` |
| 250 | POST | `/moderation/users/:userId/ban` | moderation | required | MODERATOR | BanDto | `QuickModerationController.ban` | `moderation.ban` | `moderation/quick-moderation.controller.ts:130` |
| 251 | POST | `/moderation/users/:userId/kick` | moderation | required | MODERATOR | KickDto | `QuickModerationController.kick` | `moderation.kick` | `moderation/quick-moderation.controller.ts:120` |
| 252 | POST | `/moderation/users/:userId/mute` | moderation | required | HELPER | MuteDto | `QuickModerationController.mute` | `moderation.mute` | `moderation/quick-moderation.controller.ts:80` |
| 253 | POST | `/moderation/users/:userId/warn` | moderation | required | HELPER | WarnDto | `QuickModerationController.warn` | `moderation.warn` | `moderation/quick-moderation.controller.ts:90` |
| 254 | GET | `/admin/news` | news | required | ADMIN | ?AdminListNewsQueryDto | `NewsAdminController.list` | `news.listAdmin` | `news/news-admin.controller.ts:37` |
| 255 | POST | `/admin/news` | news | required | ADMIN | CreateNewsDto | `NewsAdminController.create` | `news.create` | `news/news-admin.controller.ts:52` |
| 256 | DELETE | `/admin/news/:id` | news | required | ADMIN | - | `NewsAdminController.remove` | `news.archive` | `news/news-admin.controller.ts:88` |
| 257 | GET | `/admin/news/:id` | news | required | ADMIN | - | `NewsAdminController.getById` | `news.getAdminById` | `news/news-admin.controller.ts:47` |
| 258 | PATCH | `/admin/news/:id` | news | required | ADMIN | UpdateNewsDto | `NewsAdminController.update` | `news.update` | `news/news-admin.controller.ts:79` |
| 259 | POST | `/admin/news/:id/feature` | news | required | ADMIN | - | `NewsAdminController.feature` | `news.setFeatured` | `news/news-admin.controller.ts:104` |
| 260 | POST | `/admin/news/:id/pin` | news | required | ADMIN | - | `NewsAdminController.pin` | `news.setPinned` | `news/news-admin.controller.ts:94` |
| 261 | POST | `/admin/news/:id/unfeature` | news | required | ADMIN | - | `NewsAdminController.unfeature` | `news.setFeatured` | `news/news-admin.controller.ts:109` |
| 262 | POST | `/admin/news/:id/unpin` | news | required | ADMIN | - | `NewsAdminController.unpin` | `news.setPinned` | `news/news-admin.controller.ts:99` |
| 263 | GET | `/admin/news/stats` | news | required | ADMIN | - | `NewsAdminController.stats` | `news.stats` | `news/news-admin.controller.ts:42` |
| 264 | POST | `/admin/news/upload-image` | news | required | ADMIN | - | `NewsAdminController.uploadImage` | `-` | `news/news-admin.controller.ts:61` |
| 265 | DELETE | `/moderation/news/comments/:commentId` | news | required | MODERATOR | - | `NewsModerationController.remove` | `comments.moderateDelete` | `news/news-moderation.controller.ts:33` |
| 266 | PATCH | `/moderation/news/comments/:commentId/pin` | news | required | MODERATOR | - | `NewsModerationController.pin` | `comments.pin` | `news/news-moderation.controller.ts:23` |
| 267 | PATCH | `/moderation/news/comments/:commentId/unpin` | news | required | MODERATOR | - | `NewsModerationController.unpin` | `comments.pin` | `news/news-moderation.controller.ts:28` |
| 268 | GET | `/news` | news | optional | - | ?ListNewsQueryDto | `NewsController.list` | `news.listPublic` | `news/news.controller.ts:49` |
| 269 | POST | `/news/:id/like` | news | required | - | - | `NewsController.like` | `-` | `news/news.controller.ts:116` |
| 270 | GET | `/news/:slug` | news | optional | - | - | `NewsController.getBySlug` | `news.getBySlug` | `news/news.controller.ts:100` |
| 271 | GET | `/news/:slug/comments` | news | optional | - | ?ListNewsCommentsQueryDto | `NewsController.listComments` | `comments.list` | `news/news.controller.ts:126` |
| 272 | POST | `/news/:slug/comments` | news | required | - | CreateNewsCommentDto | `NewsController.createComment` | `comments.create` | `news/news.controller.ts:136` |
| 273 | DELETE | `/news/:slug/comments/:commentId` | news | required | - | - | `NewsController.deleteComment` | `comments.remove` | `news/news.controller.ts:159` |
| 274 | PATCH | `/news/:slug/comments/:commentId` | news | required | - | UpdateNewsCommentDto | `NewsController.updateComment` | `comments.update` | `news/news.controller.ts:148` |
| 275 | POST | `/news/:slug/comments/:commentId/reactions` | news | required | - | NewsCommentReactionDto | `NewsController.react` | `comments.toggleReaction` | `news/news.controller.ts:170` |
| 276 | GET | `/news/categories` | news | NONE (no guard) | - | - | `NewsController.categories` | `news.categories` | `news/news.controller.ts:83` |
| 277 | GET | `/news/featured` | news | optional | - | - | `NewsController.featured` | `news.featured` | `news/news.controller.ts:58` |
| 278 | GET | `/news/latest` | news | optional | - | ?LatestNewsQueryDto | `NewsController.latest` | `news.latest` | `news/news.controller.ts:66` |
| 279 | GET | `/news/popular` | news | optional | - | - | `NewsController.popular` | `news.popular` | `news/news.controller.ts:75` |
| 280 | GET | `/news/tags` | news | NONE (no guard) | - | ?TagsQueryDto | `NewsController.tags` | `news.tags` | `news/news.controller.ts:88` |
| 281 | GET | `/rss/news` | news | NONE (no guard) | - | - | `NewsController.rss` | `news.buildRssFeed` | `news/news.controller.ts:93` |
| 282 | POST | `/admin/notifications/broadcast` | notifications | required | ADMIN | BroadcastNotificationDto | `AdminNotificationsController.broadcast` | `notifications.broadcast` | `notifications/admin-notifications.controller.ts:68` |
| 283 | GET | `/admin/notifications/stats` | notifications | required | ADMIN | - | `AdminNotificationsController.stats` | `notifications.stats` | `notifications/admin-notifications.controller.ts:81` |
| 284 | GET | `/admin/notifications/webhooks` | notifications | required | ADMIN | - | `AdminNotificationsController.listWebhooks` | `discord.listWebhooks` | `notifications/admin-notifications.controller.ts:40` |
| 285 | POST | `/admin/notifications/webhooks` | notifications | required | ADMIN | AdminWebhookDto | `AdminNotificationsController.createWebhook` | `discord.createWebhook` | `notifications/admin-notifications.controller.ts:45` |
| 286 | DELETE | `/admin/notifications/webhooks/:id` | notifications | required | ADMIN | - | `AdminNotificationsController.deleteWebhook` | `discord.deleteWebhook` | `notifications/admin-notifications.controller.ts:62` |
| 287 | PATCH | `/admin/notifications/webhooks/:id` | notifications | required | ADMIN | UpdateAdminWebhookDto | `AdminNotificationsController.updateWebhook` | `discord.updateWebhook` | `notifications/admin-notifications.controller.ts:54` |
| 288 | GET | `/notifications` | notifications | required | - | - | `NotificationsController.list` | `notifications.list` | `notifications/notifications.controller.ts:49` |
| 289 | DELETE | `/notifications/:id` | notifications | required | - | - | `NotificationsController.remove` | `notifications.remove` | `notifications/notifications.controller.ts:182` |
| 290 | PATCH | `/notifications/:id/read` | notifications | required | - | - | `NotificationsController.markRead` | `notifications.markRead` | `notifications/notifications.controller.ts:174` |
| 291 | PATCH | `/notifications/digest` | notifications | required | - | UpdateDigestDto | `NotificationsController.updateDigest` | `settings.update` | `notifications/notifications.controller.ts:151` |
| 292 | POST | `/notifications/digest/test` | notifications | required | - | - | `NotificationsController.testDigest` | `notifications.sendDigestForUser` | `notifications/notifications.controller.ts:162` |
| 293 | DELETE | `/notifications/discord/webhook` | notifications | required | - | - | `NotificationsController.deleteDiscordWebhook` | `settings.update` | `notifications/notifications.controller.ts:127` |
| 294 | POST | `/notifications/discord/webhook` | notifications | required | - | DiscordPersonalWebhookDto | `NotificationsController.saveDiscordWebhook` | `settings.update` | `notifications/notifications.controller.ts:115` |
| 295 | POST | `/notifications/discord/webhook/test` | notifications | required | - | - | `NotificationsController.testDiscordWebhook` | `settings.getOrCreate, discord.sendToWebhook` | `notifications/notifications.controller.ts:136` |
| 296 | POST | `/notifications/push/subscribe` | notifications | required | - | PushSubscribeDto | `NotificationsController.subscribePush` | `push.subscribe` | `notifications/notifications.controller.ts:97` |
| 297 | DELETE | `/notifications/push/subscribe/:id` | notifications | required | - | - | `NotificationsController.unsubscribePush` | `push.unsubscribe` | `notifications/notifications.controller.ts:106` |
| 298 | GET | `/notifications/push/vapid-key` | notifications | required | - | - | `NotificationsController.vapidKey` | `push.getVapidPublicKey` | `notifications/notifications.controller.ts:92` |
| 299 | PATCH | `/notifications/read-all` | notifications | required | - | - | `NotificationsController.markAllRead` | `-` | `notifications/notifications.controller.ts:169` |
| 300 | GET | `/notifications/settings` | notifications | required | - | - | `NotificationsController.getSettings` | `settings.getOrCreate` | `notifications/notifications.controller.ts:64` |
| 301 | PATCH | `/notifications/settings` | notifications | required | - | UpdateNotificationSettingsDto | `NotificationsController.updateSettings` | `settings.update` | `notifications/notifications.controller.ts:69` |
| 302 | POST | `/notifications/settings/reset` | notifications | required | - | - | `NotificationsController.resetSettings` | `settings.reset` | `notifications/notifications.controller.ts:86` |
| 303 | PATCH | `/notifications/settings/type/:type` | notifications | required | - | UpdateTypeSettingDto | `NotificationsController.updateTypeSettings` | `settings.updateType` | `notifications/notifications.controller.ts:77` |
| 304 | GET | `/notifications/unread-count` | notifications | required | - | - | `NotificationsController.unreadCount` | `notifications.unreadCount` | `notifications/notifications.controller.ts:59` |
| 305 | GET | `/positions` | positions | NONE (no guard) | - | ?ListPositionsDto | `PositionsController.list` | `positions.findAll` | `positions/positions.controller.ts:29` |
| 306 | POST | `/positions` | positions | required | OWNER | CreatePositionDto | `PositionsController.create` | `positions.create` | `positions/positions.controller.ts:47` |
| 307 | DELETE | `/positions/:id` | positions | required | OWNER | - | `PositionsController.remove` | `positions.remove` | `positions/positions.controller.ts:61` |
| 308 | PATCH | `/positions/:id` | positions | required | OWNER | UpdatePositionDto | `PositionsController.update` | `positions.update` | `positions/positions.controller.ts:54` |
| 309 | POST | `/positions/:id/assign` | positions | required | ADMIN | AssignPositionDto | `PositionsController.assign` | `positions.assign` | `positions/positions.controller.ts:69` |
| 310 | GET | `/positions/:slug` | positions | NONE (no guard) | - | - | `PositionsController.find` | `positions.findBySlug` | `positions/positions.controller.ts:42` |
| 311 | GET | `/positions/manage` | positions | required | ADMIN | ?ListPositionsDto | `PositionsController.listAll` | `positions.findAll` | `positions/positions.controller.ts:35` |
| 312 | DELETE | `/admin/reports/:reportNumber` | reports | required | ADMIN | - | `ReportsController.deleteReport` | `reports.deleteReport` | `reports/reports.controller.ts:414` |
| 313 | POST | `/admin/reports/:reportNumber/archive` | reports | required | ADMIN | ArchiveReportDto | `ReportsController.archiveReport` | `reports.archiveReport` | `reports/reports.controller.ts:391` |
| 314 | DELETE | `/admin/reports/:reportNumber/messages/:messageId` | reports | required | ADMIN | - | `ReportsController.hardDeleteMessage` | `reports.hardDeleteMessage` | `reports/reports.controller.ts:425` |
| 315 | POST | `/admin/reports/:reportNumber/unarchive` | reports | required | ADMIN | - | `ReportsController.unarchiveReport` | `reports.unarchiveReport` | `reports/reports.controller.ts:403` |
| 316 | GET | `/admin/reports/archived` | reports | required | ADMIN | ?ListReportsQueryDto | `ReportsController.listArchived` | `reports.listArchived` | `reports/reports.controller.ts:381` |
| 317 | DELETE | `/admin/reports/ban/:userId` | reports | required | ADMIN | - | `ReportsController.unbanUser` | `reports.unbanUser` | `reports/reports.controller.ts:454` |
| 318 | POST | `/admin/reports/ban/:userId` | reports | required | ADMIN | BanReportsDto | `ReportsController.banUser` | `reports.banUser` | `reports/reports.controller.ts:442` |
| 319 | GET | `/admin/reports/stats` | reports | required | ADMIN | - | `ReportsController.stats` | `reports.stats` | `reports/reports.controller.ts:374` |
| 320 | GET | `/admin/support/donations` | reports | required | OWNER | ?ListReportsQueryDto | `ReportsController.listDonations` | `reports.listDonations` | `reports/reports.controller.ts:472` |
| 321 | POST | `/admin/users/:userId/punishments` | reports | required | MODERATOR | CreatePunishmentDto | `ReportsController.issuePunishment` | `punishments.issuePunishment` | `reports/reports.controller.ts:496` |
| 322 | PATCH | `/admin/users/:userId/punishments/:id` | reports | required | MODERATOR | UpdatePunishmentDto | `ReportsController.updatePunishment` | `punishments.updatePunishment` | `reports/reports.controller.ts:508` |
| 323 | GET | `/admin/users/:username/punishments` | reports | required | MODERATOR | - | `ReportsController.listUserPunishments` | `punishments.listByUsername` | `reports/reports.controller.ts:487` |
| 324 | GET | `/bans` | reports | required | - | - | `ReportsController.listActiveGamePunishments` | `reports.listActiveGamePunishments` | `reports/reports.controller.ts:196` |
| 325 | GET | `/game-reports` | reports | required | - | - | `ReportsController.listGameReports` | `reports.listGameReports` | `reports/reports.controller.ts:177` |
| 326 | GET | `/moderation/reports` | reports | required | HELPER | ?ListReportsQueryDto | `ReportsController.listModeration` | `reports.listModeration` | `reports/reports.controller.ts:213` |
| 327 | PATCH | `/moderation/reports/:reportNumber/assign` | reports | required | HELPER | AssignReportDto | `ReportsController.assign` | `reports.assign` | `reports/reports.controller.ts:223` |
| 328 | POST | `/moderation/reports/:reportNumber/lock` | reports | required | ADMIN | LockReportDto | `ReportsController.lock` | `reports.lock` | `reports/reports.controller.ts:362` |
| 329 | POST | `/moderation/reports/:reportNumber/messages` | reports | required | HELPER | AddReportMessageDto | `ReportsController.moderationMessage` | `reports.addMessage` | `reports/reports.controller.ts:256` |
| 330 | DELETE | `/moderation/reports/:reportNumber/messages/:messageId` | reports | required | HELPER | SoftDeleteMessageDto | `ReportsController.softDeleteMessage` | `reports.softDeleteMessage` | `reports/reports.controller.ts:270` |
| 331 | PATCH | `/moderation/reports/:reportNumber/messages/:messageId/pin` | reports | required | HELPER | - | `ReportsController.pinMessage` | `reports.pinMessage` | `reports/reports.controller.ts:288` |
| 332 | PATCH | `/moderation/reports/:reportNumber/messages/:messageId/unpin` | reports | required | HELPER | - | `ReportsController.unpinMessage` | `reports.unpinMessage` | `reports/reports.controller.ts:299` |
| 333 | POST | `/moderation/reports/:reportNumber/notes` | reports | required | HELPER | CreateModeratorNoteDto | `ReportsController.createModeratorNote` | `reports.createModeratorNote` | `reports/reports.controller.ts:310` |
| 334 | DELETE | `/moderation/reports/:reportNumber/notes/:noteId` | reports | required | HELPER | - | `ReportsController.deleteModeratorNote` | `reports.deleteModeratorNote` | `reports/reports.controller.ts:340` |
| 335 | PATCH | `/moderation/reports/:reportNumber/notes/:noteId` | reports | required | HELPER | UpdateModeratorNoteDto | `ReportsController.updateModeratorNote` | `reports.updateModeratorNote` | `reports/reports.controller.ts:322` |
| 336 | PATCH | `/moderation/reports/:reportNumber/notes/:noteId/pin` | reports | required | HELPER | - | `ReportsController.pinModeratorNote` | `reports.pinModeratorNote` | `reports/reports.controller.ts:351` |
| 337 | PATCH | `/moderation/reports/:reportNumber/status` | reports | required | HELPER | ChangeReportStatusDto | `ReportsController.changeStatus` | `reports.changeStatus` | `reports/reports.controller.ts:234` |
| 338 | PATCH | `/moderation/reports/:reportNumber/verdict` | reports | required | HELPER | SetVerdictDto | `ReportsController.setVerdict` | `reports.setVerdict` | `reports/reports.controller.ts:245` |
| 339 | GET | `/reports` | reports | required | - | ?ListReportsQueryDto | `ReportsController.listMine` | `reports.listMine` | `reports/reports.controller.ts:76` |
| 340 | POST | `/reports` | reports | required | - | CreateReportDto | `ReportsController.create` | `reports.createReport` | `reports/reports.controller.ts:92` |
| 341 | GET | `/reports/:reportNumber` | reports | required | - | - | `ReportsController.getOne` | `reports.getByNumber` | `reports/reports.controller.ts:84` |
| 342 | POST | `/reports/:reportNumber/attachments` | reports | required | - | - | `ReportsController.uploadAttachment` | `reports.uploadAttachment` | `reports/reports.controller.ts:128` |
| 343 | POST | `/reports/:reportNumber/messages` | reports | required | - | AddReportMessageDto | `ReportsController.addMessage` | `reports.addMessage` | `reports/reports.controller.ts:102` |
| 344 | PATCH | `/reports/:reportNumber/messages/:messageId` | reports | required | - | UpdateOwnReportMessageDto | `ReportsController.updateOwnMessage` | `reports.updateOwnMessage` | `reports/reports.controller.ts:112` |
| 345 | POST | `/reports/:reportNumber/messages/:messageId/attachments` | reports | required | - | - | `ReportsController.uploadMessageAttachment` | `reports.uploadMessageAttachment` | `reports/reports.controller.ts:149` |
| 346 | GET | `/reports/rules` | reports | public | - | ?ReportRulesQueryDto | `ReportsController.getRules` | `reports.getRules` | `reports/reports.controller.ts:70` |
| 347 | POST | `/support/donation-problem` | reports | required | - | CreateDonationProblemDto | `ReportsController.donationProblem` | `reports.createDonationProblem` | `reports/reports.controller.ts:462` |
| 348 | GET | `/users/:username/game-reports/incoming` | reports | required | - | - | `ReportsController.listIncomingGameReports` | `reports.listIncomingGameReports` | `reports/reports.controller.ts:182` |
| 349 | GET | `/users/:username/game-reports/outgoing` | reports | required | - | - | `ReportsController.listOutgoingGameReports` | `reports.listOutgoingGameReports` | `reports/reports.controller.ts:189` |
| 350 | GET | `/users/:username/punishments-history` | reports | required | - | - | `ReportsController.listGamePunishmentHistory` | `reports.listGamePunishmentHistory` | `reports/reports.controller.ts:201` |
| 351 | GET | `/users/me/game-punishments` | reports | required | - | - | `ReportsController.listMyGamePunishments` | `reports.listMyGamePunishments` | `reports/reports.controller.ts:208` |
| 352 | GET | `/users/me/punishments` | reports | required | - | ?MyPunishmentsQueryDto | `ReportsController.listMyPunishments` | `punishments.listMyPunishments` | `reports/reports.controller.ts:479` |
| 353 | GET | `/admin/dashboard/charts/reports` | statistics | required | ADMIN | - | `StatisticsController.reportsChart` | `statistics.getReportsChartData` | `statistics/statistics.controller.ts:36` |
| 354 | GET | `/admin/dashboard/charts/revenue` | statistics | required | ADMIN | - | `StatisticsController.revenueChart` | `statistics.getRevenueChartData` | `statistics/statistics.controller.ts:31` |
| 355 | GET | `/admin/dashboard/charts/servers` | statistics | required | ADMIN | - | `StatisticsController.serversChart` | `statistics.getServerOnlineChartData` | `statistics/statistics.controller.ts:41` |
| 356 | GET | `/admin/dashboard/charts/users` | statistics | required | ADMIN | - | `StatisticsController.usersChart` | `statistics.getUsersChartData` | `statistics/statistics.controller.ts:26` |
| 357 | GET | `/admin/dashboard/moderator-activity` | statistics | required | ADMIN | - | `StatisticsController.moderatorActivity` | `statistics.getModeratorActivity` | `statistics/statistics.controller.ts:56` |
| 358 | GET | `/admin/dashboard/overview` | statistics | required | ADMIN | - | `StatisticsController.getOverview` | `statistics.getDashboardOverview` | `statistics/statistics.controller.ts:21` |
| 359 | GET | `/admin/dashboard/top-buyers` | statistics | required | ADMIN | - | `StatisticsController.topBuyers` | `statistics.getTopBuyers` | `statistics/statistics.controller.ts:51` |
| 360 | GET | `/admin/dashboard/top-products` | statistics | required | ADMIN | - | `StatisticsController.topProducts` | `statistics.getTopProducts` | `statistics/statistics.controller.ts:46` |
| 361 | GET | `/admin/orders` | store | required | ADMIN | ?OrderStatus, ?string | `AdminOrdersController.list` | `orders.listAdmin` | `store/orders.controller.ts:95` |
| 362 | PATCH | `/admin/orders/:id/cancel` | store | required | ADMIN | CancelOrderDto | `AdminOrdersController.cancel` | `orders.cancel` | `store/orders.controller.ts:110` |
| 363 | PATCH | `/admin/orders/:id/refund` | store | required | ADMIN | RefundOrderDto | `AdminOrdersController.refund` | `orders.refund` | `store/orders.controller.ts:118` |
| 364 | GET | `/admin/orders/stats` | store | required | ADMIN | - | `AdminOrdersController.stats` | `orders.stats` | `store/orders.controller.ts:105` |
| 365 | GET | `/admin/promocodes` | store | required | ADMIN | ?string | `AdminPromocodesController.list` | `promocodes.list` | `store/promocodes.controller.ts:45` |
| 366 | POST | `/admin/promocodes` | store | required | ADMIN | CreatePromoCodeDto | `AdminPromocodesController.create` | `promocodes.create` | `store/promocodes.controller.ts:50` |
| 367 | DELETE | `/admin/promocodes/:id` | store | required | ADMIN | - | `AdminPromocodesController.remove` | `promocodes.remove` | `store/promocodes.controller.ts:64` |
| 368 | PATCH | `/admin/promocodes/:id` | store | required | ADMIN | UpdatePromoCodeDto | `AdminPromocodesController.update` | `promocodes.update` | `store/promocodes.controller.ts:56` |
| 369 | POST | `/admin/store/bundles` | store | required | ADMIN | CreateBundleDto | `AdminBundlesController.create` | `bundles.create` | `store/bundles.controller.ts:41` |
| 370 | DELETE | `/admin/store/bundles/:id` | store | required | ADMIN | - | `AdminBundlesController.remove` | `bundles.remove` | `store/bundles.controller.ts:52` |
| 371 | PATCH | `/admin/store/bundles/:id` | store | required | ADMIN | UpdateBundleDto | `AdminBundlesController.update` | `bundles.update` | `store/bundles.controller.ts:47` |
| 372 | GET | `/admin/store/categories` | store | required | ADMIN | ?string | `AdminCategoriesController.listAdmin` | `categories.listAdmin` | `store/categories.controller.ts:37` |
| 373 | POST | `/admin/store/categories` | store | required | ADMIN | CreateCategoryDto | `AdminCategoriesController.create` | `categories.create` | `store/categories.controller.ts:42` |
| 374 | DELETE | `/admin/store/categories/:id` | store | required | ADMIN | - | `AdminCategoriesController.remove` | `categories.remove` | `store/categories.controller.ts:53` |
| 375 | PATCH | `/admin/store/categories/:id` | store | required | ADMIN | UpdateCategoryDto | `AdminCategoriesController.update` | `categories.update` | `store/categories.controller.ts:48` |
| 376 | GET | `/admin/store/currencies` | store | required | ADMIN | - | `AdminCurrenciesController.listAdmin` | `currencies.listAdmin` | `store/currencies.controller.ts:65` |
| 377 | POST | `/admin/store/currencies` | store | required | ADMIN | CreateCurrencyRateDto | `AdminCurrenciesController.create` | `currencies.create` | `store/currencies.controller.ts:70` |
| 378 | PATCH | `/admin/store/currencies/:currency` | store | required | ADMIN | UpdateCurrencyRateDto | `AdminCurrenciesController.update` | `currencies.update` | `store/currencies.controller.ts:76` |
| 379 | POST | `/admin/store/discounts/bulk` | store | required | ADMIN | CreateBulkDiscountDto | `AdminDiscountsController.createBulk` | `discounts.createBulk` | `store/discounts.controller.ts:50` |
| 380 | DELETE | `/admin/store/discounts/bulk/:id` | store | required | ADMIN | - | `AdminDiscountsController.removeBulk` | `discounts.removeBulk` | `store/discounts.controller.ts:64` |
| 381 | PATCH | `/admin/store/discounts/bulk/:id` | store | required | ADMIN | UpdateBulkDiscountDto | `AdminDiscountsController.updateBulk` | `discounts.updateBulk` | `store/discounts.controller.ts:56` |
| 382 | POST | `/admin/store/discounts/loyalty` | store | required | ADMIN | CreateLoyaltyDiscountDto | `AdminDiscountsController.createLoyalty` | `discounts.createLoyalty` | `store/discounts.controller.ts:70` |
| 383 | DELETE | `/admin/store/discounts/loyalty/:id` | store | required | ADMIN | - | `AdminDiscountsController.removeLoyalty` | `discounts.removeLoyalty` | `store/discounts.controller.ts:84` |
| 384 | PATCH | `/admin/store/discounts/loyalty/:id` | store | required | ADMIN | UpdateLoyaltyDiscountDto | `AdminDiscountsController.updateLoyalty` | `discounts.updateLoyalty` | `store/discounts.controller.ts:76` |
| 385 | GET | `/admin/store/products` | store | required | ADMIN | ?string | `AdminProductsController.listAdmin` | `products.listAdmin` | `store/products.controller.ts:87` |
| 386 | POST | `/admin/store/products` | store | required | ADMIN | CreateProductDto | `AdminProductsController.create` | `products.create` | `store/products.controller.ts:96` |
| 387 | DELETE | `/admin/store/products/:id` | store | required | ADMIN | - | `AdminProductsController.remove` | `products.remove` | `store/products.controller.ts:107` |
| 388 | PATCH | `/admin/store/products/:id` | store | required | ADMIN | UpdateProductDto | `AdminProductsController.update` | `products.update` | `store/products.controller.ts:102` |
| 389 | POST | `/admin/store/products/:id/variants` | store | required | ADMIN | CreateVariantDto | `AdminProductsController.createVariant` | `products.createVariant` | `store/products.controller.ts:113` |
| 390 | DELETE | `/admin/store/products/:id/variants/:variantId` | store | required | ADMIN | - | `AdminProductsController.removeVariant` | `products.removeVariant` | `store/products.controller.ts:131` |
| 391 | PATCH | `/admin/store/products/:id/variants/:variantId` | store | required | ADMIN | UpdateVariantDto | `AdminProductsController.updateVariant` | `products.updateVariant` | `store/products.controller.ts:122` |
| 392 | GET | `/admin/store/stats` | store | required | ADMIN | - | `AdminStoreStatsController.getAll` | `stats.getAll` | `store/stats.controller.ts:27` |
| 393 | GET | `/admin/store/stats/overview` | store | required | ADMIN | - | `AdminStoreStatsController.overview` | `stats.overview` | `store/stats.controller.ts:32` |
| 394 | GET | `/admin/store/stats/revenue-by-week` | store | required | ADMIN | - | `AdminStoreStatsController.revenueByWeek` | `stats.revenueByWeek` | `store/stats.controller.ts:56` |
| 395 | GET | `/admin/store/stats/sales-by-category` | store | required | ADMIN | - | `AdminStoreStatsController.salesByCategory` | `stats.salesByCategory` | `store/stats.controller.ts:44` |
| 396 | GET | `/admin/store/stats/sales-by-day` | store | required | ADMIN | - | `AdminStoreStatsController.salesByDay` | `stats.salesByDay` | `store/stats.controller.ts:37` |
| 397 | GET | `/admin/store/stats/top-products` | store | required | ADMIN | - | `AdminStoreStatsController.topProducts` | `stats.topProducts` | `store/stats.controller.ts:49` |
| 398 | GET | `/store/bundles` | store | NONE (no guard) | - | - | `BundlesController.list` | `bundles.list` | `store/bundles.controller.ts:24` |
| 399 | GET | `/store/bundles/:slug` | store | NONE (no guard) | - | - | `BundlesController.getBySlug` | `bundles.getBySlug` | `store/bundles.controller.ts:29` |
| 400 | DELETE | `/store/cart` | store | required | - | - | `CartController.clear` | `cart.clear` | `store/cart.controller.ts:60` |
| 401 | GET | `/store/cart` | store | required | - | - | `CartController.getCart` | `cart.getCart` | `store/cart.controller.ts:29` |
| 402 | POST | `/store/cart/apply-promo` | store | required | - | ApplyPromoDto | `CartController.applyPromo` | `cart.applyPromo` | `store/cart.controller.ts:66` |
| 403 | POST | `/store/cart/calculate` | store | required | - | CalculateCartDto | `CartController.calculate` | `cart.calculate` | `store/cart.controller.ts:79` |
| 404 | POST | `/store/cart/items` | store | required | - | AddCartItemDto | `CartController.addItem` | `cart.addItem` | `store/cart.controller.ts:34` |
| 405 | DELETE | `/store/cart/items/:id` | store | required | - | - | `CartController.removeItem` | `cart.removeItem` | `store/cart.controller.ts:52` |
| 406 | PATCH | `/store/cart/items/:id` | store | required | - | UpdateCartItemDto | `CartController.updateItem` | `cart.updateItem` | `store/cart.controller.ts:43` |
| 407 | DELETE | `/store/cart/promo` | store | required | - | - | `CartController.removePromo` | `cart.removePromo` | `store/cart.controller.ts:74` |
| 408 | GET | `/store/categories` | store | NONE (no guard) | - | - | `CategoriesController.list` | `categories.listTree` | `store/categories.controller.ts:25` |
| 409 | GET | `/store/currencies` | store | NONE (no guard) | - | - | `CurrenciesController.listActive` | `currencies.listActive` | `store/currencies.controller.ts:53` |
| 410 | GET | `/store/currency-rates` | store | NONE (no guard) | - | - | `GameCurrencyController.getGameRates` | `currencies.getGameCurrencyRates` | `store/currencies.controller.ts:33` |
| 411 | GET | `/store/discounts/bulk` | store | NONE (no guard) | - | - | `DiscountsController.listBulk` | `discounts.listBulk` | `store/discounts.controller.ts:33` |
| 412 | GET | `/store/discounts/loyalty` | store | NONE (no guard) | - | - | `DiscountsController.listLoyalty` | `discounts.listLoyalty` | `store/discounts.controller.ts:38` |
| 413 | POST | `/store/exchange` | store | required | - | CurrencyExchangeDto | `GameCurrencyController.exchange` | `currencies.exchange` | `store/currencies.controller.ts:38` |
| 414 | GET | `/store/orders` | store | required | - | - | `OrdersController.list` | `orders.listMine` | `store/orders.controller.ts:63` |
| 415 | POST | `/store/orders` | store | required | - | CreateOrderDto | `OrdersController.create` | `orders.createFromCart` | `store/orders.controller.ts:54` |
| 416 | POST | `/store/orders/:orderId/mock-complete` | store | required | - | - | `OrdersController.mockComplete` | `orders.mockComplete` | `store/orders.controller.ts:80` |
| 417 | GET | `/store/orders/:orderNumber` | store | required | - | - | `OrdersController.getByNumber` | `orders.getByOrderNumber` | `store/orders.controller.ts:72` |
| 418 | GET | `/store/products` | store | NONE (no guard) | - | ?string, ?ProductType, ?string | `ProductsController.list` | `products.list` | `store/products.controller.ts:41` |
| 419 | GET | `/store/products/:slug` | store | optional | - | - | `ProductsController.getBySlug` | `products.getBySlug` | `store/products.controller.ts:71` |
| 420 | GET | `/store/products/:slug/bought-together` | store | NONE (no guard) | - | - | `ProductsController.getBoughtTogether` | `products.getBoughtTogether` | `store/products.controller.ts:66` |
| 421 | POST | `/store/promocodes/validate` | store | optional | - | ValidatePromoDto | `PromocodesController.validate` | `cart.validatePromo` | `store/promocodes.controller.ts:29` |
| 422 | POST | `/store/quick-buy` | store | NONE (no guard) | - | QuickBuyDto | `StoreExtrasController.quickBuy` | `orders.quickBuy` | `store/orders.controller.ts:42` |
| 423 | GET | `/store/recent-purchases` | store | NONE (no guard) | - | - | `StoreExtrasController.recentPurchases` | `orders.recentPurchases` | `store/orders.controller.ts:35` |
| 424 | GET | `/store/wishlist` | store | required | - | - | `WishlistController.getWishlist` | `wishlist.getWishlist` | `store/wishlist.controller.ts:27` |
| 425 | PATCH | `/store/wishlist` | store | required | - | UpdateWishlistDto | `WishlistController.updateVisibility` | `wishlist.updateVisibility` | `store/wishlist.controller.ts:52` |
| 426 | GET | `/store/wishlist/:username` | store | NONE (no guard) | - | - | `WishlistController.getPublic` | `wishlist.getPublicByUsername` | `store/wishlist.controller.ts:71` |
| 427 | DELETE | `/store/wishlist/items/:productId` | store | required | - | - | `WishlistController.removeItem` | `wishlist.removeItem` | `store/wishlist.controller.ts:43` |
| 428 | POST | `/store/wishlist/items/:productId` | store | required | - | - | `WishlistController.addItem` | `wishlist.addItem` | `store/wishlist.controller.ts:33` |
| 429 | POST | `/store/wishlist/items/:productId/gift` | store | required | - | GiftWishlistItemDto | `WishlistController.giftItem` | `-` | `store/wishlist.controller.ts:61` |
| 430 | GET | `/admin/streams` | streaming | required | ADMIN | - | `AdminStreamingController.list` | `streaming.adminList` | `streaming/streaming.controller.ts:36` |
| 431 | POST | `/admin/streams` | streaming | required | ADMIN | CreateStreamChannelDto | `AdminStreamingController.create` | `streaming.create` | `streaming/streaming.controller.ts:41` |
| 432 | DELETE | `/admin/streams/:id` | streaming | required | ADMIN | - | `AdminStreamingController.remove` | `streaming.remove` | `streaming/streaming.controller.ts:51` |
| 433 | PATCH | `/admin/streams/:id` | streaming | required | ADMIN | UpdateStreamChannelDto | `AdminStreamingController.update` | `streaming.update` | `streaming/streaming.controller.ts:46` |
| 434 | POST | `/admin/streams/refresh` | streaming | required | ADMIN | - | `AdminStreamingController.refresh` | `streaming.refresh` | `streaming/streaming.controller.ts:57` |
| 435 | GET | `/streams` | streaming | NONE (no guard) | - | - | `StreamingController.list` | `streaming.publicList` | `streaming/streaming.controller.ts:24` |
| 436 | GET | `/admin/announcements` | system | required | ADMIN | - | `SystemController.listAnnouncements` | `system.listAllAnnouncements` | `system/system.controller.ts:156` |
| 437 | POST | `/admin/announcements` | system | required | ADMIN | AnnouncementDto | `SystemController.createAnnouncement` | `system.createAnnouncement` | `system/system.controller.ts:163` |
| 438 | DELETE | `/admin/announcements/:id` | system | required | ADMIN | - | `SystemController.deleteAnnouncement` | `system.deleteAnnouncement` | `system/system.controller.ts:180` |
| 439 | PATCH | `/admin/announcements/:id` | system | required | ADMIN | Partial<AnnouncementDto> | `SystemController.updateAnnouncement` | `system.updateAnnouncement` | `system/system.controller.ts:173` |
| 440 | POST | `/admin/maintenance/disable` | system | required | ADMIN | - | `SystemController.disableMaintenance` | `system.disableMaintenance` | `system/system.controller.ts:131` |
| 441 | POST | `/admin/maintenance/enable` | system | required | ADMIN | EnableMaintenanceDto | `SystemController.enableMaintenance` | `system.enableMaintenance` | `system/system.controller.ts:121` |
| 442 | GET | `/admin/maintenance/status` | system | required | ADMIN | - | `SystemController.maintenanceStatus` | `system.getMaintenanceStatus` | `system/system.controller.ts:138` |
| 443 | PATCH | `/admin/modules/:module` | system | required | ADMIN | UpdateModuleDto | `SystemController.updateModule` | `system.updateModule` | `system/system.controller.ts:145` |
| 444 | GET | `/announcements/active` | system | NONE (no guard) | - | - | `SystemController.getActiveAnnouncements` | `system.listActiveAnnouncements` | `system/system.controller.ts:116` |
| 445 | GET | `/system/modules` | system | NONE (no guard) | - | - | `SystemController.getModules` | `system.listModules` | `system/system.controller.ts:111` |
| 446 | GET | `/system/status` | system | NONE (no guard) | - | - | `SystemController.getStatus` | `system.getPublicStatus` | `system/system.controller.ts:106` |
| 447 | GET | `/admin/topics` | topics | required | OWNER | - | `TopicsController.listAdmin` | `topics.listAdmin` | `topics/topics.controller.ts:61` |
| 448 | POST | `/admin/topics` | topics | required | OWNER | CreateTopicDto | `TopicsController.create` | `topics.create` | `topics/topics.controller.ts:75` |
| 449 | DELETE | `/admin/topics/:id` | topics | required | OWNER | - | `TopicsController.remove` | `topics.remove` | `topics/topics.controller.ts:97` |
| 450 | GET | `/admin/topics/:id` | topics | required | OWNER | - | `TopicsController.getAdminById` | `topics.getAdminById` | `topics/topics.controller.ts:68` |
| 451 | PATCH | `/admin/topics/:id` | topics | required | OWNER | UpdateTopicDto | `TopicsController.update` | `topics.update` | `topics/topics.controller.ts:86` |
| 452 | POST | `/admin/topics/:id/attachments` | topics | required | OWNER | - | `TopicsController.addAttachment` | `topics.addAttachment` | `topics/topics.controller.ts:133` |
| 453 | DELETE | `/admin/topics/:id/attachments/:attachmentId` | topics | required | OWNER | - | `TopicsController.removeAttachment` | `topics.removeAttachment` | `topics/topics.controller.ts:155` |
| 454 | POST | `/admin/topics/:id/pin` | topics | required | OWNER | - | `TopicsController.pin` | `topics.pin` | `topics/topics.controller.ts:113` |
| 455 | POST | `/admin/topics/:id/unpin` | topics | required | OWNER | - | `TopicsController.unpin` | `topics.unpin` | `topics/topics.controller.ts:123` |
| 456 | POST | `/admin/topics/reorder` | topics | required | OWNER | ReorderTopicsDto | `TopicsController.reorder` | `topics.reorder` | `topics/topics.controller.ts:105` |
| 457 | GET | `/topics` | topics | optional | - | ?ListTopicsQueryDto | `TopicsController.list` | `topics.listPublic` | `topics/topics.controller.ts:43` |
| 458 | GET | `/topics/:slug` | topics | optional | - | - | `TopicsController.getBySlug` | `topics.getBySlug` | `topics/topics.controller.ts:52` |
| 459 | GET | `/admin/media-requests` | users | required | ADMIN | - | `AdminUsersController.listMediaRequests` | `users.listAdminMediaRequests` | `users/users.controller.ts:150` |
| 460 | PATCH | `/admin/media-requests/:id` | users | required | ADMIN | ReviewMediaRequestDto | `AdminUsersController.reviewMediaRequest` | `users.reviewMediaRequest` | `users/users.controller.ts:155` |
| 461 | GET | `/admin/profile-reports` | users | required | ADMIN | - | `AdminUsersController.listReports` | `users.listProfileReports` | `users/users.controller.ts:164` |
| 462 | PATCH | `/admin/profile-reports/:id` | users | required | ADMIN | ReviewProfileReportDto | `AdminUsersController.reviewReport` | `users.reviewProfileReport` | `users/users.controller.ts:169` |
| 463 | GET | `/admin/users/:userId/badges` | users | required | ADMIN | - | `AdminUsersController.listBadges` | `users.listUserBadges` | `users/users.controller.ts:121` |
| 464 | POST | `/admin/users/:userId/badges` | users | required | ADMIN | GrantBadgeDto | `AdminUsersController.grantBadge` | `users.grantBadge` | `users/users.controller.ts:126` |
| 465 | DELETE | `/admin/users/:userId/badges/:type` | users | required | ADMIN | - | `AdminUsersController.revokeBadge` | `users.revokeBadge` | `users/users.controller.ts:136` |
| 466 | PATCH | `/admin/users/:userId/statistics` | users | required | ADMIN | UpdateStatisticsDto | `AdminUsersController.updateStatistics` | `users.updateStatistics` | `users/users.controller.ts:142` |
| 467 | GET | `/banners/presets` | users | NONE (no guard) | - | - | `BannersController.listPresets` | `users.listBannerPresets` | `users/me.controller.ts:175` |
| 468 | GET | `/users/:username/public` | users | optional | - | - | `UsersController.findPublic` | `users.findPublicProfile` | `users/users.controller.ts:65` |
| 469 | PUT | `/users/:username/reaction` | users | required | - | SetReactionDto | `UsersController.setReaction` | `users.setReaction` | `users/users.controller.ts:93` |
| 470 | POST | `/users/:username/report` | users | required | - | CreateProfileReportDto | `UsersController.report` | `users.createReport` | `users/users.controller.ts:103` |
| 471 | GET | `/users/:username/search-hint` | users | public | - | - | `UsersController.searchHint` | `users.searchHint` | `users/users.controller.ts:59` |
| 472 | GET | `/users/:username/statistics` | users | optional | - | - | `UsersController.getStatistics` | `users.getStatistics` | `users/users.controller.ts:74` |
| 473 | POST | `/users/:username/view` | users | required | - | - | `UsersController.recordView` | `users.recordView` | `users/users.controller.ts:83` |
| 474 | DELETE | `/users/me/avatar` | users | required | - | - | `MeController.deleteAvatar` | `users.deleteAvatar` | `users/me.controller.ts:98` |
| 475 | POST | `/users/me/avatar` | users | required | - | - | `MeController.uploadAvatar` | `users.uploadAvatar` | `users/me.controller.ts:81` |
| 476 | PATCH | `/users/me/awards/order` | users | required | - | UpdateAwardsOrderDto | `MeController.updateAwardsOrder` | `users.updateAwardsOrder` | `users/me.controller.ts:65` |
| 477 | PATCH | `/users/me/badges/order` | users | required | - | UpdateBadgesOrderDto | `MeController.updateBadgesOrder` | `users.updateBadgesOrder` | `users/me.controller.ts:57` |
| 478 | DELETE | `/users/me/banner` | users | required | - | - | `MeController.deleteBanner` | `users.deleteBanner` | `users/me.controller.ts:120` |
| 479 | POST | `/users/me/banner` | users | required | - | - | `MeController.uploadBanner` | `users.uploadBanner` | `users/me.controller.ts:103` |
| 480 | PATCH | `/users/me/banner/preset` | users | required | - | SetBannerPresetDto | `MeController.setBannerPreset` | `users.setBannerPreset` | `users/me.controller.ts:125` |
| 481 | PATCH | `/users/me/display-badge` | users | required | - | SetDisplayBadgeDto | `MeController.setDisplayBadge` | `users.setDisplayBadge` | `users/me.controller.ts:73` |
| 482 | POST | `/users/me/media-request` | users | required | - | CreateMediaRequestDto | `MeController.createMediaRequest` | `users.createMediaRequest` | `users/me.controller.ts:156` |
| 483 | GET | `/users/me/media-requests` | users | required | - | - | `MeController.listMediaRequests` | `users.listMyMediaRequests` | `users/me.controller.ts:165` |
| 484 | GET | `/users/me/profile` | users | required | - | - | `MeController.getProfile` | `users.getMyProfile` | `users/me.controller.ts:44` |
| 485 | PATCH | `/users/me/profile` | users | required | - | UpdateProfileDto | `MeController.updateProfile` | `users.updateMyProfile` | `users/me.controller.ts:49` |
| 486 | GET | `/users/me/socials` | users | required | - | - | `MeController.listSocials` | `users.listMySocials` | `users/me.controller.ts:133` |
| 487 | DELETE | `/users/me/socials/:platform` | users | required | - | - | `MeController.deleteSocial` | `users.deleteSocial` | `users/me.controller.ts:147` |
| 488 | PUT | `/users/me/socials/:platform` | users | required | - | UpsertSocialLinkDto | `MeController.upsertSocial` | `users.upsertSocial` | `users/me.controller.ts:138` |
| 489 | GET | `/users/search` | users | required | - | ?SearchUsersDto | `UsersController.search` | `users.search` | `users/users.controller.ts:47` |
| 490 | GET | `/users/search-mentions` | users | required | - | ?SearchMentionsDto | `UsersController.searchMentions` | `users.searchMentions` | `users/users.controller.ts:53` |
| 491 | GET | `/admin/voting/sites` | voting | required | ADMIN | - | `AdminVotingController.list` | `voting.adminList` | `voting/voting.controller.ts:49` |
| 492 | POST | `/admin/voting/sites` | voting | required | ADMIN | CreateVoteSiteDto | `AdminVotingController.create` | `voting.create` | `voting/voting.controller.ts:54` |
| 493 | DELETE | `/admin/voting/sites/:id` | voting | required | ADMIN | - | `AdminVotingController.remove` | `voting.remove` | `voting/voting.controller.ts:64` |
| 494 | PATCH | `/admin/voting/sites/:id` | voting | required | ADMIN | UpdateVoteSiteDto | `AdminVotingController.update` | `voting.update` | `voting/voting.controller.ts:59` |
| 495 | POST | `/admin/voting/sites/:id/rotate-secret` | voting | required | ADMIN | - | `AdminVotingController.rotateSecret` | `voting.rotateSecret` | `voting/voting.controller.ts:70` |
| 496 | GET | `/voting` | voting | optional | - | - | `VotingController.overview` | `voting.overview` | `voting/voting.controller.ts:27` |
| 497 | POST | `/voting/webhook/:slug` | voting | NONE (no guard) | - | VoteWebhookDto | `VotingController.processWebhook` | `voting.processWebhook` | `voting/voting.controller.ts:33` |
