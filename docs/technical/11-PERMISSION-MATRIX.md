# 11 — Permission Matrix (PROPOSED)

> Реестр **автоматически выведен** из всех endpoints с `@Roles(...)`: 1 staff-endpoint → 1 permission key. Это черновик для ревью, а не действующая система (сейчас в коде существует только `RoleGroup`, см. 10-RBAC-PERMISSIONS.md). Часть ключей требует переименования (см. раздел «Замечания»).

Staff-endpoints: **269**, уникальных permission keys: **246**, модулей: **47**.

`SUPERUSER` = Owner, Chief Curator, Chief Developer (wildcard `*`). Колонка «Текущий min RoleGroup» — как защищено сейчас; «Other roles» настраиваются в редакторе ролей, значения по умолчанию в seed определяются при миграции (45-MIGRATION-PLAN.md).

| Module | Permission | Endpoints (method path) | Текущий min RoleGroup | Owner / Chief Curator / Chief Developer | Other roles |
|---|---|---|---|---|---|
| achievements | `achievements.check_all_users.create` | POST `/admin/achievements/check-all-users` | ADMIN | ✔ (`*`) | configurable |
| achievements | `achievements.create` | POST `/admin/achievements` | ADMIN | ✔ (`*`) | configurable |
| achievements | `achievements.delete` | DELETE `/admin/achievements/:id` | ADMIN | ✔ (`*`) | configurable |
| achievements | `achievements.edit` | PATCH `/admin/achievements/:id` | ADMIN | ✔ (`*`) | configurable |
| achievements | `achievements.upload_icon.create` | POST `/admin/achievements/upload-icon` | ADMIN | ✔ (`*`) | configurable |
| achievements | `achievements.view` | GET `/admin/achievements` | ADMIN | ✔ (`*`) | configurable |
| activity | `activity.comments.delete` | DELETE `/moderation/activity/comments/:id` | MODERATOR | ✔ (`*`) | configurable |
| activity | `activity.custom.create` | POST `/admin/activity/custom` | ADMIN | ✔ (`*`) | configurable |
| activity | `activity.delete` | DELETE `/moderation/activity/:id` | MODERATOR | ✔ (`*`) | configurable |
| activity | `activity.pin` | POST `/moderation/activity/:id/pin`<br>DELETE `/moderation/activity/:id/pin` | ADMIN | ✔ (`*`) | configurable |
| activity | `activity.stats` | GET `/admin/activity/stats` | ADMIN | ✔ (`*`) | configurable |
| activity | `activity.view` | GET `/admin/activity` | ADMIN | ✔ (`*`) | configurable |
| announcements | `announcements.create` | POST `/admin/announcements` | ADMIN | ✔ (`*`) | configurable |
| announcements | `announcements.delete` | DELETE `/admin/announcements/:id` | ADMIN | ✔ (`*`) | configurable |
| announcements | `announcements.edit` | PATCH `/admin/announcements/:id` | ADMIN | ✔ (`*`) | configurable |
| announcements | `announcements.view` | GET `/admin/announcements` | ADMIN | ✔ (`*`) | configurable |
| audit_log | `audit_log.export` | POST `/admin/audit-log/export` | ADMIN | ✔ (`*`) | configurable |
| audit_log | `audit_log.stats` | GET `/admin/audit-log/stats` | ADMIN | ✔ (`*`) | configurable |
| audit_log | `audit_log.view` | GET `/admin/audit-log` | ADMIN | ✔ (`*`) | configurable |
| awards | `awards.create` | POST `/admin/awards` | OWNER | ✔ (`*`) | configurable |
| awards | `awards.delete` | DELETE `/admin/awards/:id` | OWNER | ✔ (`*`) | configurable |
| awards | `awards.edit` | PATCH `/admin/awards/:id` | OWNER | ✔ (`*`) | configurable |
| awards | `awards.view` | GET `/admin/awards` | ADMIN | ✔ (`*`) | configurable |
| bookmarks | `bookmarks.create` | POST `/admin/bookmarks` | ADMIN | ✔ (`*`) | configurable |
| bookmarks | `bookmarks.delete` | DELETE `/admin/bookmarks/:id` | ADMIN | ✔ (`*`) | configurable |
| bookmarks | `bookmarks.edit` | PATCH `/admin/bookmarks/:id` | ADMIN | ✔ (`*`) | configurable |
| bookmarks | `bookmarks.reorder` | POST `/admin/bookmarks/reorder` | ADMIN | ✔ (`*`) | configurable |
| bookmarks | `bookmarks.view` | GET `/admin/bookmarks` | ADMIN | ✔ (`*`) | configurable |
| broadcast | `broadcast.create` | POST `/admin/broadcast` | ADMIN | ✔ (`*`) | configurable |
| charts | `charts.reports.view` | GET `/admin/dashboard/charts/reports` | ADMIN | ✔ (`*`) | configurable |
| charts | `charts.revenue.view` | GET `/admin/dashboard/charts/revenue` | ADMIN | ✔ (`*`) | configurable |
| charts | `charts.servers.view` | GET `/admin/dashboard/charts/servers` | ADMIN | ✔ (`*`) | configurable |
| charts | `charts.users.view` | GET `/admin/dashboard/charts/users` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.bans.delete` | DELETE `/admin/chat/bans/:id` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.bans.view` | GET `/admin/chat/bans` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.channels.create` | POST `/admin/chat/channels` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.channels.delete` | DELETE `/admin/chat/channels/:id` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.channels.edit` | PATCH `/admin/chat/channels/:id` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.messages.search.view` | GET `/admin/chat/messages/search` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.messages.view` | GET `/admin/chat/messages/:id` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.mutes.delete` | DELETE `/admin/chat/mutes/:id` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.mutes.view` | GET `/admin/chat/mutes` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.settings.edit` | PATCH `/admin/chat/settings` | ADMIN | ✔ (`*`) | configurable |
| chat | `chat.settings.view` | GET `/admin/chat/settings` | ADMIN | ✔ (`*`) | configurable |
| comment_reports | `comment_reports.edit` | PATCH `/admin/comment-reports/:id` | MODERATOR | ✔ (`*`) | configurable |
| comment_reports | `comment_reports.view` | GET `/admin/comment-reports` | MODERATOR | ✔ (`*`) | configurable |
| comments | `comments.delete` | DELETE `/admin/comments/:id` | MODERATOR | ✔ (`*`) | configurable |
| comments | `comments.hard_delete` | POST `/moderation/comments/:commentId/hard-delete` | MODERATOR | ✔ (`*`) | configurable |
| content | `content.view` | GET `/admin/content/dashboard` | ADMIN | ✔ (`*`) | configurable |
| custom_positions | `custom_positions.create` | POST `/admin/custom-positions` | OWNER | ✔ (`*`) | configurable |
| custom_positions | `custom_positions.delete` | DELETE `/admin/custom-positions/:id` | OWNER | ✔ (`*`) | configurable |
| custom_positions | `custom_positions.edit` | PATCH `/admin/custom-positions/:id` | OWNER | ✔ (`*`) | configurable |
| custom_positions | `custom_positions.view` | GET `/admin/custom-positions` | OWNER | ✔ (`*`) | configurable |
| decorations | `decorations.edit` | PATCH `/admin/decorations/:id` | ADMIN | ✔ (`*`) | configurable |
| decorations | `decorations.grant` | POST `/admin/decorations/grant` | ADMIN | ✔ (`*`) | configurable |
| decorations | `decorations.ownerships.view` | GET `/admin/decorations/ownerships` | ADMIN | ✔ (`*`) | configurable |
| decorations | `decorations.users` | DELETE `/admin/decorations/:decorationId/users/:userId` | ADMIN | ✔ (`*`) | configurable |
| decorations | `decorations.view` | GET `/admin/decorations` | ADMIN | ✔ (`*`) | configurable |
| departments | `departments.create` | POST `/admin/departments` | OWNER | ✔ (`*`) | configurable |
| departments | `departments.delete` | DELETE `/admin/departments/:id` | OWNER | ✔ (`*`) | configurable |
| departments | `departments.edit` | PATCH `/admin/departments/:id` | OWNER | ✔ (`*`) | configurable |
| departments | `departments.view` | GET `/admin/departments` | OWNER | ✔ (`*`) | configurable |
| emojis | `emojis.create` | POST `/admin/emojis` | ADMIN | ✔ (`*`) | configurable |
| emojis | `emojis.delete` | DELETE `/admin/emojis/:id` | ADMIN | ✔ (`*`) | configurable |
| emojis | `emojis.edit` | PATCH `/admin/emojis/:id` | ADMIN | ✔ (`*`) | configurable |
| emojis | `emojis.view` | GET `/admin/emojis` | ADMIN | ✔ (`*`) | configurable |
| events | `events.cancel` | POST `/admin/events/:id/cancel` | ADMIN | ✔ (`*`) | configurable |
| events | `events.create` | POST `/admin/events` | ADMIN | ✔ (`*`) | configurable |
| events | `events.delete` | DELETE `/admin/events/:id` | ADMIN | ✔ (`*`) | configurable |
| events | `events.edit` | PATCH `/admin/events/:id` | ADMIN | ✔ (`*`) | configurable |
| events | `events.publish` | POST `/admin/events/:id/publish` | ADMIN | ✔ (`*`) | configurable |
| events | `events.view` | GET `/admin/events` | ADMIN | ✔ (`*`) | configurable |
| exports | `exports.scheduled.create` | POST `/admin/exports/scheduled` | ADMIN | ✔ (`*`) | configurable |
| exports | `exports.scheduled.delete` | DELETE `/admin/exports/scheduled/:id` | ADMIN | ✔ (`*`) | configurable |
| exports | `exports.scheduled.edit` | PATCH `/admin/exports/scheduled/:id` | ADMIN | ✔ (`*`) | configurable |
| exports | `exports.scheduled.view` | GET `/admin/exports/scheduled` | ADMIN | ✔ (`*`) | configurable |
| finance | `finance.export` | POST `/admin/finance/export` | ADMIN | ✔ (`*`) | configurable |
| finance | `finance.overview.view` | GET `/admin/finance/overview` | ADMIN | ✔ (`*`) | configurable |
| finance | `finance.refunds.view` | GET `/admin/finance/refunds` | ADMIN | ✔ (`*`) | configurable |
| finance | `finance.transactions.view` | GET `/admin/finance/transactions` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.close` | POST `/admin/forms/:id/close` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.create` | POST `/admin/forms` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.delete` | DELETE `/admin/forms/:id` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.duplicate` | POST `/admin/forms/:id/duplicate` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.edit` | PATCH `/admin/forms/:id` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.export` | POST `/admin/forms/:id/export` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.from_template.create` | POST `/admin/forms/from-template/:slug` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.invites` | GET `/admin/forms/:id/invites`<br>POST `/admin/forms/:id/invites`<br>DELETE `/admin/forms/:id/invites/:code` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.publish` | POST `/admin/forms/:id/publish` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.responses` | GET `/admin/forms/:id/responses`<br>GET `/admin/forms/:id/responses/:responseId`<br>DELETE `/admin/forms/:id/responses/:responseId` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.stats` | GET `/admin/forms/:id/stats` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.templates.view` | GET `/admin/forms/templates` | ADMIN | ✔ (`*`) | configurable |
| forms | `forms.view` | GET `/admin/forms`<br>GET `/admin/forms/:id` | ADMIN | ✔ (`*`) | configurable |
| maintenance | `maintenance.disable` | POST `/admin/maintenance/disable` | ADMIN | ✔ (`*`) | configurable |
| maintenance | `maintenance.enable` | POST `/admin/maintenance/enable` | ADMIN | ✔ (`*`) | configurable |
| maintenance | `maintenance.status` | GET `/admin/maintenance/status` | ADMIN | ✔ (`*`) | configurable |
| media_requests | `media_requests.edit` | PATCH `/admin/media-requests/:id` | ADMIN | ✔ (`*`) | configurable |
| media_requests | `media_requests.view` | GET `/admin/media-requests` | ADMIN | ✔ (`*`) | configurable |
| messages | `messages.hard_delete` | POST `/moderation/messages/:messageId/hard-delete` | MODERATOR | ✔ (`*`) | configurable |
| misc | `misc.view` | GET `/admin/dashboard` | ADMIN | ✔ (`*`) | configurable |
| moderator_activity | `moderator_activity.view` | GET `/admin/dashboard/moderator-activity` | ADMIN | ✔ (`*`) | configurable |
| modules | `modules.edit` | PATCH `/admin/modules/:module` | ADMIN | ✔ (`*`) | configurable |
| news | `news.comments.delete` | DELETE `/moderation/news/comments/:commentId` | MODERATOR | ✔ (`*`) | configurable |
| news | `news.comments.pin` | PATCH `/moderation/news/comments/:commentId/pin` | MODERATOR | ✔ (`*`) | configurable |
| news | `news.comments.unpin` | PATCH `/moderation/news/comments/:commentId/unpin` | MODERATOR | ✔ (`*`) | configurable |
| news | `news.create` | POST `/admin/news` | ADMIN | ✔ (`*`) | configurable |
| news | `news.delete` | DELETE `/admin/news/:id` | ADMIN | ✔ (`*`) | configurable |
| news | `news.edit` | PATCH `/admin/news/:id` | ADMIN | ✔ (`*`) | configurable |
| news | `news.export` | POST `/admin/news/export` | ADMIN | ✔ (`*`) | configurable |
| news | `news.feature` | POST `/admin/news/:id/feature` | ADMIN | ✔ (`*`) | configurable |
| news | `news.pin` | POST `/admin/news/:id/pin` | ADMIN | ✔ (`*`) | configurable |
| news | `news.stats` | GET `/admin/news/stats` | ADMIN | ✔ (`*`) | configurable |
| news | `news.unfeature` | POST `/admin/news/:id/unfeature` | ADMIN | ✔ (`*`) | configurable |
| news | `news.unpin` | POST `/admin/news/:id/unpin` | ADMIN | ✔ (`*`) | configurable |
| news | `news.upload_image.create` | POST `/admin/news/upload-image` | ADMIN | ✔ (`*`) | configurable |
| news | `news.view` | GET `/admin/news`<br>GET `/admin/news/:id` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.broadcast` | POST `/admin/notifications/broadcast` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.stats` | GET `/admin/notifications/stats` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.webhooks.create` | POST `/admin/notifications/webhooks` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.webhooks.delete` | DELETE `/admin/notifications/webhooks/:id` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.webhooks.edit` | PATCH `/admin/notifications/webhooks/:id` | ADMIN | ✔ (`*`) | configurable |
| notifications | `notifications.webhooks.view` | GET `/admin/notifications/webhooks` | ADMIN | ✔ (`*`) | configurable |
| orders | `orders.cancel` | PATCH `/admin/orders/:id/cancel` | ADMIN | ✔ (`*`) | configurable |
| orders | `orders.export` | POST `/admin/orders/export` | ADMIN | ✔ (`*`) | configurable |
| orders | `orders.refund` | PATCH `/admin/orders/:id/refund` | ADMIN | ✔ (`*`) | configurable |
| orders | `orders.stats` | GET `/admin/orders/stats` | ADMIN | ✔ (`*`) | configurable |
| orders | `orders.view` | GET `/admin/orders` | ADMIN | ✔ (`*`) | configurable |
| overview | `overview.view` | GET `/admin/dashboard/overview` | ADMIN | ✔ (`*`) | configurable |
| positions | `positions.assign` | POST `/positions/:id/assign` | ADMIN | ✔ (`*`) | configurable |
| positions | `positions.create` | POST `/positions` | OWNER | ✔ (`*`) | configurable |
| positions | `positions.delete` | DELETE `/positions/:id` | OWNER | ✔ (`*`) | configurable |
| positions | `positions.edit` | PATCH `/positions/:id` | OWNER | ✔ (`*`) | configurable |
| positions | `positions.manage.view` | GET `/positions/manage` | ADMIN | ✔ (`*`) | configurable |
| profile_reports | `profile_reports.edit` | PATCH `/admin/profile-reports/:id` | ADMIN | ✔ (`*`) | configurable |
| profile_reports | `profile_reports.view` | GET `/admin/profile-reports` | ADMIN | ✔ (`*`) | configurable |
| promocodes | `promocodes.create` | POST `/admin/promocodes` | ADMIN | ✔ (`*`) | configurable |
| promocodes | `promocodes.delete` | DELETE `/admin/promocodes/:id` | ADMIN | ✔ (`*`) | configurable |
| promocodes | `promocodes.edit` | PATCH `/admin/promocodes/:id` | ADMIN | ✔ (`*`) | configurable |
| promocodes | `promocodes.view` | GET `/admin/promocodes` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.archive` | POST `/admin/reports/:reportNumber/archive` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.archived.view` | GET `/admin/reports/archived` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.assign` | PATCH `/moderation/reports/:reportNumber/assign` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.ban` | POST `/admin/reports/ban/:userId`<br>DELETE `/admin/reports/ban/:userId` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.delete` | DELETE `/admin/reports/:reportNumber` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.export` | POST `/admin/reports/export` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.lock` | POST `/moderation/reports/:reportNumber/lock` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.messages` | POST `/moderation/reports/:reportNumber/messages`<br>DELETE `/moderation/reports/:reportNumber/messages/:messageId`<br>DELETE `/admin/reports/:reportNumber/messages/:messageId` | ADMIN, HELPER | ✔ (`*`) | configurable |
| reports | `reports.messages.pin` | PATCH `/moderation/reports/:reportNumber/messages/:messageId/pin` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.messages.unpin` | PATCH `/moderation/reports/:reportNumber/messages/:messageId/unpin` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.notes` | POST `/moderation/reports/:reportNumber/notes`<br>PATCH `/moderation/reports/:reportNumber/notes/:noteId`<br>DELETE `/moderation/reports/:reportNumber/notes/:noteId` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.notes.pin` | PATCH `/moderation/reports/:reportNumber/notes/:noteId/pin` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.stats` | GET `/admin/reports/stats` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.status` | PATCH `/moderation/reports/:reportNumber/status` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.unarchive` | POST `/admin/reports/:reportNumber/unarchive` | ADMIN | ✔ (`*`) | configurable |
| reports | `reports.verdict` | PATCH `/moderation/reports/:reportNumber/verdict` | HELPER | ✔ (`*`) | configurable |
| reports | `reports.view` | GET `/moderation/reports` | HELPER | ✔ (`*`) | configurable |
| saved_filters | `saved_filters.create` | POST `/admin/saved-filters` | ADMIN | ✔ (`*`) | configurable |
| saved_filters | `saved_filters.delete` | DELETE `/admin/saved-filters/:id` | ADMIN | ✔ (`*`) | configurable |
| saved_filters | `saved_filters.edit` | PATCH `/admin/saved-filters/:id` | ADMIN | ✔ (`*`) | configurable |
| saved_filters | `saved_filters.view` | GET `/admin/saved-filters` | ADMIN | ✔ (`*`) | configurable |
| security | `security.ip_whitelist.create` | POST `/admin/security/ip-whitelist` | ADMIN | ✔ (`*`) | configurable |
| security | `security.logins.view` | GET `/admin/security/logins` | ADMIN | ✔ (`*`) | configurable |
| security | `security.sessions.view` | GET `/admin/security/sessions` | ADMIN | ✔ (`*`) | configurable |
| security | `security.suspicious.view` | GET `/admin/security/suspicious` | ADMIN | ✔ (`*`) | configurable |
| server_categories | `server_categories.create` | POST `/admin/server-categories` | ADMIN | ✔ (`*`) | configurable |
| server_categories | `server_categories.delete` | DELETE `/admin/server-categories/:id` | ADMIN | ✔ (`*`) | configurable |
| server_categories | `server_categories.edit` | PATCH `/admin/server-categories/:id` | ADMIN | ✔ (`*`) | configurable |
| server_categories | `server_categories.view` | GET `/admin/server-categories` | ADMIN | ✔ (`*`) | configurable |
| servers | `servers.create` | POST `/admin/servers` | ADMIN | ✔ (`*`) | configurable |
| servers | `servers.delete` | DELETE `/admin/servers/:id` | ADMIN | ✔ (`*`) | configurable |
| servers | `servers.edit` | PATCH `/admin/servers/:id` | ADMIN | ✔ (`*`) | configurable |
| servers | `servers.logs` | GET `/admin/servers/:id/logs` | ADMIN | ✔ (`*`) | configurable |
| servers | `servers.view` | GET `/admin/servers` | ADMIN | ✔ (`*`) | configurable |
| settings | `settings.edit` | PATCH `/admin/settings` | ADMIN | ✔ (`*`) | configurable |
| settings | `settings.site.edit` | PATCH `/admin/settings/site` | ADMIN | ✔ (`*`) | configurable |
| settings | `settings.site.view` | GET `/admin/settings/site` | ADMIN | ✔ (`*`) | configurable |
| settings | `settings.view` | GET `/admin/settings` | ADMIN | ✔ (`*`) | configurable |
| store | `store.bundles.create` | POST `/admin/store/bundles` | ADMIN | ✔ (`*`) | configurable |
| store | `store.bundles.delete` | DELETE `/admin/store/bundles/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.bundles.edit` | PATCH `/admin/store/bundles/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.categories.create` | POST `/admin/store/categories` | ADMIN | ✔ (`*`) | configurable |
| store | `store.categories.delete` | DELETE `/admin/store/categories/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.categories.edit` | PATCH `/admin/store/categories/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.categories.view` | GET `/admin/store/categories` | ADMIN | ✔ (`*`) | configurable |
| store | `store.currencies.create` | POST `/admin/store/currencies` | ADMIN | ✔ (`*`) | configurable |
| store | `store.currencies.edit` | PATCH `/admin/store/currencies/:currency` | ADMIN | ✔ (`*`) | configurable |
| store | `store.currencies.view` | GET `/admin/store/currencies` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.bulk.create` | POST `/admin/store/discounts/bulk` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.bulk.delete` | DELETE `/admin/store/discounts/bulk/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.bulk.edit` | PATCH `/admin/store/discounts/bulk/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.loyalty.create` | POST `/admin/store/discounts/loyalty` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.loyalty.delete` | DELETE `/admin/store/discounts/loyalty/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.discounts.loyalty.edit` | PATCH `/admin/store/discounts/loyalty/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.products.create` | POST `/admin/store/products` | ADMIN | ✔ (`*`) | configurable |
| store | `store.products.delete` | DELETE `/admin/store/products/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.products.edit` | PATCH `/admin/store/products/:id` | ADMIN | ✔ (`*`) | configurable |
| store | `store.products.variants` | POST `/admin/store/products/:id/variants`<br>PATCH `/admin/store/products/:id/variants/:variantId`<br>DELETE `/admin/store/products/:id/variants/:variantId` | ADMIN | ✔ (`*`) | configurable |
| store | `store.products.view` | GET `/admin/store/products` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats` | GET `/admin/store/stats` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats.overview.view` | GET `/admin/store/stats/overview` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats.revenue_by_week.view` | GET `/admin/store/stats/revenue-by-week` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats.sales_by_category.view` | GET `/admin/store/stats/sales-by-category` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats.sales_by_day.view` | GET `/admin/store/stats/sales-by-day` | ADMIN | ✔ (`*`) | configurable |
| store | `store.stats.top_products.view` | GET `/admin/store/stats/top-products` | ADMIN | ✔ (`*`) | configurable |
| streams | `streams.create` | POST `/admin/streams` | ADMIN | ✔ (`*`) | configurable |
| streams | `streams.delete` | DELETE `/admin/streams/:id` | ADMIN | ✔ (`*`) | configurable |
| streams | `streams.edit` | PATCH `/admin/streams/:id` | ADMIN | ✔ (`*`) | configurable |
| streams | `streams.refresh.create` | POST `/admin/streams/refresh` | ADMIN | ✔ (`*`) | configurable |
| streams | `streams.view` | GET `/admin/streams` | ADMIN | ✔ (`*`) | configurable |
| support | `support.donations.view` | GET `/admin/support/donations` | OWNER | ✔ (`*`) | configurable |
| top_buyers | `top_buyers.view` | GET `/admin/dashboard/top-buyers` | ADMIN | ✔ (`*`) | configurable |
| top_products | `top_products.view` | GET `/admin/dashboard/top-products` | ADMIN | ✔ (`*`) | configurable |
| topics | `topics.attachments` | POST `/admin/topics/:id/attachments`<br>DELETE `/admin/topics/:id/attachments/:attachmentId` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.create` | POST `/admin/topics` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.delete` | DELETE `/admin/topics/:id` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.edit` | PATCH `/admin/topics/:id` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.pin` | POST `/admin/topics/:id/pin` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.reorder` | POST `/admin/topics/reorder` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.unpin` | POST `/admin/topics/:id/unpin` | OWNER | ✔ (`*`) | configurable |
| topics | `topics.view` | GET `/admin/topics`<br>GET `/admin/topics/:id` | OWNER | ✔ (`*`) | configurable |
| users | `users.achievements` | DELETE `/moderation/users/:userId/achievements/:achievementId` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.achievements.grant` | POST `/moderation/users/:userId/achievements/:achievementId/grant` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.awards` | POST `/admin/users/:userId/awards/:awardId`<br>DELETE `/admin/users/:userId/awards/:awardId` | ADMIN | ✔ (`*`) | configurable |
| users | `users.badges` | GET `/admin/users/:userId/badges`<br>POST `/admin/users/:userId/badges`<br>DELETE `/admin/users/:userId/badges/:type` | ADMIN | ✔ (`*`) | configurable |
| users | `users.ban` | POST `/moderation/users/:userId/ban` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.bulk.edit` | PATCH `/admin/users/bulk` | ADMIN | ✔ (`*`) | configurable |
| users | `users.change_role` | POST `/admin/users/:userId/change-role` | OWNER | ✔ (`*`) | configurable |
| users | `users.comments.disable` | POST `/admin/users/:userId/comments/disable` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.comments.enable` | POST `/admin/users/:userId/comments/enable` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.custom_position` | POST `/admin/users/:userId/custom-position`<br>DELETE `/admin/users/:userId/custom-position` | OWNER | ✔ (`*`) | configurable |
| users | `users.delete` | DELETE `/admin/users/:userId` | OWNER | ✔ (`*`) | configurable |
| users | `users.departments` | POST `/admin/users/:userId/departments`<br>DELETE `/admin/users/:userId/departments/:departmentId` | ADMIN | ✔ (`*`) | configurable |
| users | `users.departments.order.edit` | PATCH `/admin/users/:userId/departments/order` | ADMIN | ✔ (`*`) | configurable |
| users | `users.export` | POST `/admin/users/export` | ADMIN | ✔ (`*`) | configurable |
| users | `users.full` | GET `/admin/users/:id/full` | ADMIN | ✔ (`*`) | configurable |
| users | `users.kick` | POST `/moderation/users/:userId/kick` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.mute` | POST `/moderation/users/:userId/mute` | HELPER | ✔ (`*`) | configurable |
| users | `users.punishments` | GET `/admin/users/:username/punishments`<br>POST `/admin/users/:userId/punishments`<br>PATCH `/admin/users/:userId/punishments/:id` | MODERATOR | ✔ (`*`) | configurable |
| users | `users.statistics` | PATCH `/admin/users/:userId/statistics` | ADMIN | ✔ (`*`) | configurable |
| users | `users.view` | GET `/admin/users` | ADMIN | ✔ (`*`) | configurable |
| users | `users.warn` | POST `/moderation/users/:userId/warn` | HELPER | ✔ (`*`) | configurable |
| voting | `voting.sites.create` | POST `/admin/voting/sites` | ADMIN | ✔ (`*`) | configurable |
| voting | `voting.sites.delete` | DELETE `/admin/voting/sites/:id` | ADMIN | ✔ (`*`) | configurable |
| voting | `voting.sites.edit` | PATCH `/admin/voting/sites/:id` | ADMIN | ✔ (`*`) | configurable |
| voting | `voting.sites.rotate_secret` | POST `/admin/voting/sites/:id/rotate-secret` | ADMIN | ✔ (`*`) | configurable |
| voting | `voting.sites.view` | GET `/admin/voting/sites` | ADMIN | ✔ (`*`) | configurable |

## Замечания по выведенным ключам
- Ключи вида `*.view` покрывают GET-списки и GET-детали; при необходимости разделить на `*.view` и `*.view_details`.
- Эндпоинты `/admin/*/export` → `*.export`; `/admin/*/stats` → `*.stats` либо `*.view` (решить при ревью).
- Составные ключи (`reports.messages.pin`, `store.currencies.edit`) — вложенный ресурс; рекомендуемый формат нового реестра: `<module>.<resource>.<action>`.
- Артефакты автогенерации: ключи `misc.view`, `overview.view`, `content.view`, `modules.edit`, `charts.*` соответствуют dashboard/служебным endpoints и должны быть перенесены в модули `dashboard.*` / `system.*`.

