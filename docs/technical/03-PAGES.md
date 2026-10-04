# 03 — Карта страниц (frontend)

Источник: `apps/web/src/app/**/page.tsx` — **143 страниц**. Router: Next.js App Router, локаль `[locale]` (next-intl; дефолтная локаль без префикса, остальные — `/uk`, `/en`; сегмент `[locale]` ниже опущен). Route groups `(auth)` опущены.

Защита маршрутов: (1) `middleware.ts` редиректит на `/login`, если нет cookie `refresh_token`, для префиксов `/profile`, `/admin`, `/dashboard`, `/moderation` — это **единственная** серверная проверка, роль в ней не проверяется; (2) layout `/admin` вызывает `useRoleGuard(RoleGroup.ADMIN)`, `/dashboard` — `OWNER`, `/moderation` — см. layout; (3) настоящая защита — на backend.

Статусы: `IMPLEMENTED` по умолчанию; страницы с пометкой TODO в исходнике отмечены `STUB`/`PARTIAL`.

| Category | Route | Client | Role guard (layout/page) | Dynamic params | Hooks → API calls (статически найденные) | Source |
|---|---|---|---|---|---|---|
| Administration | `/admin` | server | ADMIN | — | — | `[locale]/admin/page.tsx` |
| Administration | `/admin/achievements` | yes | ADMIN | — | DELETE `/admin/achievements/:p`<br>GET `/admin/achievements`<br>PATCH `/admin/achievements/:p`<br>POST `/admin/achievements`<br>POST `/admin/achievements/check-all-users`<br>POST `/admin/achievements/upload-icon` | `[locale]/admin/achievements/page.tsx` |
| Administration | `/admin/activity/custom` | yes | ADMIN | — | DELETE `/activity/comments/:p`<br>DELETE `/moderation/activity/:p`<br>DELETE `/moderation/activity/:p/pin`<br>GET `/activity/:p`<br>GET `/activity/feed`<br>GET `/activity/feed/global-highlights`<br>GET `/activity/feed/user/:p`<br>GET `/activity/settings` | `[locale]/admin/activity/custom/page.tsx` |
| Administration | `/admin/activity/manage` | yes | ADMIN | — | DELETE `/activity/comments/:p`<br>DELETE `/moderation/activity/:p`<br>DELETE `/moderation/activity/:p/pin`<br>GET `/activity/:p`<br>GET `/activity/feed`<br>GET `/activity/feed/global-highlights`<br>GET `/activity/feed/user/:p`<br>GET `/activity/settings` | `[locale]/admin/activity/manage/page.tsx` |
| Administration | `/admin/activity/stats` | yes | ADMIN | — | DELETE `/activity/comments/:p`<br>DELETE `/moderation/activity/:p`<br>DELETE `/moderation/activity/:p/pin`<br>GET `/activity/:p`<br>GET `/activity/feed`<br>GET `/activity/feed/global-highlights`<br>GET `/activity/feed/user/:p`<br>GET `/activity/settings` | `[locale]/admin/activity/stats/page.tsx` |
| Administration | `/admin/announcements` | server | ADMIN | — | — | `[locale]/admin/announcements/page.tsx` |
| Administration | `/admin/audit-log` | yes | ADMIN | — | GET `/admin/audit-log`<br>GET `/admin/audit-log/stats`<br>POST `/admin/audit-log/export` | `[locale]/admin/audit-log/page.tsx` |
| Administration | `/admin/awards` | yes | ADMIN | — | DELETE `/admin/awards/:p`<br>DELETE `/admin/users/:p/awards/:p`<br>GET `/admin/awards`<br>POST `/admin/awards`<br>POST `/admin/users/:p/awards/:p` | `[locale]/admin/awards/page.tsx` |
| Administration | `/admin/badges` | yes | ADMIN | — | DELETE `/admin/users/:p/badges/:p`<br>GET `/admin/users/:p/badges`<br>POST `/admin/users/:p/badges`<br>POST `/admin/users/:p/comments/disable`<br>POST `/admin/users/:p/comments/enable` | `[locale]/admin/badges/page.tsx` |
| Administration | `/admin/broadcast` | yes | ADMIN | — | POST `/admin/broadcast` | `[locale]/admin/broadcast/page.tsx` |
| Administration | `/admin/chat` | server | ADMIN | — | — | `[locale]/admin/chat/page.tsx` |
| Administration | `/admin/chat/bans` | server | ADMIN | — | — | `[locale]/admin/chat/bans/page.tsx` |
| Administration | `/admin/chat/channels` | server | ADMIN | — | — | `[locale]/admin/chat/channels/page.tsx` |
| Administration | `/admin/chat/mutes` | server | ADMIN | — | — | `[locale]/admin/chat/mutes/page.tsx` |
| Administration | `/admin/chat/search` | server | ADMIN | — | — | `[locale]/admin/chat/search/page.tsx` |
| Administration | `/admin/chat/settings` | server | ADMIN | — | — | `[locale]/admin/chat/settings/page.tsx` |
| Administration | `/admin/comment-reports` | server | ADMIN | — | — | `[locale]/admin/comment-reports/page.tsx` |
| Administration | `/admin/custom-positions` | yes | ADMIN | — | DELETE `/admin/custom-positions/:p`<br>DELETE `/admin/users/:p/custom-position`<br>GET `/admin/custom-positions`<br>PATCH `/admin/custom-positions/:p`<br>POST `/admin/custom-positions`<br>POST `/admin/users/:p/custom-position` | `[locale]/admin/custom-positions/page.tsx` |
| Administration | `/admin/dashboard` | server | ADMIN | — | — | `[locale]/admin/dashboard/page.tsx` |
| Administration | `/admin/decorations` | yes | ADMIN | — | DELETE `/admin/decorations/:p/users/:p`<br>GET `/admin/decorations`<br>GET `/admin/decorations/ownerships`<br>PATCH `/admin/decorations/:p`<br>POST `/admin/decorations/grant` | `[locale]/admin/decorations/page.tsx` |
| Administration | `/admin/departments` | yes | ADMIN | — | DELETE `/admin/departments/:p`<br>DELETE `/admin/users/:p/departments/:p`<br>GET `/users/:p/public`<br>PATCH `/admin/departments/:p`<br>PATCH `/admin/users/:p/departments/order`<br>POST `/admin/departments`<br>POST `/admin/users/:p/departments` | `[locale]/admin/departments/page.tsx` |
| Administration | `/admin/emojis` | yes | ADMIN | — | DELETE `/admin/emojis/:p`<br>GET `/admin/emojis`<br>GET `/emojis/custom`<br>PATCH `/admin/emojis/:p`<br>POST `/admin/emojis` | `[locale]/admin/emojis/page.tsx` |
| Administration | `/admin/events` | yes | ADMIN | — | DELETE `/admin/events/:p`<br>GET `/admin/events`<br>PATCH `/admin/events/:p`<br>POST `/admin/events` | `[locale]/admin/events/page.tsx` |
| Administration | `/admin/exports/scheduled` | yes | ADMIN | — | DELETE `/admin/exports/scheduled/:p`<br>GET `/admin/exports/scheduled`<br>PATCH `/admin/exports/scheduled/:p`<br>POST `/admin/exports/scheduled` | `[locale]/admin/exports/scheduled/page.tsx` |
| Administration | `/admin/forms` | yes | ADMIN | — | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/admin/forms/page.tsx` |
| Administration | `/admin/forms/[id]/edit` | yes | ADMIN | id | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/admin/forms/[id]/edit/page.tsx` |
| Administration | `/admin/forms/[id]/responses` | yes | ADMIN | id | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/admin/forms/[id]/responses/page.tsx` |
| Administration | `/admin/forms/[id]/responses/[responseId]` | yes | ADMIN | id, responseId | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/admin/forms/[id]/responses/[responseId]/page.tsx` |
| Administration | `/admin/forms/[id]/stats` | yes | ADMIN | id | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/admin/forms/[id]/stats/page.tsx` |
| Administration | `/admin/forms/new` | yes | ADMIN | — | — | `[locale]/admin/forms/new/page.tsx` |
| Administration | `/admin/media-requests` | server | ADMIN | — | — | `[locale]/admin/media-requests/page.tsx` |
| Administration | `/admin/news` | yes | ADMIN | — | DELETE `/admin/news/:p`<br>DELETE `/news/:p/comments/:p`<br>GET `/admin/news`<br>GET `/admin/news/:p`<br>GET `/admin/news/stats`<br>GET `/news`<br>GET `/news/:p`<br>GET `/news/:p/comments` | `[locale]/admin/news/page.tsx` |
| Administration | `/admin/news/[id]/edit` | yes | ADMIN | id | DELETE `/admin/news/:p`<br>DELETE `/news/:p/comments/:p`<br>GET `/admin/news`<br>GET `/admin/news/:p`<br>GET `/admin/news/stats`<br>GET `/news`<br>GET `/news/:p`<br>GET `/news/:p/comments` | `[locale]/admin/news/[id]/edit/page.tsx` |
| Administration | `/admin/news/new` | yes | ADMIN | — | — | `[locale]/admin/news/new/page.tsx` |
| Administration | `/admin/news/stats` | yes | ADMIN | — | DELETE `/admin/news/:p`<br>DELETE `/news/:p/comments/:p`<br>GET `/admin/news`<br>GET `/admin/news/:p`<br>GET `/admin/news/stats`<br>GET `/news`<br>GET `/news/:p`<br>GET `/news/:p/comments` | `[locale]/admin/news/stats/page.tsx` |
| Administration | `/admin/notifications/broadcast` | yes | ADMIN | — | POST `/admin/notifications/broadcast` | `[locale]/admin/notifications/broadcast/page.tsx` |
| Administration | `/admin/notifications/stats` | yes | ADMIN | — | GET `/admin/notifications/stats` | `[locale]/admin/notifications/stats/page.tsx` |
| Administration | `/admin/notifications/webhooks` | yes | ADMIN | — | DELETE `/admin/notifications/webhooks/:p`<br>GET `/admin/notifications/webhooks`<br>PATCH `/admin/notifications/webhooks/:p`<br>POST `/admin/notifications/webhooks` | `[locale]/admin/notifications/webhooks/page.tsx` |
| Administration | `/admin/orders` | yes | ADMIN | — | GET `/admin/orders`<br>PATCH `/admin/orders/:p/cancel`<br>PATCH `/admin/orders/:p/refund` | `[locale]/admin/orders/page.tsx` |
| Administration | `/admin/orders/stats` | server | ADMIN | — | — | `[locale]/admin/orders/stats/page.tsx` |
| Administration | `/admin/positions` | yes | ADMIN | — | DELETE `/positions/:p`<br>GET `/positions/manage` | `[locale]/admin/positions/page.tsx` |
| Administration | `/admin/profile-reports` | server | ADMIN | — | — | `[locale]/admin/profile-reports/page.tsx` |
| Administration | `/admin/promocodes` | yes | ADMIN | — | DELETE `/admin/promocodes/:p`<br>GET `/admin/promocodes`<br>PATCH `/admin/promocodes/:p`<br>POST `/admin/promocodes` | `[locale]/admin/promocodes/page.tsx` |
| Administration | `/admin/reports/archived` | yes | ADMIN | — | DELETE `/admin/reports/:p`<br>DELETE `/admin/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/notes/:p`<br>GET `/admin/reports/archived`<br>GET `/admin/reports/stats`<br>GET `/admin/support/donations`<br>GET `/moderation/reports` | `[locale]/admin/reports/archived/page.tsx` |
| Administration | `/admin/servers` | yes | ADMIN | — | DELETE `/admin/servers/:p`<br>GET `/admin/servers`<br>GET `/admin/servers/:p/logs`<br>GET `/server-categories`<br>GET `/servers`<br>GET `/servers/:p`<br>GET `/servers/:p/history`<br>GET `/servers/:p/players` | `[locale]/admin/servers/page.tsx` |
| Administration | `/admin/servers/[id]/logs` | yes | ADMIN | id | DELETE `/admin/servers/:p`<br>GET `/admin/servers`<br>GET `/admin/servers/:p/logs`<br>GET `/server-categories`<br>GET `/servers`<br>GET `/servers/:p`<br>GET `/servers/:p/history`<br>GET `/servers/:p/players` | `[locale]/admin/servers/[id]/logs/page.tsx` |
| Administration | `/admin/settings` | server | ADMIN | — | — | `[locale]/admin/settings/page.tsx` |
| Administration | `/admin/settings/announcements` | yes | ADMIN | — | DELETE `/admin/announcements/:p`<br>GET `/admin/announcements`<br>POST `/admin/announcements` | `[locale]/admin/settings/announcements/page.tsx` |
| Administration | `/admin/settings/maintenance` | yes | ADMIN | — | GET `/admin/maintenance/status`<br>POST `/admin/maintenance/disable`<br>POST `/admin/maintenance/enable` | `[locale]/admin/settings/maintenance/page.tsx` |
| Administration | `/admin/settings/modules` | yes | ADMIN | — | GET `/system/modules`<br>PATCH `/admin/modules/:p` | `[locale]/admin/settings/modules/page.tsx` |
| Administration | `/admin/settings/site` | yes | ADMIN | — | GET `/admin/settings/site`<br>PATCH `/admin/settings/site`<br>POST `/admin/security/ip-whitelist` | `[locale]/admin/settings/site/page.tsx` |
| Administration | `/admin/store/bulk-discounts` | yes | ADMIN | — | DELETE `/admin/store/discounts/bulk/:p`<br>GET `/store/discounts/bulk`<br>POST `/admin/store/discounts/bulk` | `[locale]/admin/store/bulk-discounts/page.tsx` |
| Administration | `/admin/store/bundles` | yes | ADMIN | — | DELETE `/admin/store/bundles/:p`<br>GET `/store/bundles`<br>PATCH `/admin/store/bundles/:p` | `[locale]/admin/store/bundles/page.tsx` |
| Administration | `/admin/store/categories` | yes | ADMIN | — | DELETE `/admin/store/categories/:p`<br>GET `/admin/store/categories`<br>POST `/admin/store/categories` | `[locale]/admin/store/categories/page.tsx` |
| Administration | `/admin/store/currencies` | server | ADMIN | — | — | `[locale]/admin/store/currencies/page.tsx` |
| Administration | `/admin/store/loyalty` | server | ADMIN | — | — | `[locale]/admin/store/loyalty/page.tsx` |
| Administration | `/admin/store/products` | yes | ADMIN | — | DELETE `/admin/store/products/:p`<br>GET `/store/products`<br>PATCH `/admin/store/products/:p` | `[locale]/admin/store/products/page.tsx` |
| Administration | `/admin/store/stats` | server | ADMIN | — | — | `[locale]/admin/store/stats/page.tsx` |
| Administration | `/admin/streams` | yes | ADMIN | — | DELETE `/admin/streams/:p`<br>GET `/admin/streams`<br>PATCH `/admin/streams/:p`<br>POST `/admin/streams`<br>POST `/admin/streams/refresh` | `[locale]/admin/streams/page.tsx` |
| Administration | `/admin/support/donations` | yes | ADMIN, OWNER | — | DELETE `/admin/reports/:p`<br>DELETE `/admin/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/notes/:p`<br>GET `/admin/reports/archived`<br>GET `/admin/reports/stats`<br>GET `/admin/support/donations`<br>GET `/moderation/reports` | `[locale]/admin/support/donations/page.tsx` |
| Administration | `/admin/topics` | yes | ADMIN | — | DELETE `/admin/topics/:p`<br>DELETE `/admin/topics/:p/attachments/:p`<br>GET `/admin/topics`<br>GET `/admin/topics/:p`<br>GET `/topics`<br>GET `/topics/:p`<br>PATCH `/admin/topics/:p`<br>POST `/admin/topics` | `[locale]/admin/topics/page.tsx` |
| Administration | `/admin/topics-internal` | yes | ADMIN | — | DELETE `/admin/topics/:p`<br>DELETE `/admin/topics/:p/attachments/:p`<br>GET `/admin/topics`<br>GET `/admin/topics/:p`<br>GET `/topics`<br>GET `/topics/:p`<br>PATCH `/admin/topics/:p`<br>POST `/admin/topics` | `[locale]/admin/topics-internal/page.tsx` |
| Administration | `/admin/topics/[id]/edit` | yes | ADMIN | id | DELETE `/admin/topics/:p`<br>DELETE `/admin/topics/:p/attachments/:p`<br>GET `/admin/topics`<br>GET `/admin/topics/:p`<br>GET `/topics`<br>GET `/topics/:p`<br>PATCH `/admin/topics/:p`<br>POST `/admin/topics` | `[locale]/admin/topics/[id]/edit/page.tsx` |
| Administration | `/admin/topics/new` | yes | ADMIN | — | — | `[locale]/admin/topics/new/page.tsx` |
| Administration | `/admin/users` | yes | ADMIN | — | DELETE `/admin/saved-filters/:p`<br>GET `/admin/saved-filters`<br>GET `/admin/users`<br>GET `/admin/users/:p/full`<br>PATCH `/admin/users/bulk`<br>POST `/admin/saved-filters`<br>POST `/admin/users/export` | `[locale]/admin/users/page.tsx` |
| Administration | `/admin/users/[id]` | yes | ADMIN | id | GET `/admin/users`<br>GET `/admin/users/:p/full`<br>PATCH `/admin/users/bulk`<br>POST `/admin/users/export` | `[locale]/admin/users/[id]/page.tsx` |
| Administration | `/admin/voting` | yes | ADMIN | — | DELETE `/admin/voting/sites/:p`<br>GET `/admin/voting/sites`<br>PATCH `/admin/voting/sites/:p`<br>POST `/admin/voting/sites`<br>POST `/admin/voting/sites/:p/rotate-secret` | `[locale]/admin/voting/page.tsx` |
| Administration (Owner dashboard) | `/dashboard` | yes | OWNER | — | DELETE `/admin/bookmarks/:p`<br>GET `/admin/bookmarks`<br>GET `/admin/dashboard/charts/reports`<br>GET `/admin/dashboard/charts/revenue`<br>GET `/admin/dashboard/charts/servers`<br>GET `/admin/dashboard/charts/users`<br>GET `/admin/dashboard/moderator-activity`<br>GET `/admin/dashboard/overview` | `[locale]/dashboard/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/announcements` | yes | OWNER | — | DELETE `/admin/announcements/:p`<br>GET `/admin/announcements`<br>POST `/admin/announcements` | `[locale]/dashboard/announcements/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/audit-log` | server | OWNER | — | — | `[locale]/dashboard/audit-log/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/orders/stats` | yes | OWNER | — | GET `/admin/orders/stats` | `[locale]/dashboard/orders/stats/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/settings` | yes | OWNER | — | — | `[locale]/dashboard/settings/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/store/currencies` | yes | OWNER | — | GET `/admin/store/currencies`<br>PATCH `/admin/store/currencies/:p`<br>POST `/admin/store/currencies` | `[locale]/dashboard/store/currencies/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/store/loyalty` | yes | OWNER | — | DELETE `/admin/store/discounts/loyalty/:p`<br>GET `/store/discounts/loyalty`<br>POST `/admin/store/discounts/loyalty` | `[locale]/dashboard/store/loyalty/page.tsx` |
| Administration (Owner dashboard) | `/dashboard/store/stats` | yes | OWNER | — | GET `/admin/store/stats`<br>GET `/store/currencies`<br>GET `/store/currency-rates`<br>GET `/store/products/:p/bought-together`<br>GET `/store/recent-purchases`<br>POST `/store/exchange`<br>POST `/store/quick-buy` | `[locale]/dashboard/store/stats/page.tsx` |
| Authentication | `/forgot-password` | yes | — | — | POST `/auth/forgot-password` | `[locale]/(auth)/forgot-password/page.tsx` |
| Authentication | `/login` | yes | — | — | — | `[locale]/(auth)/login/page.tsx` |
| Authentication | `/register` | yes | — | — | — | `[locale]/(auth)/register/page.tsx` |
| Authentication | `/reset-password` | yes | — | — | POST `/auth/reset-password` | `[locale]/(auth)/reset-password/page.tsx` |
| Events/Content | `/events` | yes | — | — | DELETE `/events/:p/attendance`<br>GET `/events`<br>GET `/events/:p`<br>POST `/events/:p/attendance` | `[locale]/events/page.tsx` |
| Events/Content | `/events/[slug]` | yes | — | slug | DELETE `/events/:p/attendance`<br>GET `/events`<br>GET `/events/:p`<br>POST `/events/:p/attendance` | `[locale]/events/[slug]/page.tsx` |
| Events/Content | `/streams` | yes | — | — | GET `/streams` | `[locale]/streams/page.tsx` |
| Forms | `/forms` | yes | — | — | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/forms/page.tsx` |
| Forms | `/forms/[slug]` | yes | — | slug | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/forms/[slug]/page.tsx` |
| Forms | `/forms/invite/[code]` | yes | — | code | DELETE `/admin/forms/:p`<br>DELETE `/admin/forms/:p/invites/:p`<br>DELETE `/admin/forms/:p/responses/:p`<br>GET `/admin/forms`<br>GET `/admin/forms/:p`<br>GET `/admin/forms/:p/invites`<br>GET `/admin/forms/:p/responses`<br>GET `/admin/forms/:p/responses/:p` | `[locale]/forms/invite/[code]/page.tsx` |
| Moderation | `/moderation` | server | HELPER | — | — | `[locale]/moderation/page.tsx` |
| Moderation | `/moderation/chat/bans` | yes | HELPER | — | DELETE `/admin/chat/bans/:p`<br>GET `/admin/chat/bans` | `[locale]/moderation/chat/bans/page.tsx` |
| Moderation | `/moderation/chat/channels` | yes | HELPER | — | GET `/chat/channels` | `[locale]/moderation/chat/channels/page.tsx` |
| Moderation | `/moderation/chat/mutes` | yes | HELPER | — | DELETE `/admin/chat/mutes/:p`<br>GET `/admin/chat/mutes` | `[locale]/moderation/chat/mutes/page.tsx` |
| Moderation | `/moderation/chat/search` | yes | HELPER | — | GET `/admin/chat/messages/search` | `[locale]/moderation/chat/search/page.tsx` |
| Moderation | `/moderation/chat/settings` | yes | HELPER | — | GET `/admin/chat/settings`<br>PATCH `/admin/chat/settings` | `[locale]/moderation/chat/settings/page.tsx` |
| Moderation | `/moderation/comment-reports` | yes | HELPER | — | PATCH `/admin/comment-reports/:p` | `[locale]/moderation/comment-reports/page.tsx` |
| Moderation | `/moderation/media-requests` | yes | HELPER | — | GET `/admin/media-requests`<br>PATCH `/admin/media-requests/:p` | `[locale]/moderation/media-requests/page.tsx` |
| Moderation | `/moderation/news-comments` | yes | HELPER | — | DELETE `/moderation/news/comments/:p`<br>PATCH `/moderation/news/comments/:p/${pinned ? ` | `[locale]/moderation/news-comments/page.tsx` |
| Moderation | `/moderation/profile-reports` | yes | HELPER | — | GET `/admin/profile-reports`<br>PATCH `/admin/profile-reports/:p` | `[locale]/moderation/profile-reports/page.tsx` |
| Moderation | `/moderation/reports` | yes | HELPER | — | DELETE `/admin/reports/:p`<br>DELETE `/admin/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/notes/:p`<br>GET `/admin/reports/archived`<br>GET `/admin/reports/stats`<br>GET `/admin/support/donations`<br>GET `/moderation/reports` | `[locale]/moderation/reports/page.tsx` |
| Moderation | `/moderation/reports/[reportNumber]` | server | HELPER | reportNumber | — | `[locale]/moderation/reports/[reportNumber]/page.tsx` |
| Moderation | `/moderation/tickets` | server | HELPER | — | — | `[locale]/moderation/tickets/page.tsx` |
| News | `/news` | yes | — | — | DELETE `/admin/news/:p`<br>DELETE `/news/:p/comments/:p`<br>GET `/admin/news`<br>GET `/admin/news/:p`<br>GET `/admin/news/stats`<br>GET `/news`<br>GET `/news/:p`<br>GET `/news/:p/comments` | `[locale]/news/page.tsx` |
| News | `/news/[slug]` | server | — | slug | — | `[locale]/news/[slug]/page.tsx` |
| Public/Other | `/` | yes | — | — | DELETE `/admin/news/:p`<br>DELETE `/admin/servers/:p`<br>DELETE `/news/:p/comments/:p`<br>GET `/admin/news`<br>GET `/admin/news/:p`<br>GET `/admin/news/stats`<br>GET `/admin/servers`<br>GET `/admin/servers/:p/logs` | `[locale]/page.tsx` |
| Public/Other | `/achievements` | yes | — | — | DELETE `/users/me/achievements/showcase/:p`<br>GET `/achievements`<br>GET `/achievements/:p`<br>GET `/achievements/stats`<br>GET `/users/:p/achievements`<br>GET `/users/me/achievements`<br>POST `/users/me/achievements/showcase` | `[locale]/achievements/page.tsx` |
| Public/Other | `/achievements/[slug]` | yes | — | slug | DELETE `/users/me/achievements/showcase/:p`<br>GET `/achievements`<br>GET `/achievements/:p`<br>GET `/achievements/stats`<br>GET `/users/:p/achievements`<br>GET `/users/me/achievements`<br>POST `/users/me/achievements/showcase` | `[locale]/achievements/[slug]/page.tsx` |
| Public/Other | `/documents` | yes | — | — | — | `[locale]/documents/page.tsx` |
| Public/Other | `/documents/[slug]` | yes | — | slug | DELETE `/admin/topics/:p`<br>DELETE `/admin/topics/:p/attachments/:p`<br>GET `/admin/topics`<br>GET `/admin/topics/:p`<br>GET `/topics`<br>GET `/topics/:p`<br>PATCH `/admin/topics/:p`<br>POST `/admin/topics` | `[locale]/documents/[slug]/page.tsx` |
| Public/Other | `/feed` | yes | — | — | — | `[locale]/feed/page.tsx` |
| Public/Other | `/feed/[id]` | yes | — | id | DELETE `/activity/comments/:p`<br>DELETE `/moderation/activity/:p`<br>DELETE `/moderation/activity/:p/pin`<br>GET `/activity/:p`<br>GET `/activity/feed`<br>GET `/activity/feed/global-highlights`<br>GET `/activity/feed/user/:p`<br>GET `/activity/settings` | `[locale]/feed/[id]/page.tsx` |
| Public/Other | `/g/[code]` | yes | — | code | DELETE `/messages/messages/:p`<br>GET `/messages/conversations`<br>GET `/messages/conversations/:p`<br>GET `/messages/conversations/:p/messages`<br>GET `/messages/invites/:p`<br>GET `/messages/privacy`<br>PATCH `/messages/messages/:p`<br>PATCH `/messages/privacy` | `[locale]/g/[code]/page.tsx` |
| Public/Other | `/maintenance` | yes | — | — | GET `/system/status` | `[locale]/maintenance/page.tsx` |
| Public/Other | `/report` | yes | — | — | DELETE `/admin/reports/:p`<br>DELETE `/admin/reports/:p/messages/:p`<br>DELETE `/admin/servers/:p`<br>DELETE `/moderation/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/notes/:p`<br>GET `/admin/reports/archived`<br>GET `/admin/reports/stats`<br>GET `/admin/servers` | `[locale]/report/page.tsx` |
| Public/Other | `/report/[reportNumber]` | yes | — | reportNumber | DELETE `/admin/reports/:p`<br>DELETE `/admin/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/messages/:p`<br>DELETE `/moderation/reports/:p/notes/:p`<br>GET `/admin/reports/archived`<br>GET `/admin/reports/stats`<br>GET `/admin/support/donations`<br>GET `/moderation/reports` | `[locale]/report/[reportNumber]/page.tsx` |
| Public/Other | `/report/new` | yes | — | — | — | `[locale]/report/new/page.tsx` |
| Public/Other | `/report/new/admin` | yes | — | — | — | `[locale]/report/new/admin/page.tsx` |
| Public/Other | `/report/new/appeal` | yes | — | — | — | `[locale]/report/new/appeal/page.tsx` |
| Public/Other | `/report/new/other` | yes | — | — | — | `[locale]/report/new/other/page.tsx` |
| Public/Other | `/report/new/player` | yes | — | — | — | `[locale]/report/new/player/page.tsx` |
| Public/Other | `/report/new/technical` | yes | — | — | — | `[locale]/report/new/technical/page.tsx` |
| Public/Other | `/rules` | yes | — | — | — | `[locale]/rules/page.tsx` |
| Public/Other | `/rules/[slug]` | yes | — | slug | DELETE `/admin/topics/:p`<br>DELETE `/admin/topics/:p/attachments/:p`<br>GET `/admin/topics`<br>GET `/admin/topics/:p`<br>GET `/topics`<br>GET `/topics/:p`<br>PATCH `/admin/topics/:p`<br>POST `/admin/topics` | `[locale]/rules/[slug]/page.tsx` |
| Public/Other | `/servers` | yes | — | — | DELETE `/admin/servers/:p`<br>GET `/admin/servers`<br>GET `/admin/servers/:p/logs`<br>GET `/server-categories`<br>GET `/servers`<br>GET `/servers/:p`<br>GET `/servers/:p/history`<br>GET `/servers/:p/players` | `[locale]/servers/page.tsx` |
| Public/Other | `/servers/[slug]` | yes | — | slug | DELETE `/admin/servers/:p`<br>GET `/admin/servers`<br>GET `/admin/servers/:p/logs`<br>GET `/server-categories`<br>GET `/servers`<br>GET `/servers/:p`<br>GET `/servers/:p/history`<br>GET `/servers/:p/players` | `[locale]/servers/[slug]/page.tsx` |
| Public/Other | `/support` | yes | — | — | — | `[locale]/support/page.tsx` |
| Public/Other | `/support/faq` — **STUB (TODO: implement FAQ)** | server | — | — | — | `[locale]/support/faq/page.tsx` |
| Public/Other | `/users/[username]` | server | — | username | — | `[locale]/users/[username]/page.tsx` |
| Public/Other | `/vote` | yes | — | — | GET `/voting` | `[locale]/vote/page.tsx` |
| Public/Other | `/wiki` — **STUB (TODO: implement wiki module)** | server | — | — | — | `[locale]/wiki/page.tsx` |
| Reports | `/reports` — **STUB (TODO: in-game reports module)** | server | — | — | — | `[locale]/reports/page.tsx` |
| Social | `/leaderboards` | yes | — | — | GET `/leaderboards` | `[locale]/leaderboards/page.tsx` |
| Store | `/store` | yes | — | — | GET `/system/status` | `[locale]/store/page.tsx` |
| Store | `/store/bundle/[slug]` | yes | — | slug | DELETE `/store/cart`<br>DELETE `/store/cart/items/:p`<br>DELETE `/store/cart/promo`<br>GET `/store/bundles`<br>GET `/store/bundles/:p`<br>GET `/store/cart`<br>PATCH `/store/cart/items/:p`<br>POST `/store/cart/apply-promo` | `[locale]/store/bundle/[slug]/page.tsx` |
| Store | `/store/cart` | yes | — | — | DELETE `/store/cart`<br>DELETE `/store/cart/items/:p`<br>DELETE `/store/cart/promo`<br>GET `/store/cart`<br>PATCH `/store/cart/items/:p`<br>POST `/store/cart/apply-promo`<br>POST `/store/cart/calculate`<br>POST `/store/cart/items` | `[locale]/store/cart/page.tsx` |
| Store | `/store/checkout` | yes | — | — | DELETE `/store/cart`<br>DELETE `/store/cart/items/:p`<br>DELETE `/store/cart/promo`<br>GET `/store/cart`<br>GET `/store/orders`<br>GET `/store/orders/:p`<br>PATCH `/store/cart/items/:p`<br>POST `/store/cart/apply-promo` | `[locale]/store/checkout/page.tsx` |
| Store | `/store/currency` | yes | — | — | — | `[locale]/store/currency/page.tsx` |
| Store | `/store/mock-payment` — **PARTIAL (mock payment)** | yes | — | — | GET `/store/orders`<br>GET `/store/orders/:p`<br>POST `/store/orders`<br>POST `/store/orders/:p/mock-complete` | `[locale]/store/mock-payment/page.tsx` |
| Store | `/store/product/[slug]` | yes | — | slug | DELETE `/store/cart`<br>DELETE `/store/cart/items/:p`<br>DELETE `/store/cart/promo`<br>GET `/admin/store/stats`<br>GET `/store/cart`<br>GET `/store/currencies`<br>GET `/store/currency-rates`<br>GET `/store/products/:p` | `[locale]/store/product/[slug]/page.tsx` |
| Store | `/store/success` | yes | — | — | — | `[locale]/store/success/page.tsx` |
| User account | `/messages` | yes | — | — | — | `[locale]/messages/page.tsx` |
| User account | `/profile/friends` | yes | — | — | DELETE `/friends/:p`<br>DELETE `/friends/block/:p`<br>DELETE `/friends/requests/:p`<br>GET `/friends`<br>GET `/friends/blocked`<br>GET `/friends/requests/incoming`<br>GET `/friends/requests/incoming/count`<br>GET `/friends/requests/outgoing` | `[locale]/profile/friends/page.tsx` |
| User account | `/profile/notifications` | yes | — | — | DELETE `/notifications/:p`<br>GET `/notifications`<br>GET `/notifications/unread-count`<br>PATCH `/notifications/:p/read`<br>PATCH `/notifications/read-all` | `[locale]/profile/notifications/page.tsx` |
| User account | `/profile/orders` | yes | — | — | GET `/store/orders`<br>GET `/store/orders/:p`<br>POST `/store/orders`<br>POST `/store/orders/:p/mock-complete` | `[locale]/profile/orders/page.tsx` |
| User account | `/profile/orders/[orderNumber]` | yes | — | orderNumber | GET `/store/orders`<br>GET `/store/orders/:p`<br>POST `/store/orders`<br>POST `/store/orders/:p/mock-complete` | `[locale]/profile/orders/[orderNumber]/page.tsx` |
| User account | `/profile/settings` | yes | — | — | DELETE `/auth/sessions`<br>DELETE `/auth/sessions/:p`<br>GET `/auth/sessions`<br>GET `/users/me/media-requests`<br>GET `/users/me/profile`<br>PATCH `/users/me/display-badge`<br>PATCH `/users/me/profile`<br>POST `/auth/change-password` | `[locale]/profile/settings/page.tsx` |
| User account | `/profile/wishlist` | yes | — | — | DELETE `/store/cart`<br>DELETE `/store/cart/items/:p`<br>DELETE `/store/cart/promo`<br>DELETE `/store/wishlist/items/:p`<br>GET `/store/cart`<br>GET `/store/wishlist`<br>PATCH `/store/cart/items/:p`<br>PATCH `/store/wishlist` | `[locale]/profile/wishlist/page.tsx` |

## Замечания
- Колонка API содержит вызовы, обнаруженные статически в странице и в импортированных из `src/hooks` хуках; вызовы из компонентов (`src/components/**`) в неё не попадают — уточняйте по `37-FRONTEND-API-MAP.md` (в работе).
- Страницы-заглушки: `/wiki`, `/support/faq`, `/reports` (TODO в исходнике). `/store/mock-payment` — часть мок-оплаты (см. 21-STORE.md, 29-SECURITY.md).
- Пустой guard у публичных страниц и страниц `/profile/*` означает: проверку делает `useAuth()`/middleware cookie, а не RoleGroup.

