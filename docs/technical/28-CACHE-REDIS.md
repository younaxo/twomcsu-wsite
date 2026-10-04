# 28 — Cache / Redis

Redis 7 (docker-compose: `--appendonly yes`, `requirepass`). Клиент — `ioredis` через `RedisService` (`apps/api/src/modules/redis`), кеш-обёртка `CacheService` (`modules/cache`). Конфиг: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.

## Где используется Redis
- **Кеш чтения** (`CacheService`): профили, позиции, статистика, друзья-счётчики, комментарии, уведомления-счётчик, поиск, эмодзи, серверы, магазин, чат.
- **Brute-force**: `bruteforce:login:{ip}`, `bruteforce:blocked:{ip}` (TTL 900 с).
- **Chat presence/typing**: `chat:online:{channelId}`, `chat:typing:{channelId}`.
- Rate limiting `@nestjs/throttler` использует **in-memory storage по умолчанию** (Redis storage в `app.module.ts` не подключён) → лимиты не разделяются между инстансами.
- Сессии хранятся в PostgreSQL (`RefreshToken`), не в Redis. Permissions в Redis **не кешируются** (их нет — роль приходит из JWT).

## TTL (секунды) — `modules/cache/cache.keys.ts`

| Const | TTL |
|---|---|
| `CACHE_TTL.USER_PROFILE` | 300 |
| `CACHE_TTL.POSITION` | 1800 |
| `CACHE_TTL.POSITIONS_LIST` | 3600 |
| `CACHE_TTL.PLAYER_STATS` | 60 |
| `CACHE_TTL.FRIENDS_COUNT` | 60 |
| `CACHE_TTL.INCOMING_REQUESTS_COUNT` | 30 |
| `CACHE_TTL.PROFILE_COMMENTS` | 30 |
| `CACHE_TTL.NOTIFICATIONS_UNREAD` | 30 |
| `CACHE_TTL.USER_SEARCH` | 30 |
| `CACHE_TTL.MENTION_SEARCH` | 30 |
| `CACHE_TTL.CUSTOM_EMOJIS` | 1800 |
| `CACHE_TTL.SERVER_STATUS` | 60 |
| `CACHE_TTL.SERVERS_LIST` | 30 |
| `CACHE_TTL.SERVER_CATEGORIES` | 300 |
| `CACHE_TTL.SERVERS_OVERVIEW` | 300 |
| `CACHE_TTL.STORE_CATEGORIES` | 120 |
| `CACHE_TTL.STORE_PRODUCTS` | 60 |
| `CACHE_TTL.STORE_BUNDLES` | 60 |
| `CACHE_TTL.STORE_DISCOUNTS` | 120 |
| `CACHE_TTL.STORE_RECENT_PURCHASES` | 60 |
| `CACHE_TTL.STORE_ADMIN_STATS` | 300 |
| `CACHE_TTL.CHAT_CHANNEL` | 1800 |
| `CACHE_TTL.CHAT_MESSAGES` | 600 |

## Ключи

| Builder | Ключ |
|---|---|
| `cacheKeys.userById` | `user:id:${id}` |
| `cacheKeys.userByUsername` | `user:username:${username.toLowerCase()}` |
| `cacheKeys.userProfile` | `user:profile:${username.toLowerCase()}` |
| `cacheKeys.positionsList` | `positions:list:${group ?? 'all'}:${includeHidden ? 'all' : 'visible'}` |
| `cacheKeys.positionBySlug` | `positions:slug:${slug}` |
| `cacheKeys.positionById` | `positions:id:${id}` |
| `cacheKeys.playerStats` | `stats:user:${userId}` |
| `cacheKeys.friendsCount` | `friends:count:${userId}` |
| `cacheKeys.incomingCount` | `friends:incoming-count:${userId}` |
| `cacheKeys.authMe` | `auth:me:${userId}` |
| `cacheKeys.userSearch` | `users:search:${query.trim().toLowerCase()}:${limit}` |
| `cacheKeys.mentionSearch` | `users:mentions:${query.trim().toLowerCase()}:${limit}` |
| `cacheKeys.customEmojisSearch` | `emojis:custom:search:${query.trim().toLowerCase()}` |
| `cacheKeys.notificationsUnread` | `notifications:unread:${userId}` |
| `cacheKeys.serverStatus` | `server:${serverId}:status` |
| `cacheKeys.profileComments` | `comments:${username.toLowerCase()}:${page}:${limit}:${sort}` |
| `cacheKeys.profileCommentsPattern` | `comments:${username.toLowerCase()}:*` |
| `cacheKeys.storeProductsList` | `store:products:list:${hash}` |
| `cacheKeys.storeProductBySlug` | `store:products:slug:${slug}` |
| `cacheKeys.storeBundleBySlug` | `store:bundles:slug:${slug}` |
| `cacheKeys.storeAdminStats` | `store:admin-stats:${key}` |
| `cacheKeys.chatChannel` | `chat:channel:${slug}` |
| `cacheKeys.chatMessagesRecent` | `chat:messages:${channelId}:recent` |
| `cacheKeys.chatOnline` | `chat:online:${channelId}` |
| `cacheKeys.chatTyping` | `chat:typing:${channelId}` |
| `cacheKeys.customEmojis` | `emojis:custom:list` |
| `cacheKeys.serversList` | `servers:list` |
| `cacheKeys.serverCategories` | `servers:categories` |
| `cacheKeys.serversOverview` | `servers:overview` |
| `cacheKeys.storeCategories` | `store:categories` |
| `cacheKeys.storeProductsListPattern` | `store:products:list:*` |
| `cacheKeys.storeBundlesList` | `store:bundles:list` |
| `cacheKeys.storeBulkDiscounts` | `store:discounts:bulk` |
| `cacheKeys.storeLoyaltyDiscounts` | `store:discounts:loyalty` |
| `cacheKeys.storeRecentPurchases` | `store:recent-purchases` |
| `cacheKeys.storeCurrencies` | `store:currencies` |
| `cacheKeys.storeCurrencyRates` | `store:currency-rates` |

## Инвалидация
Инвалидация реализована вручную в сервисах (`cache.del`, `cache.delPattern`), например `OrdersService.quickBuy` чистит `store:recent-purchases*`. Единого механизма/тегов нет → риск stale cache при пропущенной инвалидации в новом коде. Требования к инвалидации после profile/role/permission/news/store/server update — см. 44-TARGET-ARCHITECTURE.md.
Пример stale-окна по факту: `user:profile:{username}` живёт 300 с; `chat:messages:{channelId}:recent` — 600 с.

