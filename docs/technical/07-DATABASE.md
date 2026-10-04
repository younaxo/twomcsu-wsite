# 07 — База данных (Prisma / PostgreSQL)

Источник: `apps/api/prisma/schema.prisma` (2830 строк). Provider: `postgresql`, client: `prisma-client-js`. Моделей: **105**, enum: **51**. Миграций: **41** (`apps/api/prisma/migrations`).

## ID-стратегия
- Почти все модели: `id String @id @default(cuid())`.
- `User.shortId Int @unique @default(autoincrement())` — публичный числовой ID (`#1`, `#2`), внешние ключи ссылаются на `User.id` (cuid), **не** на `shortId`. Поэтому аккаунт `#0` реализуется явной записью `shortId = 0` без изменения FK (см. 12-USERS-PROFILES.md, 44-TARGET-ARCHITECTURE.md).
- `User.tag String @unique VarChar(32)` — публичный тег вида `name#4a2b`.

## Указатель моделей

| Model | Полей | Relations | Используется в модулях API (prisma.<model>.*) |
|---|---|---|---|
| [Position](#position) | 16 | 2 | moderation, positions, store |
| [User](#user) | 126 | 71 | achievements, activity, admin, auth, awards, chat, comments, common, custom-positions, decorations, departments, direct-messages, export, forms, friends, minecraft, moderation, news, notifications, positions, reports, statistics, store, users, voting |
| [RefreshToken](#refreshtoken) | 9 | 1 | admin, auth |
| [PasswordResetToken](#passwordresettoken) | 7 | 1 | auth |
| [PromoCode](#promocode) | 18 | 3 | auth, store |
| [PromoCodeUsage](#promocodeusage) | 6 | 2 | auth, store |
| [UserBadge](#userbadge) | 10 | 2 | achievements, positions, users |
| [SocialLink](#sociallink) | 7 | 1 | users |
| [UserMediaBadge](#usermediabadge) | 9 | 1 | users |
| [MediaBadgeRequest](#mediabadgerequest) | 12 | 1 | admin, users |
| [BannerPreset](#bannerpreset) | 6 | 0 | users |
| [ProfileView](#profileview) | 6 | 2 | achievements, users |
| [ProfileReaction](#profilereaction) | 8 | 2 | achievements, users |
| [ProfileReport](#profilereport) | 12 | 2 | admin, users |
| [PlayerStatistics](#playerstatistics) | 11 | 1 | achievements, leaderboards, users, voting |
| [Award](#award) | 10 | 1 | awards |
| [UserAward](#useraward) | 8 | 2 | awards, users |
| [Achievement](#achievement) | 21 | 1 | achievements |
| [UserAchievement](#userachievement) | 13 | 2 | achievements |
| [Friendship](#friendship) | 9 | 2 | achievements, admin, direct-messages, friends |
| [ProfileComment](#profilecomment) | 24 | 6 | achievements, activity, admin, comments, moderation, statistics |
| [CommentReaction](#commentreaction) | 6 | 1 | comments |
| [CommentReport](#commentreport) | 11 | 1 | admin, comments |
| [Category](#category) | 14 | 3 | store |
| [Product](#product) | 36 | 9 | statistics, store |
| [ProductVariant](#productvariant) | 12 | 3 | store |
| [Bundle](#bundle) | 16 | 3 | store |
| [BundleItem](#bundleitem) | 7 | 2 | store |
| [BulkDiscount](#bulkdiscount) | 10 | 1 | store |
| [Cart](#cart) | 7 | 3 | store |
| [CartItem](#cartitem) | 13 | 4 | store |
| [Wishlist](#wishlist) | 6 | 2 | store |
| [WishlistItem](#wishlistitem) | 6 | 2 | store |
| [Order](#order) | 20 | 3 | achievements, admin, export, statistics, store |
| [OrderItem](#orderitem) | 17 | 5 | achievements, statistics, store |
| [LoyaltyDiscount](#loyaltydiscount) | 6 | 0 | store |
| [Notification](#notification) | 24 | 2 | notifications |
| [NotificationSettings](#notificationsettings) | 15 | 1 | notifications |
| [CookieConsent](#cookieconsent) | 12 | 1 | consent |
| [PushSubscription](#pushsubscription) | 10 | 1 | notifications |
| [DiscordWebhook](#discordwebhook) | 8 | 0 | notifications |
| [CurrencyRate](#currencyrate) | 7 | 0 | store |
| [ServerCategory](#servercategory) | 11 | 1 | minecraft |
| [Server](#server) | 18 | 2 | minecraft, statistics |
| [ServerStatusLog](#serverstatuslog) | 11 | 1 | minecraft |
| [AuditLog](#auditlog) | 12 | 1 | admin, export, statistics |
| [Announcement](#announcement) | 14 | 0 | system |
| [MaintenanceMode](#maintenancemode) | 8 | 0 | system |
| [ModuleStatus](#modulestatus) | 7 | 0 | system |
| [SiteSetting](#sitesetting) | 3 | 0 | admin, chat |
| [SiteSettings](#sitesettings) | 31 | 0 | admin |
| [AdminBookmark](#adminbookmark) | 8 | 1 | admin |
| [SavedFilter](#savedfilter) | 9 | 1 | admin |
| [ScheduledExport](#scheduledexport) | 14 | 1 | admin |
| [ChatChannel](#chatchannel) | 15 | 2 | chat |
| [ChatMessage](#chatmessage) | 25 | 5 | chat, moderation, statistics |
| [ChatMessageReaction](#chatmessagereaction) | 6 | 1 | **нет прямых обращений в apps/api/src** |
| [Conversation](#conversation) | 13 | 4 | direct-messages |
| [ConversationMember](#conversationmember) | 12 | 2 | direct-messages |
| [DirectMessage](#directmessage) | 18 | 6 | direct-messages |
| [DirectMessageReaction](#directmessagereaction) | 7 | 2 | direct-messages |
| [MessageAttachment](#messageattachment) | 8 | 1 | **нет прямых обращений в apps/api/src** |
| [GroupInvite](#groupinvite) | 11 | 2 | direct-messages |
| [ChatMute](#chatmute) | 11 | 2 | chat, moderation |
| [ChatBan](#chatban) | 8 | 1 | chat |
| [CustomPosition](#customposition) | 11 | 1 | custom-positions |
| [UserCustomPosition](#usercustomposition) | 7 | 2 | custom-positions |
| [Department](#department) | 12 | 1 | departments |
| [UserDepartment](#userdepartment) | 8 | 2 | departments |
| [Topic](#topic) | 19 | 1 | admin, reports, topics |
| [TopicAttachment](#topicattachment) | 9 | 1 | topics |
| [Report](#report) | 39 | 8 | achievements, admin, export, reports, statistics |
| [ReportTarget](#reporttarget) | 8 | 2 | admin |
| [ReportEvidenceLink](#reportevidencelink) | 8 | 1 | **нет прямых обращений в apps/api/src** |
| [ReportMessage](#reportmessage) | 18 | 3 | reports |
| [ReportMessageAttachment](#reportmessageattachment) | 9 | 1 | reports |
| [ReportModeratorNote](#reportmoderatornote) | 10 | 2 | reports |
| [ReportAttachment](#reportattachment) | 9 | 1 | reports |
| [ReportBan](#reportban) | 8 | 1 | reports |
| [UserPunishment](#userpunishment) | 14 | 3 | admin, reports |
| [GameReport](#gamereport) | 12 | 0 | **нет прямых обращений в apps/api/src** |
| [GamePunishment](#gamepunishment) | 18 | 0 | **нет прямых обращений в apps/api/src** |
| [News](#news) | 29 | 5 | admin, export, news, statistics |
| [NewsTag](#newstag) | 4 | 1 | news |
| [NewsComment](#newscomment) | 19 | 5 | admin, news |
| [NewsCommentReaction](#newscommentreaction) | 7 | 2 | news |
| [NewsLike](#newslike) | 6 | 2 | news |
| [NewsView](#newsview) | 8 | 2 | news |
| [Activity](#activity) | 18 | 3 | activity |
| [ActivityReaction](#activityreaction) | 7 | 2 | activity |
| [ActivityComment](#activitycomment) | 12 | 2 | activity |
| [ActivityFeedSettings](#activityfeedsettings) | 21 | 1 | activity |
| [CustomEmoji](#customemoji) | 10 | 0 | emojis |
| [ProfileDecoration](#profiledecoration) | 12 | 3 | decorations, store |
| [UserDecoration](#userdecoration) | 10 | 3 | decorations, store |
| [CalendarEvent](#calendarevent) | 23 | 2 | events |
| [EventParticipant](#eventparticipant) | 9 | 2 | events |
| [Form](#form) | 31 | 4 | forms |
| [FormField](#formfield) | 25 | 2 | forms |
| [FormResponse](#formresponse) | 16 | 3 | forms |
| [FormFieldAnswer](#formfieldanswer) | 13 | 2 | forms |
| [FormInvite](#forminvite) | 9 | 1 | forms |
| [StreamChannel](#streamchannel) | 20 | 1 | streaming |
| [VoteSite](#votesite) | 14 | 1 | voting |
| [PlayerVote](#playervote) | 8 | 2 | voting |

## Enums

### RoleGroup
Значения: `PLAYER`, `HELPER`, `MODERATOR`, `ADMIN`, `OWNER`

### Gender
Значения: `MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY`

### ProfileVisibility
Значения: `EVERYONE`, `FRIENDS_ONLY`, `NOBODY`

### FriendRequestPolicy
Значения: `EVERYONE`, `FRIENDS_OF_FRIENDS`, `NOBODY`

### CommentPolicy
Значения: `EVERYONE`, `FRIENDS`, `FRIENDS_OF_FRIENDS`, `NOBODY`

### DirectMessagePolicy
Значения: `EVERYONE`, `FRIENDS_OF_FRIENDS`, `FRIENDS`, `NOBODY`

### CommentReportReason
Значения: `SPAM`, `INAPPROPRIATE`, `HARASSMENT`, `IMPERSONATION`, `OTHER`

### CommentReportStatus
Значения: `PENDING`, `RESOLVED`, `REJECTED`

### SocialPlatform
Значения: `DISCORD`, `TELEGRAM`, `VK`, `YOUTUBE`, `TWITCH`, `TIKTOK`, `STEAM`

### MediaGroup
Platforms a creator can be verified on, a subset of SocialPlatform
Значения: `YOUTUBE`, `TWITCH`, `TIKTOK`

### UserBadgeType
Значения: `LEADERSHIP`, `VERIFIED`, `SUBSCRIBER_PLUS`, `PROJECT_TEAM`, `DEVELOPERS_TEAM`

### MediaBadgeRequestStatus
Значения: `PENDING`, `APPROVED`, `REJECTED`

### ProfileReportReason
Значения: `SPAM`, `INAPPROPRIATE_CONTENT`, `HARASSMENT`, `IMPERSONATION`, `OTHER`

### ProfileReportStatus
Значения: `PENDING`, `RESOLVED`, `REJECTED`

### ReactionType
Значения: `LIKE`, `DISLIKE`

### DiscountType
Значения: `PERCENT`, `FIXED`, `BONUS`

### AchievementCategory
Значения: `GAME`, `SOCIAL`, `DONATION`, `SPECIAL`, `DAILY`, `SECRET`

### AchievementRarity
Значения: `COMMON`, `RARE`, `EPIC`, `LEGENDARY`, `MYTHIC`

### AchievementConditionType
Значения: `PLAYTIME_MINUTES`, `KILLS_COUNT`, `DEATHS_COUNT`, `FRIENDS_COUNT`, `COMMENTS_COUNT`, `LIKES_RECEIVED`, `PURCHASES_COUNT`, `TOTAL_SPENT`, `GIFTS_SENT`, `GIFTS_RECEIVED`, `DAYS_STREAK`, `ACCOUNT_AGE_DAYS`, `PROFILE_VIEWS`, `BADGES_COUNT`, `REGISTRATION_ORDER`, `BUG_REPORTED`, `REPORTS_RESOLVED`, `MANUAL`, `CUSTOM`

### FriendshipStatus
Значения: `PENDING`, `ACCEPTED`, `BLOCKED`, `REJECTED`

### ProductType
Значения: `PRIVILEGE`, `KEY`, `SUBSCRIPTION`, `BADGE`, `BATTLE_PASS`, `BATTLE_PASS_BOOSTER`, `UNMUTE`, `UNBAN`, `CURRENCY`, `DECORATION`, `BUNDLE`

### ProductDuration
Значения: `FOREVER`, `MONTHS_3`, `MONTH_1`, `WEEK_1`, `SEASON`, `ONE_TIME`

### CurrencyType
Значения: `RUBIES`, `COINS`

### OrderStatus
Значения: `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`, `REFUNDED`

### NotificationType
Значения: `COMMENT_ON_PROFILE`, `COMMENT_MENTION`, `COMMENT_REPLY`, `FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `GIFT_RECEIVED`, `ORDER_STATUS_CHANGED`, `CHAT_MENTION`, `NEWS_PUBLISHED`, `NEWS_COMMENT_REPLY`, `NEWS_COMMENT_MENTION`, `REPORT_MENTION`, `NEWS_LIKED`, `ANNOUNCEMENT`, `MAINTENANCE`, `ACHIEVEMENT_UNLOCKED`, `REPORT_ASSIGNED`, `REPORT_VERDICT`, `REPORT_TARGET`, `MESSAGE_RECEIVED`, `RANK_GRANTED`, `BADGE_GRANTED`, `AWARD_GRANTED`, `PAYMENT_RECEIVED`, `DAILY_REWARD_AVAILABLE`, `EVENT_REMINDER`, `EVENT_UPDATED`, `DECORATION_GRANTED`, `SYSTEM`

### NotificationPriority
Значения: `LOW`, `NORMAL`, `HIGH`, `URGENT`

### DigestMode
Значения: `INSTANT`, `HOURLY`, `DAILY`, `WEEKLY`

### ChatChannelType
Значения: `GENERAL`, `TRADE`, `HELP`, `ANNOUNCEMENTS`, `GAME`, `FLOOD`

### ChatMessageType
Значения: `MESSAGE`, `SYSTEM`, `ANNOUNCEMENT`, `MOD_ACTION`

### ChatMuteReason
Значения: `SPAM`, `TOXIC`, `ADVERTISING`, `CAPS`, `OTHER`

### ConversationType
Значения: `DIRECT`, `GROUP`

### ConversationRole
Значения: `OWNER`, `MODERATOR`, `MEMBER`

### ReportType
Значения: `PLAYER_COMPLAINT`, `ADMIN_COMPLAINT`, `PUNISHMENT_APPEAL`, `TECHNICAL_ISSUE`, `DONATION_PROBLEM`, `OTHER`

### ReportStatus
Значения: `PENDING`, `IN_REVIEW`, `WAITING_RESPONSE`, `RESOLVED`, `REJECTED`, `CLOSED`

### PunishmentType
Значения: `WARN`, `MUTE`, `KICK`, `TEMPBAN`, `PERMBAN`

### TopicCategory
Значения: `RULES`, `DOCUMENTS`, `INFORMATION`, `ADMIN_INTERNAL`, `FAQ`, `ANNOUNCEMENT`, `OTHER`

### TopicVisibility
Значения: `PUBLIC`, `AUTHENTICATED`, `HELPER_ONLY`, `MODERATOR_ONLY`, `ADMIN_ONLY`, `OWNER_ONLY`

### NewsCategory
Значения: `UPDATE`, `EVENT`, `GUIDE`, `ANNOUNCEMENT`, `PATCH_NOTES`, `COMMUNITY`, `OTHER`

### NewsStatus
Значения: `DRAFT`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`

### ActivityType
Значения: `PURCHASE_MADE`, `RANK_ACHIEVED`, `ACHIEVEMENT_UNLOCKED`, `BADGE_GRANTED`, `AWARD_GRANTED`, `GIFT_SENT`, `GIFT_RECEIVED`, `FRIENDSHIP_STARTED`, `PROFILE_UPDATED`, `NEWS_POSTED`, `EVENT_ANNOUNCED`, `MILESTONE_REACHED`, `JOINED_SERVER`, `TOP_ACHIEVED`, `MEDIA_APPROVED`, `DONATOR_UPGRADED`, `BIRTHDAY`, `CUSTOM`

### ActivityVisibility
Значения: `PUBLIC`, `FRIENDS`, `PRIVATE`

### DecorationAvailability
Значения: `STORE`, `ADMIN_ONLY`, `UNAVAILABLE`

### DecorationGrantSource
Значения: `PURCHASE`, `ADMIN`, `LEGACY`

### CalendarEventCategory
Значения: `COMMUNITY`, `TOURNAMENT`, `UPDATE`, `MAINTENANCE`, `HOLIDAY`, `OTHER`

### CalendarEventStatus
Значения: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`

### CalendarEventVisibility
Значения: `PUBLIC`, `AUTHENTICATED`, `STAFF`

### EventAttendanceStatus
Значения: `GOING`, `INTERESTED`, `DECLINED`

### FormFieldType
Значения: `TEXT`, `TEXTAREA`, `RADIO`, `CHECKBOX`, `SELECT`, `NUMBER`, `DATE`, `TIME`, `EMAIL`, `PHONE`, `URL`, `FILE_UPLOAD`, `RATING`, `COLOR_PICKER`, `CODE_EDITOR`, `MARKDOWN_EDITOR`, `IMAGE_GALLERY`, `VIDEO_URL`, `SCHEDULE_PICKER`, `AGREEMENT_CHECKLIST`, `PLAYER_SELECTOR`, `SERVER_SELECTOR`, `RANK_SELECTOR`, `FRIENDS_SELECTOR`, `PRODUCT_SELECTOR`, `ORDER_SELECTOR`, `REPORT_REFERENCE`, `NEWS_REFERENCE`, `TOPIC_REFERENCE`, `PUNISHMENT_REFERENCE`, `SIGNATURE`, `DATE_RANGE`, `CURRENCY_AMOUNT`, `STATS_DISPLAY`, `ACHIEVEMENT_SELECTOR`

### FormVisibility
Значения: `PUBLIC`, `AUTHENTICATED`, `HELPER_ONLY`, `MODERATOR_ONLY`, `ADMIN_ONLY`, `OWNER_ONLY`, `INVITE_ONLY`

### FormStatus
Значения: `DRAFT`, `PUBLISHED`, `CLOSED`, `ARCHIVED`

### StreamPlatform
Значения: `TWITCH`, `YOUTUBE`


## Модели

### Position

Purpose: Title inside a role group: purely cosmetic, permissions come from roleGroup

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `@unique` |  |
| `slug` | `String` | no | `@unique` |  |
| `displayName` | `String` | no | `` |  |
| `group` | `RoleGroup` | no | `` |  |
| `color` | `String` | no | `@db.VarChar(7)` |  |
| `backgroundColor` | `String` | yes | `@db.VarChar(9)` |  |
| `icon` | `String` | yes | `` |  |
| `priority` | `Int` | no | `@default(0)` |  |
| `description` | `String` | yes | `` |  |
| `isVisible` | `Boolean` | no | `@default(true)` |  |
| `isDefault` | `Boolean` | no | `@default(false)` | Given to new users of the group, one per group |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `users` ← many **User** (обратная сторона)
- `products` ← many **Product** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([group])`
- `@@index([priority])`
- `@@map("positions")`

Used by: moderation, positions, store

### User

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `shortId` | `Int` | no | `@unique @default(autoincrement())` | Public numeric id shown as #1, #2, ... |
| `tag` | `String` | no | `@unique @db.VarChar(32)` | Public tag like youn#4a2b |
| `email` | `String` | no | `@unique` |  |
| `username` | `String` | no | `@unique @db.VarChar(16)` |  |
| `password` | `String` | no | `` |  |
| `roleGroup` | `RoleGroup` | no | `@default(PLAYER)` |  |
| `positionId` | `String` | no | `` |  |
| `avatar` | `String` | yes | `` |  |
| `isVerified` | `Boolean` | no | `@default(false)` |  |
| `isBanned` | `Boolean` | no | `@default(false)` |  |
| `banReason` | `String` | yes | `` |  |
| `bannedUntil` | `DateTime` | yes | `` |  |
| `lastLoginAt` | `DateTime` | yes | `` |  |
| `lastLoginIp` | `String` | yes | `` |  |
| `lastActivityAt` | `DateTime` | yes | `` | Updated on authenticated API activity |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |
| `banner` | `String` | yes | `` | Uploaded image, wins over bannerPreset when both are set |
| `bannerPreset` | `String` | yes | `` |  |
| `statusText` | `String` | yes | `@db.VarChar(128)` |  |
| `bio` | `String` | yes | `@db.VarChar(500)` |  |
| `country` | `String` | yes | `` |  |
| `city` | `String` | yes | `@db.VarChar(100)` |  |
| `gender` | `Gender` | yes | `` |  |
| `birthDate` | `DateTime` | yes | `` |  |
| `showBirthDate` | `Boolean` | no | `@default(false)` |  |
| `profileVisibility` | `ProfileVisibility` | no | `@default(EVERYONE)` | Who can open the public profile page |
| `friendRequestPolicy` | `FriendRequestPolicy` | no | `@default(EVERYONE)` | Who is allowed to send friend requests |
| `directMessagePolicy` | `DirectMessagePolicy` | no | `@default(EVERYONE)` | Who is allowed to start a direct conversation |
| `hideEmail` | `Boolean` | no | `@default(true)` |  |
| `hideCountry` | `Boolean` | no | `@default(false)` |  |
| `hideCity` | `Boolean` | no | `@default(false)` |  |
| `hideBirthDate` | `Boolean` | no | `@default(true)` |  |
| `hideGender` | `Boolean` | no | `@default(false)` |  |
| `hideStatistics` | `Boolean` | no | `@default(false)` |  |
| `hideSocials` | `Boolean` | no | `@default(false)` |  |
| `commentPolicy` | `CommentPolicy` | no | `@default(EVERYONE)` | Who can leave comments on this profile |
| `commentsEnabled` | `Boolean` | no | `@default(true)` | Forced off by staff; owner cannot re-enable while false |
| `commentsForcedDisabledBy` | `String` | yes | `` |  |
| `commentsForcedReason` | `String` | yes | `` |  |
| `notifyOnComment` | `Boolean` | no | `@default(true)` |  |
| `notifyOnMention` | `Boolean` | no | `@default(true)` |  |
| `notifyOnReply` | `Boolean` | no | `@default(true)` |  |
| `notifyOnFriendRequest` | `Boolean` | no | `@default(true)` |  |
| `notifyOnGift` | `Boolean` | no | `@default(true)` |  |
| `notifyOnOrder` | `Boolean` | no | `@default(true)` |  |
| `referralCode` | `String` | yes | `@unique` | Referral code shown to friends; generated on registration |
| `referredBy` | `String` | yes | `` | User id of whoever invited this account |
| `currentServer` | `String` | yes | `` | Slug of the game server where the player was last seen |
| `currentServerId` | `String` | yes | `` |  |
| `lastServerActivity` | `DateTime` | yes | `` |  |
| `isOnlineInGame` | `Boolean` | no | `@default(false)` |  |
| `displayBadgeId` | `String` | yes | `` | Badge shown next to the nickname in the header; null = auto (top badge) |
| `selectedDecorationId` | `String` | yes | `` |  |

Relations:
- `position` → **Position** (FK `positionId`, onDelete: default (Restrict/SetNull по nullable))
- `customPosition` ← one **UserCustomPosition** (обратная сторона)
- `departments` ← many **UserDepartment** (обратная сторона)
- `refreshTokens` ← many **RefreshToken** (обратная сторона)
- `passwordResetTokens` ← many **PasswordResetToken** (обратная сторона)
- `promoCodeUsages` ← many **PromoCodeUsage** (обратная сторона)
- `badges` ← many **UserBadge** (обратная сторона)
- `socialLinks` ← many **SocialLink** (обратная сторона)
- `mediaBadges` ← many **UserMediaBadge** (обратная сторона)
- `mediaBadgeRequests` ← many **MediaBadgeRequest** (обратная сторона)
- `statistics` ← one **PlayerStatistics** (обратная сторона)
- `awards` ← many **UserAward** (обратная сторона)
- `profileViews` ← many **ProfileView** (обратная сторона)
- `viewedProfiles` ← many **ProfileView** (обратная сторона)
- `profileReactions` ← many **ProfileReaction** (обратная сторона)
- `givenReactions` ← many **ProfileReaction** (обратная сторона)
- `profileReports` ← many **ProfileReport** (обратная сторона)
- `sentReports` ← many **ProfileReport** (обратная сторона)
- `sentFriendRequests` ← many **Friendship** (обратная сторона)
- `receivedFriendRequests` ← many **Friendship** (обратная сторона)
- `profileComments` ← many **ProfileComment** (обратная сторона)
- `authoredComments` ← many **ProfileComment** (обратная сторона)
- `notifications` ← many **Notification** (обратная сторона)
- `sentNotifications` ← many **Notification** (обратная сторона)
- `notificationSettings` ← one **NotificationSettings** (обратная сторона)
- `pushSubscriptions` ← many **PushSubscription** (обратная сторона)
- `auditLogs` ← many **AuditLog** (обратная сторона)
- `cookieConsents` ← many **CookieConsent** (обратная сторона)
- `displayBadge` → **UserBadge** (FK `displayBadgeId`, onDelete: SetNull)
- `cart` ← one **Cart** (обратная сторона)
- `wishlist` ← one **Wishlist** (обратная сторона)
- `orders` ← many **Order** (обратная сторона)
- `giftedItems` ← many **OrderItem** (обратная сторона)
- `authoredMessages` ← many **ChatMessage** (обратная сторона)
- `chatMutes` ← many **ChatMute** (обратная сторона)
- `chatBans` ← many **ChatBan** (обратная сторона)
- `conversationMemberships` ← many **ConversationMember** (обратная сторона)
- `createdConversations` ← many **Conversation** (обратная сторона)
- `sentDirectMessages` ← many **DirectMessage** (обратная сторона)
- `directMessageReactions` ← many **DirectMessageReaction** (обратная сторона)
- `createdGroupInvites` ← many **GroupInvite** (обратная сторона)
- `authoredReports` ← many **Report** (обратная сторона)
- `assignedReports` ← many **Report** (обратная сторона)
- `reportedIn` ← many **ReportTarget** (обратная сторона)
- `reportMessages` ← many **ReportMessage** (обратная сторона)
- `reportModeratorNotes` ← many **ReportModeratorNote** (обратная сторона)
- `reportBans` ← many **ReportBan** (обратная сторона)
- `punishments` ← many **UserPunishment** (обратная сторона)
- `issuedPunishments` ← many **UserPunishment** (обратная сторона)
- `authoredNews` ← many **News** (обратная сторона)
- `newsComments` ← many **NewsComment** (обратная сторона)
- `newsCommentReactions` ← many **NewsCommentReaction** (обратная сторона)
- `newsLikes` ← many **NewsLike** (обратная сторона)
- `newsViews` ← many **NewsView** (обратная сторона)
- `adminBookmarks` ← many **AdminBookmark** (обратная сторона)
- `savedFilters` ← many **SavedFilter** (обратная сторона)
- `scheduledExports` ← many **ScheduledExport** (обратная сторона)
- `activities` ← many **Activity** (обратная сторона)
- `activityReactions` ← many **ActivityReaction** (обратная сторона)
- `activityComments` ← many **ActivityComment** (обратная сторона)
- `activityFeedSettings` ← one **ActivityFeedSettings** (обратная сторона)
- `achievements` ← many **UserAchievement** (обратная сторона)
- `createdForms` ← many **Form** (обратная сторона)
- `formResponses` ← many **FormResponse** (обратная сторона)
- `selectedDecoration` → **ProfileDecoration** (FK `selectedDecorationId`, onDelete: SetNull)
- `ownedDecorations` ← many **UserDecoration** (обратная сторона)
- `grantedDecorations` ← many **UserDecoration** (обратная сторона)
- `createdCalendarEvents` ← many **CalendarEvent** (обратная сторона)
- `eventParticipations` ← many **EventParticipant** (обратная сторона)
- `streamChannels` ← many **StreamChannel** (обратная сторона)
- `playerVotes` ← many **PlayerVote** (обратная сторона)

Indexes / constraints:
- `@@index([email])`
- `@@index([username])`
- `@@index([tag])`
- `@@index([shortId])`
- `@@index([positionId])`
- `@@index([roleGroup, isBanned])`
- `@@index([lastLoginAt])`
- `@@index([lastActivityAt])`
- `@@index([currentServerId])`
- `@@index([isOnlineInGame])`
- `@@index([displayBadgeId])`
- `@@index([selectedDecorationId])`
- `@@map("users")`

Used by: achievements, activity, admin, auth, awards, chat, comments, common, custom-positions, decorations, departments, direct-messages, export, forms, friends, minecraft, moderation, news, notifications, positions, reports, statistics, store, users, voting

### RefreshToken

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `tokenHash` | `String` | no | `@unique` |  |
| `userId` | `String` | no | `` |  |
| `userAgent` | `String` | yes | `` |  |
| `ipAddress` | `String` | yes | `` |  |
| `expiresAt` | `DateTime` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `revokedAt` | `DateTime` | yes | `` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId])`
- `@@index([tokenHash])`
- `@@map("refresh_tokens")`

Used by: admin, auth

### PasswordResetToken

Purpose: Single use link from the "forgot password" flow, lives an hour

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `tokenHash` | `String` | no | `@unique` |  |
| `userId` | `String` | no | `` |  |
| `expiresAt` | `DateTime` | no | `` |  |
| `usedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId])`
- `@@index([tokenHash])`
- `@@map("password_reset_tokens")`

Used by: auth

### PromoCode

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `code` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `discountType` | `DiscountType` | no | `` |  |
| `discountValue` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `maxUses` | `Int` | yes | `` | null means unlimited |
| `usedCount` | `Int` | no | `@default(0)` |  |
| `validFrom` | `DateTime` | yes | `` |  |
| `validUntil` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `applicableToTypes` | `ProductType[]` | no | `` | Empty = applies to every product type |
| `minOrderAmount` | `Decimal` | yes | `@db.Decimal(10, 2)` |  |
| `firstPurchaseOnly` | `Boolean` | no | `@default(false)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `usages` ← many **PromoCodeUsage** (обратная сторона)
- `orders` ← many **Order** (обратная сторона)
- `carts` ← many **Cart** (обратная сторона)

Indexes / constraints:
- `@@index([code])`
- `@@index([isActive])`
- `@@map("promo_codes")`

Used by: auth, store

### PromoCodeUsage

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `promoCodeId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `usedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `promoCode` → **PromoCode** (FK `promoCodeId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([promoCodeId, userId])`
- `@@index([promoCodeId])`
- `@@index([userId])`
- `@@map("promo_code_usages")`

Used by: auth, store

### UserBadge

Purpose: Staff granted marks shown next to the nickname

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `type` | `UserBadgeType` | no | `` |  |
| `grantedBy` | `String` | yes | `` |  |
| `grantedAt` | `DateTime` | no | `@default(now())` |  |
| `expiresAt` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` | Manual display order on the profile (lower = first) |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `displayedBy` ← many **User** (обратная сторона)

Indexes / constraints:
- `@@unique([userId, type])`
- `@@index([userId])`
- `@@index([userId, order])`
- `@@map("user_badges")`

Used by: achievements, positions, users

### SocialLink

Purpose: One handle or url per platform, the platform decides how it is rendered

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `platform` | `SocialPlatform` | no | `` |  |
| `value` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([userId, platform])`
- `@@index([userId])`
- `@@map("social_links")`

Used by: users

### UserMediaBadge

Purpose: Creator badge, appears on the profile once the staff approves the channel

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `mediaGroup` | `MediaGroup` | no | `` |  |
| `channelUrl` | `String` | no | `` |  |
| `isApproved` | `Boolean` | no | `@default(false)` |  |
| `approvedBy` | `String` | yes | `` |  |
| `approvedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([userId, mediaGroup])`
- `@@index([userId])`
- `@@map("user_media_badges")`

Used by: users

### MediaBadgeRequest

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `mediaGroup` | `MediaGroup` | no | `` |  |
| `channelUrl` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `status` | `MediaBadgeRequestStatus` | no | `@default(PENDING)` |  |
| `reviewedBy` | `String` | yes | `` |  |
| `reviewedAt` | `DateTime` | yes | `` |  |
| `reviewNote` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId])`
- `@@index([status])`
- `@@map("media_badge_requests")`

Used by: admin, users

### BannerPreset

Purpose: Ready made banners a player can pick instead of uploading their own

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `imageUrl` | `String` | no | `` |  |
| `category` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Indexes / constraints:
- `@@map("banner_presets")`

Used by: users

### ProfileView

Purpose: One row per viewer, so the counter shows unique visitors instead of refreshes

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `profileId` | `String` | no | `` |  |
| `viewerId` | `String` | no | `` |  |
| `viewedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `profile` → **User** (FK `profileId`, onDelete: Cascade)
- `viewer` → **User** (FK `viewerId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([profileId, viewerId])`
- `@@index([profileId])`
- `@@index([profileId, viewedAt])`
- `@@map("profile_views")`

Used by: achievements, users

### ProfileReaction

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `profileId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `type` | `ReactionType` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `profile` → **User** (FK `profileId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([profileId, userId])`
- `@@index([profileId])`
- `@@map("profile_reactions")`

Used by: achievements, users

### ProfileReport

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `profileId` | `String` | no | `` |  |
| `reporterId` | `String` | no | `` |  |
| `reason` | `ProfileReportReason` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `status` | `ProfileReportStatus` | no | `@default(PENDING)` |  |
| `reviewedBy` | `String` | yes | `` |  |
| `reviewedAt` | `DateTime` | yes | `` |  |
| `reviewNote` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `profile` → **User** (FK `profileId`, onDelete: Cascade)
- `reporter` → **User** (FK `reporterId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([profileId, reporterId])`
- `@@index([profileId])`
- `@@index([status])`
- `@@map("profile_reports")`

Used by: admin, users

### PlayerStatistics

Purpose: Game side counters, the server pushes them here

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `coins` | `Int` | no | `@default(0)` |  |
| `playTime` | `Int` | no | `@default(0)` | Minutes spent in game |
| `kills` | `Int` | no | `@default(0)` |  |
| `deaths` | `Int` | no | `@default(0)` |  |
| `hits` | `Int` | no | `@default(0)` |  |
| `killDeathRatio` | `Float` | no | `@default(0)` |  |
| `lastServer` | `String` | yes | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@map("player_statistics")`

Used by: achievements, leaderboards, users, voting

### Award

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `iconUrl` | `String` | no | `` | External url or a path inside the web public folder |
| `color` | `String` | yes | `` |  |
| `rarity` | `String` | yes | `` | common, rare, epic or legendary, drives the border in the ui |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `userAwards` ← many **UserAward** (обратная сторона)

Indexes / constraints:
- `@@map("awards")`

Used by: awards

### UserAward

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `awardId` | `String` | no | `` |  |
| `grantedBy` | `String` | yes | `` |  |
| `grantedAt` | `DateTime` | no | `@default(now())` |  |
| `order` | `Int` | no | `@default(0)` | Manual display order on the profile (lower = first) |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `award` → **Award** (FK `awardId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([userId, awardId])`
- `@@index([userId])`
- `@@index([userId, order])`
- `@@map("user_awards")`

Used by: awards, users

### Achievement

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `name` | `String` | no | `` |  |
| `description` | `String` | no | `@db.Text` |  |
| `iconUrl` | `String` | no | `` |  |
| `category` | `AchievementCategory` | no | `` |  |
| `rarity` | `AchievementRarity` | no | `` |  |
| `isSecret` | `Boolean` | no | `@default(false)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `conditionType` | `AchievementConditionType` | no | `` |  |
| `conditionValue` | `Int` | yes | `` |  |
| `conditionParams` | `Json` | yes | `` |  |
| `rewardRubies` | `Int` | no | `@default(0)` |  |
| `rewardBadgeType` | `String` | yes | `` |  |
| `rewardTitle` | `String` | yes | `` |  |
| `rewardMessage` | `String` | yes | `` |  |
| `unlockedCount` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `userAchievements` ← many **UserAchievement** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([category, rarity])`
- `@@map("achievements")`

Used by: achievements

### UserAchievement

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `achievementId` | `String` | no | `` |  |
| `currentProgress` | `Int` | no | `@default(0)` |  |
| `isCompleted` | `Boolean` | no | `@default(false)` |  |
| `completedAt` | `DateTime` | yes | `` |  |
| `isShowcased` | `Boolean` | no | `@default(false)` |  |
| `showcaseOrder` | `Int` | no | `@default(0)` |  |
| `rewardsGranted` | `Boolean` | no | `@default(false)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `achievement` → **Achievement** (FK `achievementId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([userId, achievementId])`
- `@@index([userId, isCompleted])`
- `@@index([userId, isShowcased])`
- `@@map("user_achievements")`

Used by: achievements

### Friendship

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `requesterId` | `String` | no | `` |  |
| `addresseeId` | `String` | no | `` |  |
| `status` | `FriendshipStatus` | no | `@default(PENDING)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |
| `acceptedAt` | `DateTime` | yes | `` |  |

Relations:
- `requester` → **User** (FK `requesterId`, onDelete: Cascade)
- `addressee` → **User** (FK `addresseeId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([requesterId, addresseeId])`
- `@@index([requesterId])`
- `@@index([addresseeId])`
- `@@index([status])`
- `@@index([addresseeId, status])`
- `@@index([requesterId, status])`
- `@@map("friendships")`

Used by: achievements, admin, direct-messages, friends

### ProfileComment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `profileId` | `String` | no | `` |  |
| `authorId` | `String` | no | `` |  |
| `content` | `String` | no | `` |  |
| `contentHtml` | `String` | no | `` |  |
| `parentId` | `String` | yes | `` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `pinnedAt` | `DateTime` | yes | `` |  |
| `pinnedBy` | `String` | yes | `` |  |
| `isEdited` | `Boolean` | no | `@default(false)` |  |
| `editedAt` | `DateTime` | yes | `` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `deletedBy` | `String` | yes | `` |  |
| `deletedReason` | `String` | yes | `` |  |
| `mentions` | `String[]` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `profile` → **User** (FK `profileId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: Cascade)
- `parent` → **ProfileComment** (FK `parentId`, onDelete: Cascade)
- `replies` ← many **ProfileComment** (обратная сторона)
- `reactions` ← many **CommentReaction** (обратная сторона)
- `reports` ← many **CommentReport** (обратная сторона)

Indexes / constraints:
- `@@index([profileId, createdAt])`
- `@@index([authorId])`
- `@@index([parentId])`
- `@@index([isPinned])`
- `@@map("profile_comments")`

Used by: achievements, activity, admin, comments, moderation, statistics

### CommentReaction

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `commentId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `emoji` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `comment` → **ProfileComment** (FK `commentId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([commentId, userId])`
- `@@index([commentId])`
- `@@map("comment_reactions")`

Used by: comments

### CommentReport

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `commentId` | `String` | no | `` |  |
| `reporterId` | `String` | no | `` |  |
| `reason` | `CommentReportReason` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `status` | `CommentReportStatus` | no | `@default(PENDING)` |  |
| `reviewedBy` | `String` | yes | `` |  |
| `reviewedAt` | `DateTime` | yes | `` |  |
| `reviewNote` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `comment` → **ProfileComment** (FK `commentId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([commentId, reporterId])`
- `@@index([commentId])`
- `@@index([status])`
- `@@map("comment_reports")`

Used by: admin, comments

### Category

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `icon` | `String` | yes | `` |  |
| `image` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `parentId` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `parent` → **Category** (FK `parentId`, onDelete: default (Restrict/SetNull по nullable))
- `subcategories` ← many **Category** (обратная сторона)
- `products` ← many **Product** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([parentId])`
- `@@map("categories")`

Used by: store

### Product

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `fullDescription` | `String` | yes | `` |  |
| `type` | `ProductType` | no | `` |  |
| `image` | `String` | yes | `` |  |
| `images` | `String[]` | no | `` |  |
| `categoryId` | `String` | no | `` |  |
| `positionId` | `String` | yes | `` |  |
| `isGiftable` | `Boolean` | no | `@default(true)` |  |
| `isSelfOnly` | `Boolean` | no | `@default(false)` |  |
| `isUnique` | `Boolean` | no | `@default(false)` |  |
| `isSeasonalOnly` | `Boolean` | no | `@default(false)` |  |
| `maxPerPurchase` | `Int` | yes | `` |  |
| `currencyType` | `CurrencyType` | yes | `` |  |
| `currencyAmount` | `Int` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isFeatured` | `Boolean` | no | `@default(false)` |  |
| `isNew` | `Boolean` | no | `@default(false)` |  |
| `isPopular` | `Boolean` | no | `@default(false)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `gameCommands` | `String[]` | no | `` |  |
| `server` | `String` | yes | `` |  |
| `decorationId` | `String` | yes | `@unique` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `category` → **Category** (FK `categoryId`, onDelete: default (Restrict/SetNull по nullable))
- `position` → **Position** (FK `positionId`, onDelete: default (Restrict/SetNull по nullable))
- `decoration` → **ProfileDecoration** (FK `decorationId`, onDelete: SetNull)
- `variants` ← many **ProductVariant** (обратная сторона)
- `bundleItems` ← many **BundleItem** (обратная сторона)
- `wishlistItems` ← many **WishlistItem** (обратная сторона)
- `cartItems` ← many **CartItem** (обратная сторона)
- `orderItems` ← many **OrderItem** (обратная сторона)
- `bulkDiscounts` ← many **BulkDiscount** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([categoryId])`
- `@@index([type])`
- `@@index([isActive, isFeatured])`
- `@@map("products")`

Used by: statistics, store

### ProductVariant

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `productId` | `String` | no | `` |  |
| `duration` | `ProductDuration` | no | `` |  |
| `price` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `oldPrice` | `Decimal` | yes | `@db.Decimal(10, 2)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `product` → **Product** (FK `productId`, onDelete: Cascade)
- `cartItems` ← many **CartItem** (обратная сторона)
- `orderItems` ← many **OrderItem** (обратная сторона)

Indexes / constraints:
- `@@unique([productId, duration])`
- `@@index([productId])`
- `@@map("product_variants")`

Used by: store

### Bundle

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `image` | `String` | yes | `` |  |
| `totalPrice` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `originalPrice` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isFeatured` | `Boolean` | no | `@default(false)` |  |
| `validFrom` | `DateTime` | yes | `` |  |
| `validUntil` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `items` ← many **BundleItem** (обратная сторона)
- `cartItems` ← many **CartItem** (обратная сторона)
- `orderItems` ← many **OrderItem** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@map("bundles")`

Used by: store

### BundleItem

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `bundleId` | `String` | no | `` |  |
| `productId` | `String` | no | `` |  |
| `variantId` | `String` | yes | `` |  |
| `quantity` | `Int` | no | `@default(1)` |  |

Relations:
- `bundle` → **Bundle** (FK `bundleId`, onDelete: Cascade)
- `product` → **Product** (FK `productId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@unique([bundleId, productId, variantId])`
- `@@map("bundle_items")`

Used by: store

### BulkDiscount

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `productId` | `String` | yes | `` |  |
| `productType` | `ProductType` | yes | `` |  |
| `minQuantity` | `Int` | no | `@default(0)` |  |
| `minAmount` | `Decimal` | yes | `@db.Decimal(10, 2)` |  |
| `discountType` | `DiscountType` | no | `` |  |
| `discountValue` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `product` → **Product** (FK `productId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([productId])`
- `@@index([productType])`
- `@@map("bulk_discounts")`

Used by: store

### Cart

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `promoCodeId` | `String` | yes | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `promoCode` → **PromoCode** (FK `promoCodeId`, onDelete: default (Restrict/SetNull по nullable))
- `items` ← many **CartItem** (обратная сторона)

Indexes / constraints:
- `@@index([userId])`
- `@@map("carts")`

Used by: store

### CartItem

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `cartId` | `String` | no | `` |  |
| `productId` | `String` | yes | `` |  |
| `variantId` | `String` | yes | `` |  |
| `bundleId` | `String` | yes | `` |  |
| `quantity` | `Int` | no | `@default(1)` |  |
| `giftToUserId` | `String` | yes | `` |  |
| `giftMessage` | `String` | yes | `@db.VarChar(500)` |  |
| `addedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `cart` → **Cart** (FK `cartId`, onDelete: Cascade)
- `product` → **Product** (FK `productId`, onDelete: default (Restrict/SetNull по nullable))
- `variant` → **ProductVariant** (FK `variantId`, onDelete: default (Restrict/SetNull по nullable))
- `bundle` → **Bundle** (FK `bundleId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([cartId])`
- `@@map("cart_items")`

Used by: store

### Wishlist

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `isPublic` | `Boolean` | no | `@default(true)` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `items` ← many **WishlistItem** (обратная сторона)

Indexes / constraints:
- `@@index([userId])`
- `@@map("wishlists")`

Used by: store

### WishlistItem

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `wishlistId` | `String` | no | `` |  |
| `productId` | `String` | no | `` |  |
| `addedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `wishlist` → **Wishlist** (FK `wishlistId`, onDelete: Cascade)
- `product` → **Product** (FK `productId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@unique([wishlistId, productId])`
- `@@index([wishlistId])`
- `@@map("wishlist_items")`

Used by: store

### Order

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `orderNumber` | `String` | no | `@unique` |  |
| `userId` | `String` | yes | `` |  |
| `guestMinecraftNick` | `String` | yes | `@db.VarChar(16)` |  |
| `status` | `OrderStatus` | no | `@default(PENDING)` |  |
| `subtotal` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `discountAmount` | `Decimal` | no | `@default(0) @db.Decimal(10, 2)` |  |
| `promoCodeId` | `String` | yes | `` |  |
| `total` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `paymentMethod` | `String` | yes | `` |  |
| `paymentId` | `String` | yes | `` |  |
| `paidAt` | `DateTime` | yes | `` |  |
| `cancelledAt` | `DateTime` | yes | `` |  |
| `refundedAt` | `DateTime` | yes | `` |  |
| `cancelReason` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))
- `promoCode` → **PromoCode** (FK `promoCodeId`, onDelete: default (Restrict/SetNull по nullable))
- `items` ← many **OrderItem** (обратная сторона)

Indexes / constraints:
- `@@index([userId])`
- `@@index([status])`
- `@@index([orderNumber])`
- `@@map("orders")`

Used by: achievements, admin, export, statistics, store

### OrderItem

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `orderId` | `String` | no | `` |  |
| `productId` | `String` | yes | `` |  |
| `variantId` | `String` | yes | `` |  |
| `bundleId` | `String` | yes | `` |  |
| `quantity` | `Int` | no | `` |  |
| `unitPrice` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `totalPrice` | `Decimal` | no | `@db.Decimal(10, 2)` |  |
| `giftToUserId` | `String` | yes | `` |  |
| `giftMessage` | `String` | yes | `@db.VarChar(500)` |  |
| `isDelivered` | `Boolean` | no | `@default(false)` |  |
| `deliveredAt` | `DateTime` | yes | `` |  |

Relations:
- `order` → **Order** (FK `orderId`, onDelete: Cascade)
- `product` → **Product** (FK `productId`, onDelete: default (Restrict/SetNull по nullable))
- `variant` → **ProductVariant** (FK `variantId`, onDelete: default (Restrict/SetNull по nullable))
- `bundle` → **Bundle** (FK `bundleId`, onDelete: default (Restrict/SetNull по nullable))
- `giftToUser` → **User** (FK `giftToUserId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([orderId])`
- `@@map("order_items")`

Used by: achievements, statistics, store

### LoyaltyDiscount

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `minPurchases` | `Int` | no | `` |  |
| `discountPercent` | `Decimal` | no | `@db.Decimal(5, 2)` |  |
| `name` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |

Indexes / constraints:
- `@@index([minPurchases])`
- `@@map("loyalty_discounts")`

Used by: store

### Notification

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `type` | `NotificationType` | no | `` |  |
| `title` | `String` | no | `` |  |
| `message` | `String` | yes | `` |  |
| `link` | `String` | yes | `` |  |
| `imageUrl` | `String` | yes | `` |  |
| `fromUserId` | `String` | yes | `` |  |
| `metadata` | `Json` | yes | `` |  |
| `groupKey` | `String` | yes | `` |  |
| `priority` | `NotificationPriority` | no | `@default(NORMAL)` |  |
| `actionUrl` | `String` | yes | `` |  |
| `actionLabel` | `String` | yes | `` |  |
| `isRead` | `Boolean` | no | `@default(false)` |  |
| `readAt` | `DateTime` | yes | `` |  |
| `sentViaEmail` | `Boolean` | no | `@default(false)` |  |
| `sentViaEmailAt` | `DateTime` | yes | `` |  |
| `sentViaPush` | `Boolean` | no | `@default(false)` |  |
| `sentViaPushAt` | `DateTime` | yes | `` |  |
| `sentViaDiscord` | `Boolean` | no | `@default(false)` |  |
| `sentViaDiscordAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `fromUser` → **User** (FK `fromUserId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([userId, isRead])`
- `@@index([userId, createdAt])`
- `@@index([userId, isRead, createdAt])`
- `@@index([groupKey])`
- `@@map("notifications")`

Used by: notifications

### NotificationSettings

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `emailEnabled` | `Boolean` | no | `@default(true)` |  |
| `pushEnabled` | `Boolean` | no | `@default(true)` |  |
| `discordEnabled` | `Boolean` | no | `@default(false)` |  |
| `discordWebhookUrl` | `String` | yes | `@db.Text` |  |
| `soundEnabled` | `Boolean` | no | `@default(true)` |  |
| `digestMode` | `DigestMode` | no | `@default(INSTANT)` |  |
| `digestTime` | `String` | yes | `@default("09:00")` |  |
| `quietHoursEnabled` | `Boolean` | no | `@default(false)` |  |
| `quietHoursStart` | `String` | yes | `@default("22:00")` |  |
| `quietHoursEnd` | `String` | yes | `@default("08:00")` |  |
| `typeSettings` | `Json` | no | `@default("{}")` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@map("notification_settings")`

Used by: notifications

### CookieConsent

Purpose: Consent event log — one row per save, so history is auditable (not overwritten in place). `userId` is set once the visitor is signed in; `anonymousId` covers guests via a first-party cookie id. Latest row per user/anonymousId wins.

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | yes | `` |  |
| `anonymousId` | `String` | yes | `` |  |
| `necessary` | `Boolean` | no | `@default(true)` |  |
| `analytics` | `Boolean` | no | `@default(false)` |  |
| `marketing` | `Boolean` | no | `@default(false)` |  |
| `preferences` | `Boolean` | no | `@default(false)` |  |
| `version` | `String` | no | `` |  |
| `ipHash` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([anonymousId])`
- `@@index([userId, updatedAt])`
- `@@map("cookie_consents")`

Used by: consent

### PushSubscription

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `endpoint` | `String` | no | `@db.Text` |  |
| `p256dh` | `String` | no | `@db.Text` |  |
| `auth` | `String` | no | `@db.Text` |  |
| `userAgent` | `String` | yes | `` |  |
| `deviceName` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `lastUsedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([endpoint])`
- `@@index([userId])`
- `@@map("push_subscriptions")`

Used by: notifications

### DiscordWebhook

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `url` | `String` | no | `@db.Text` |  |
| `eventTypes` | `String[]` | no | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@map("discord_webhooks")`

Used by: notifications

### CurrencyRate

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `currency` | `String` | no | `@unique` |  |
| `rate` | `Decimal` | no | `@db.Decimal(10, 4)` |  |
| `symbol` | `String` | no | `` |  |
| `flag` | `String` | no | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@map("currency_rates")`

Used by: store

### ServerCategory

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `icon` | `String` | yes | `` |  |
| `color` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `servers` ← many **Server** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([isActive, order])`
- `@@map("server_categories")`

Used by: minecraft

### Server

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `address` | `String` | no | `` |  |
| `port` | `Int` | no | `@default(25565)` |  |
| `type` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `iconUrl` | `String` | yes | `` |  |
| `maxPlayers` | `Int` | no | `@default(100)` |  |
| `version` | `String` | yes | `` |  |
| `motd` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `categoryId` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `category` → **ServerCategory** (FK `categoryId`, onDelete: SetNull)
- `statusLogs` ← many **ServerStatusLog** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([isActive, order])`
- `@@index([categoryId])`
- `@@map("servers")`

Used by: minecraft, statistics

### ServerStatusLog

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `serverId` | `String` | no | `` |  |
| `online` | `Boolean` | no | `` |  |
| `playerCount` | `Int` | no | `@default(0)` |  |
| `maxPlayers` | `Int` | no | `@default(0)` |  |
| `players` | `String[]` | no | `` |  |
| `version` | `String` | yes | `` |  |
| `motd` | `String` | yes | `` |  |
| `ping` | `Int` | yes | `` |  |
| `timestamp` | `DateTime` | no | `@default(now())` |  |

Relations:
- `server` → **Server** (FK `serverId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([serverId, timestamp])`
- `@@map("server_status_logs")`

Used by: minecraft

### AuditLog

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `actorId` | `String` | no | `` |  |
| `action` | `String` | no | `` |  |
| `targetType` | `String` | yes | `` |  |
| `targetId` | `String` | yes | `` |  |
| `changes` | `Json` | yes | `` |  |
| `ipAddress` | `String` | yes | `` |  |
| `userAgent` | `String` | yes | `` |  |
| `severity` | `String` | no | `@default("info")` | info | warning | critical |
| `duration` | `Int` | yes | `` | Request duration in ms when applicable |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `actor` → **User** (FK `actorId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([actorId])`
- `@@index([action])`
- `@@index([severity])`
- `@@index([createdAt])`
- `@@map("audit_logs")`

Used by: admin, export, statistics

### Announcement

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `title` | `String` | no | `` |  |
| `message` | `String` | no | `` |  |
| `type` | `String` | no | `@default("info")` |  |
| `link` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isDismissible` | `Boolean` | no | `@default(true)` |  |
| `showFrom` | `DateTime` | yes | `` |  |
| `showUntil` | `DateTime` | yes | `` |  |
| `targetRole` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdBy` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@index([isActive, showFrom, showUntil])`
- `@@map("announcements")`

Used by: system

### MaintenanceMode

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `isEnabled` | `Boolean` | no | `@default(false)` |  |
| `title` | `String` | no | `@default("Технические работы")` |  |
| `message` | `String` | no | `@default("Сайт временно недоступен. Работы ведутся, скоро всё заработает!")` |  |
| `estimatedEnd` | `DateTime` | yes | `` |  |
| `enabledBy` | `String` | yes | `` |  |
| `enabledAt` | `DateTime` | yes | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@map("maintenance_mode")`

Used by: system

### ModuleStatus

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `module` | `String` | no | `@unique` |  |
| `isEnabled` | `Boolean` | no | `@default(true)` |  |
| `reason` | `String` | yes | `` |  |
| `disabledBy` | `String` | yes | `` |  |
| `disabledAt` | `DateTime` | yes | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@index([module])`
- `@@map("module_statuses")`

Used by: system

### SiteSetting

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `key` | `String` | no | `@id` |  |
| `value` | `String` | no | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@map("site_settings")`

Used by: admin, chat

### SiteSettings

Purpose: Structured global site configuration (singleton row)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `siteName` | `String` | no | `@default("TWOMC")` |  |
| `siteDescription` | `String` | yes | `` |  |
| `siteLogo` | `String` | yes | `` |  |
| `siteFavicon` | `String` | yes | `` |  |
| `contactEmail` | `String` | yes | `` |  |
| `discordInvite` | `String` | yes | `` |  |
| `vkGroup` | `String` | yes | `` |  |
| `telegramChannel` | `String` | yes | `` |  |
| `youtubeChannel` | `String` | yes | `` |  |
| `registrationEnabled` | `Boolean` | no | `@default(true)` |  |
| `registrationRequiresApproval` | `Boolean` | no | `@default(false)` |  |
| `maxUsersLimit` | `Int` | yes | `` |  |
| `autoModeration` | `Boolean` | no | `@default(true)` |  |
| `profanityFilter` | `Boolean` | no | `@default(true)` |  |
| `metaTitle` | `String` | yes | `` |  |
| `metaDescription` | `String` | yes | `` |  |
| `metaKeywords` | `String[]` | no | `@default([])` |  |
| `googleAnalyticsId` | `String` | yes | `` |  |
| `yandexMetrikaId` | `String` | yes | `` |  |
| `chatEnabled` | `Boolean` | no | `@default(true)` |  |
| `friendsEnabled` | `Boolean` | no | `@default(true)` |  |
| `storeEnabled` | `Boolean` | no | `@default(true)` |  |
| `commentsEnabled` | `Boolean` | no | `@default(true)` |  |
| `newsEnabled` | `Boolean` | no | `@default(true)` |  |
| `reportsEnabled` | `Boolean` | no | `@default(true)` |  |
| `defaultNotificationsEnabled` | `Boolean` | no | `@default(true)` |  |
| `requireAdmin2fa` | `Boolean` | no | `@default(false)` |  |
| `ipWhitelist` | `String[]` | no | `@default([])` |  |
| `updatedBy` | `String` | yes | `` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@map("site_settings_config")`

Used by: admin

### AdminBookmark

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `url` | `String` | no | `` |  |
| `title` | `String` | no | `` |  |
| `icon` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId])`
- `@@map("admin_bookmarks")`

Used by: admin

### SavedFilter

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `name` | `String` | no | `` |  |
| `page` | `String` | no | `` |  |
| `filters` | `Json` | no | `` |  |
| `isDefault` | `Boolean` | no | `@default(false)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId, page])`
- `@@map("saved_filters")`

Used by: admin

### ScheduledExport

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `name` | `String` | no | `` |  |
| `page` | `String` | no | `` |  |
| `format` | `String` | no | `` |  |
| `filters` | `Json` | yes | `` |  |
| `schedule` | `String` | no | `` |  |
| `email` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `lastRunAt` | `DateTime` | yes | `` |  |
| `nextRunAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([userId])`
- `@@index([nextRunAt, isActive])`
- `@@map("scheduled_exports")`

Used by: admin

### ChatChannel

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `name` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `type` | `ChatChannelType` | no | `` |  |
| `icon` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isReadOnly` | `Boolean` | no | `@default(false)` |  |
| `slowMode` | `Int` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `minRoleGroup` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `messages` ← many **ChatMessage** (обратная сторона)
- `mutes` ← many **ChatMute** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([isActive, order])`
- `@@map("chat_channels")`

Used by: chat

### ChatMessage

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `channelId` | `String` | no | `` |  |
| `authorId` | `String` | yes | `` |  |
| `type` | `ChatMessageType` | no | `@default(MESSAGE)` |  |
| `content` | `String` | no | `` |  |
| `contentHtml` | `String` | no | `` |  |
| `parentId` | `String` | yes | `` |  |
| `mentions` | `String[]` | no | `` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `pinnedAt` | `DateTime` | yes | `` |  |
| `pinnedBy` | `String` | yes | `` |  |
| `isEdited` | `Boolean` | no | `@default(false)` |  |
| `editedAt` | `DateTime` | yes | `` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `deletedBy` | `String` | yes | `` |  |
| `deletedReason` | `String` | yes | `` |  |
| `metadata` | `Json` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `channel` → **ChatChannel** (FK `channelId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: SetNull)
- `parent` → **ChatMessage** (FK `parentId`, onDelete: SetNull)
- `replies` ← many **ChatMessage** (обратная сторона)
- `reactions` ← many **ChatMessageReaction** (обратная сторона)

Indexes / constraints:
- `@@index([channelId, createdAt])`
- `@@index([authorId])`
- `@@index([parentId])`
- `@@map("chat_messages")`

Used by: chat, moderation, statistics

### ChatMessageReaction

Purpose: Unused: chat reactions removed from product; table kept for history / possible restore

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `messageId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `emoji` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `message` → **ChatMessage** (FK `messageId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([messageId, userId])`
- `@@index([messageId])`
- `@@map("chat_message_reactions")`

Used by: нет прямых обращений в apps/api/src

### Conversation

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `type` | `ConversationType` | no | `` |  |
| `title` | `String` | yes | `@db.VarChar(80)` |  |
| `avatar` | `String` | yes | `` |  |
| `directKey` | `String` | yes | `@unique` |  |
| `createdById` | `String` | yes | `` |  |
| `lastMessageAt` | `DateTime` | no | `@default(now())` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `createdBy` → **User** (FK `createdById`, onDelete: SetNull)
- `members` ← many **ConversationMember** (обратная сторона)
- `messages` ← many **DirectMessage** (обратная сторона)
- `invites` ← many **GroupInvite** (обратная сторона)

Indexes / constraints:
- `@@index([lastMessageAt])`
- `@@index([createdById])`
- `@@map("conversations")`

Used by: direct-messages

### ConversationMember

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `conversationId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `role` | `ConversationRole` | no | `@default(MEMBER)` |  |
| `lastReadAt` | `DateTime` | no | `@default(now())` |  |
| `lastReadMessageId` | `String` | yes | `` |  |
| `isMuted` | `Boolean` | no | `@default(false)` |  |
| `isArchived` | `Boolean` | no | `@default(false)` |  |
| `joinedAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `conversation` → **Conversation** (FK `conversationId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([conversationId, userId])`
- `@@index([userId, isArchived])`
- `@@index([conversationId, role])`
- `@@map("conversation_members")`

Used by: direct-messages

### DirectMessage

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `conversationId` | `String` | no | `` |  |
| `senderId` | `String` | yes | `` |  |
| `content` | `String` | no | `@default("") @db.VarChar(4000)` |  |
| `contentHtml` | `String` | no | `@default("")` |  |
| `parentId` | `String` | yes | `` |  |
| `isEdited` | `Boolean` | no | `@default(false)` |  |
| `editedAt` | `DateTime` | yes | `` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `conversation` → **Conversation** (FK `conversationId`, onDelete: Cascade)
- `sender` → **User** (FK `senderId`, onDelete: SetNull)
- `parent` → **DirectMessage** (FK `parentId`, onDelete: SetNull)
- `replies` ← many **DirectMessage** (обратная сторона)
- `reactions` ← many **DirectMessageReaction** (обратная сторона)
- `attachments` ← many **MessageAttachment** (обратная сторона)

Indexes / constraints:
- `@@index([conversationId, createdAt])`
- `@@index([senderId])`
- `@@index([parentId])`
- `@@map("direct_messages")`

Used by: direct-messages

### DirectMessageReaction

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `messageId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `emoji` | `String` | no | `@db.VarChar(32)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `message` → **DirectMessage** (FK `messageId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([messageId, userId, emoji])`
- `@@index([messageId])`
- `@@index([userId])`
- `@@map("direct_message_reactions")`

Used by: direct-messages

### MessageAttachment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `messageId` | `String` | no | `` |  |
| `fileUrl` | `String` | no | `` |  |
| `fileName` | `String` | no | `@db.VarChar(255)` |  |
| `mimeType` | `String` | no | `@db.VarChar(120)` |  |
| `size` | `Int` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `message` → **DirectMessage** (FK `messageId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([messageId])`
- `@@map("message_attachments")`

Used by: нет прямых обращений в apps/api/src

### GroupInvite

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `conversationId` | `String` | no | `` |  |
| `code` | `String` | no | `@unique @db.VarChar(32)` |  |
| `createdById` | `String` | no | `` |  |
| `maxUses` | `Int` | yes | `` |  |
| `usedCount` | `Int` | no | `@default(0)` |  |
| `expiresAt` | `DateTime` | yes | `` |  |
| `revokedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `conversation` → **Conversation** (FK `conversationId`, onDelete: Cascade)
- `createdBy` → **User** (FK `createdById`, onDelete: Cascade)

Indexes / constraints:
- `@@index([conversationId, revokedAt])`
- `@@index([expiresAt])`
- `@@map("group_invites")`

Used by: direct-messages

### ChatMute

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `channelId` | `String` | yes | `` |  |
| `reason` | `ChatMuteReason` | no | `` |  |
| `reasonNote` | `String` | yes | `` |  |
| `mutedBy` | `String` | no | `` |  |
| `mutedUntil` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `channel` → **ChatChannel** (FK `channelId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId, isActive])`
- `@@index([mutedUntil])`
- `@@map("chat_mutes")`

Used by: chat, moderation

### ChatBan

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `reason` | `String` | no | `` |  |
| `bannedBy` | `String` | no | `` |  |
| `bannedUntil` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId, isActive])`
- `@@map("chat_bans")`

Used by: chat

### CustomPosition

Purpose: Free-text staff title (e.g. "Технический директор"), separate from Position

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `color` | `String` | yes | `` |  |
| `icon` | `String` | yes | `` |  |
| `description` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `users` ← many **UserCustomPosition** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@map("custom_positions")`

Used by: custom-positions

### UserCustomPosition

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `customPositionId` | `String` | no | `` |  |
| `assignedBy` | `String` | yes | `` |  |
| `assignedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `customPosition` → **CustomPosition** (FK `customPositionId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId])`
- `@@index([customPositionId])`
- `@@map("user_custom_positions")`

Used by: custom-positions

### Department

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `` |  |
| `slug` | `String` | no | `@unique` |  |
| `description` | `String` | yes | `` |  |
| `color` | `String` | yes | `` |  |
| `icon` | `String` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `members` ← many **UserDepartment** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@map("departments")`

Used by: departments

### UserDepartment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `departmentId` | `String` | no | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `assignedBy` | `String` | yes | `` |  |
| `assignedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `department` → **Department** (FK `departmentId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([userId, departmentId])`
- `@@index([userId])`
- `@@index([departmentId])`
- `@@map("user_departments")`

Used by: departments

### Topic

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `title` | `String` | no | `` |  |
| `category` | `TopicCategory` | no | `` |  |
| `visibility` | `TopicVisibility` | no | `@default(PUBLIC)` |  |
| `icon` | `String` | yes | `` |  |
| `color` | `String` | yes | `` |  |
| `description` | `String` | yes | `` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `views` | `Int` | no | `@default(0)` |  |
| `createdBy` | `String` | no | `` |  |
| `updatedBy` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `attachments` ← many **TopicAttachment** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([category, visibility])`
- `@@index([isActive, isPinned, order])`
- `@@map("topics")`

Used by: admin, reports, topics

### TopicAttachment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `topicId` | `String` | no | `` |  |
| `fileName` | `String` | no | `` |  |
| `fileUrl` | `String` | no | `` |  |
| `fileSize` | `Int` | no | `` |  |
| `mimeType` | `String` | no | `` |  |
| `uploadedBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `topic` → **Topic** (FK `topicId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([topicId])`
- `@@map("topic_attachments")`

Used by: topics

### Report

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportNumber` | `String` | no | `@unique` |  |
| `type` | `ReportType` | no | `` |  |
| `status` | `ReportStatus` | no | `@default(PENDING)` |  |
| `authorId` | `String` | no | `` |  |
| `server` | `String` | yes | `` |  |
| `incidentDate` | `DateTime` | yes | `` |  |
| `description` | `String` | no | `@db.Text` |  |
| `descriptionHtml` | `String` | yes | `@db.Text` |  |
| `additionalText` | `String` | yes | `@db.Text` |  |
| `contactEmail` | `String` | yes | `` |  |
| `contactPhone` | `String` | yes | `` |  |
| `paymentDate` | `DateTime` | yes | `` |  |
| `appealedPunishmentId` | `String` | yes | `` |  |
| `assignedToId` | `String` | yes | `` |  |
| `verdict` | `String` | yes | `@db.Text` |  |
| `verdictHtml` | `String` | yes | `@db.Text` |  |
| `internalNote` | `String` | yes | `@db.Text` |  |
| `punishmentType` | `PunishmentType` | yes | `` | @deprecated Use separate punishment tools; kept for legacy data |
| `punishmentDuration` | `String` | yes | `` | @deprecated Use separate punishment tools; kept for legacy data |
| `punishmentReason` | `String` | yes | `` | @deprecated Use separate punishment tools; kept for legacy data |
| `isArchived` | `Boolean` | no | `@default(false)` |  |
| `archivedAt` | `DateTime` | yes | `` |  |
| `archivedBy` | `String` | yes | `` |  |
| `archiveReason` | `String` | yes | `` |  |
| `isLocked` | `Boolean` | no | `@default(false)` |  |
| `lockedBy` | `String` | yes | `` |  |
| `lockedReason` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |
| `resolvedAt` | `DateTime` | yes | `` |  |

Relations:
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))
- `appealedPunishment` → **UserPunishment** (FK `appealedPunishmentId`, onDelete: default (Restrict/SetNull по nullable))
- `assignedTo` → **User** (FK `assignedToId`, onDelete: default (Restrict/SetNull по nullable))
- `targets` ← many **ReportTarget** (обратная сторона)
- `evidenceLinks` ← many **ReportEvidenceLink** (обратная сторона)
- `messages` ← many **ReportMessage** (обратная сторона)
- `moderatorNotes` ← many **ReportModeratorNote** (обратная сторона)
- `attachments` ← many **ReportAttachment** (обратная сторона)

Indexes / constraints:
- `@@index([authorId])`
- `@@index([type, status])`
- `@@index([reportNumber])`
- `@@index([status])`
- `@@index([assignedToId])`
- `@@index([appealedPunishmentId])`
- `@@map("reports")`

Used by: achievements, admin, export, reports, statistics

### ReportTarget

Purpose: Multiple offender nicknames per report (registered or not)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportId` | `String` | no | `` |  |
| `username` | `String` | no | `` |  |
| `userId` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `report` → **Report** (FK `reportId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([reportId])`
- `@@index([userId])`
- `@@index([username])`
- `@@map("report_targets")`

Used by: admin

### ReportEvidenceLink

Purpose: Multiple evidence URLs with optional title and detected type

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportId` | `String` | no | `` |  |
| `url` | `String` | no | `` |  |
| `title` | `String` | yes | `` |  |
| `type` | `String` | yes | `` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `report` → **Report** (FK `reportId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([reportId])`
- `@@map("report_evidence_links")`

Used by: нет прямых обращений в apps/api/src

### ReportMessage

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportId` | `String` | no | `` |  |
| `authorId` | `String` | no | `` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `isStaff` | `Boolean` | no | `@default(false)` |  |
| `isSystem` | `Boolean` | no | `@default(false)` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `deletedBy` | `String` | yes | `` |  |
| `deleteReason` | `String` | yes | `` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `pinnedAt` | `DateTime` | yes | `` |  |
| `pinnedBy` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `report` → **Report** (FK `reportId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))
- `attachments` ← many **ReportMessageAttachment** (обратная сторона)

Indexes / constraints:
- `@@index([reportId, createdAt])`
- `@@map("report_messages")`

Used by: reports

### ReportMessageAttachment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `messageId` | `String` | no | `` |  |
| `fileName` | `String` | no | `` |  |
| `fileUrl` | `String` | no | `` |  |
| `fileSize` | `Int` | no | `` |  |
| `mimeType` | `String` | no | `` |  |
| `uploadedBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `message` → **ReportMessage** (FK `messageId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([messageId])`
- `@@map("report_message_attachments")`

Used by: reports

### ReportModeratorNote

Purpose: Staff-only notes on a report, separate from the public message thread

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportId` | `String` | no | `` |  |
| `authorId` | `String` | no | `` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `report` → **Report** (FK `reportId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([reportId])`
- `@@map("report_moderator_notes")`

Used by: reports

### ReportAttachment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `reportId` | `String` | no | `` |  |
| `fileName` | `String` | no | `` |  |
| `fileUrl` | `String` | no | `` |  |
| `fileSize` | `Int` | no | `` |  |
| `mimeType` | `String` | no | `` |  |
| `uploadedBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `report` → **Report** (FK `reportId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([reportId])`
- `@@map("report_attachments")`

Used by: reports

### ReportBan

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `reason` | `String` | no | `` |  |
| `bannedBy` | `String` | no | `` |  |
| `bannedUntil` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([userId, isActive])`
- `@@map("report_bans")`

Used by: reports

### UserPunishment

Purpose: Player punishment history (appealable via reports)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `punishmentType` | `PunishmentType` | no | `` |  |
| `reason` | `String` | no | `` |  |
| `duration` | `String` | yes | `` |  |
| `server` | `String` | yes | `` |  |
| `issuedBy` | `String` | no | `` |  |
| `issuedAt` | `DateTime` | no | `@default(now())` |  |
| `expiresAt` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isAppealable` | `Boolean` | no | `@default(true)` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))
- `issuedByUser` → **User** (FK `issuedBy`, onDelete: default (Restrict/SetNull по nullable))
- `reports` ← many **Report** (обратная сторона)

Indexes / constraints:
- `@@index([userId, isActive])`
- `@@index([issuedBy])`
- `@@map("user_punishments")`

Used by: admin, reports

### GameReport

Purpose: Synced from TigerReports plugin (placeholder until bridge is wired)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `externalId` | `String` | yes | `@unique` |  |
| `reportedUsername` | `String` | no | `` |  |
| `reporterUsername` | `String` | no | `` |  |
| `reason` | `String` | no | `` |  |
| `status` | `String` | no | `` |  |
| `server` | `String` | no | `` |  |
| `moderatorNote` | `String` | yes | `@db.Text` |  |
| `punishmentApplied` | `String` | yes | `` |  |
| `reportedAt` | `DateTime` | no | `` |  |
| `processedAt` | `DateTime` | yes | `` |  |
| `syncedAt` | `DateTime` | no | `@default(now())` |  |

Indexes / constraints:
- `@@index([reportedUsername])`
- `@@index([reporterUsername])`
- `@@index([status])`
- `@@map("game_reports")`

Used by: нет прямых обращений в apps/api/src

### GamePunishment

Purpose: Synced from LiteBans plugin (placeholder until bridge is wired)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `externalId` | `String` | yes | `@unique` |  |
| `playerUsername` | `String` | no | `` |  |
| `playerUuid` | `String` | yes | `` |  |
| `type` | `String` | no | `` |  |
| `reason` | `String` | no | `` |  |
| `duration` | `String` | yes | `` |  |
| `bannedBy` | `String` | no | `` |  |
| `bannedByUuid` | `String` | yes | `` |  |
| `server` | `String` | no | `` |  |
| `bannedAt` | `DateTime` | no | `` |  |
| `expiresAt` | `DateTime` | yes | `` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isAppealable` | `Boolean` | no | `@default(true)` |  |
| `removedAt` | `DateTime` | yes | `` |  |
| `removedBy` | `String` | yes | `` |  |
| `removeReason` | `String` | yes | `` |  |
| `syncedAt` | `DateTime` | no | `@default(now())` |  |

Indexes / constraints:
- `@@index([playerUsername])`
- `@@index([playerUuid])`
- `@@index([type, isActive])`
- `@@map("game_punishments")`

Used by: нет прямых обращений в apps/api/src

### News

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `title` | `String` | no | `` |  |
| `excerpt` | `String` | yes | `@db.Text` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `coverImage` | `String` | yes | `` |  |
| `category` | `NewsCategory` | no | `` |  |
| `status` | `NewsStatus` | no | `@default(DRAFT)` |  |
| `authorId` | `String` | no | `` |  |
| `metaTitle` | `String` | yes | `` |  |
| `metaDescription` | `String` | yes | `@db.Text` |  |
| `metaKeywords` | `String[]` | no | `` |  |
| `ogImage` | `String` | yes | `` |  |
| `publishedAt` | `DateTime` | yes | `` |  |
| `scheduledFor` | `DateTime` | yes | `` |  |
| `viewsCount` | `Int` | no | `@default(0)` |  |
| `likesCount` | `Int` | no | `@default(0)` |  |
| `commentsCount` | `Int` | no | `@default(0)` |  |
| `allowComments` | `Boolean` | no | `@default(true)` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `isFeatured` | `Boolean` | no | `@default(false)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))
- `comments` ← many **NewsComment** (обратная сторона)
- `likes` ← many **NewsLike** (обратная сторона)
- `views` ← many **NewsView** (обратная сторона)
- `tags` ← many **NewsTag** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([status, publishedAt])`
- `@@index([category])`
- `@@index([isPinned, isFeatured])`
- `@@map("news")`

Used by: admin, export, news, statistics

### NewsTag

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `newsId` | `String` | no | `` |  |
| `tag` | `String` | no | `` |  |

Relations:
- `news` → **News** (FK `newsId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([newsId, tag])`
- `@@index([tag])`
- `@@map("news_tags")`

Used by: news

### NewsComment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `newsId` | `String` | no | `` |  |
| `authorId` | `String` | no | `` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `parentId` | `String` | yes | `` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `deletedBy` | `String` | yes | `` |  |
| `isEdited` | `Boolean` | no | `@default(false)` |  |
| `editedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `news` → **News** (FK `newsId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))
- `parent` → **NewsComment** (FK `parentId`, onDelete: Cascade)
- `replies` ← many **NewsComment** (обратная сторона)
- `reactions` ← many **NewsCommentReaction** (обратная сторона)

Indexes / constraints:
- `@@index([newsId, createdAt])`
- `@@index([authorId])`
- `@@index([parentId])`
- `@@map("news_comments")`

Used by: admin, news

### NewsCommentReaction

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `commentId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `emoji` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `comment` → **NewsComment** (FK `commentId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@unique([commentId, userId])`
- `@@index([commentId])`
- `@@map("news_comment_reactions")`

Used by: news

### NewsLike

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `newsId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `news` → **News** (FK `newsId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@unique([newsId, userId])`
- `@@index([newsId])`
- `@@map("news_likes")`

Used by: news

### NewsView

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `newsId` | `String` | no | `` |  |
| `userId` | `String` | yes | `` |  |
| `ipAddress` | `String` | yes | `` |  |
| `userAgent` | `String` | yes | `` |  |
| `viewedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `news` → **News** (FK `newsId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([newsId, viewedAt])`
- `@@index([userId])`
- `@@map("news_views")`

Used by: news

### Activity

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `type` | `ActivityType` | no | `` |  |
| `visibility` | `ActivityVisibility` | no | `@default(PUBLIC)` |  |
| `title` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `imageUrl` | `String` | yes | `` |  |
| `actionUrl` | `String` | yes | `` |  |
| `metadata` | `Json` | yes | `` |  |
| `isPinned` | `Boolean` | no | `@default(false)` |  |
| `isHidden` | `Boolean` | no | `@default(false)` |  |
| `hiddenReason` | `String` | yes | `` |  |
| `hiddenBy` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `reactions` ← many **ActivityReaction** (обратная сторона)
- `comments` ← many **ActivityComment** (обратная сторона)

Indexes / constraints:
- `@@index([userId, createdAt])`
- `@@index([type, createdAt])`
- `@@index([visibility, createdAt])`
- `@@index([isPinned, createdAt])`
- `@@map("activities")`

Used by: activity

### ActivityReaction

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `activityId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `emoji` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `activity` → **Activity** (FK `activityId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@unique([activityId, userId])`
- `@@index([activityId])`
- `@@map("activity_reactions")`

Used by: activity

### ActivityComment

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `activityId` | `String` | no | `` |  |
| `authorId` | `String` | no | `` |  |
| `content` | `String` | no | `@db.Text` |  |
| `contentHtml` | `String` | yes | `@db.Text` |  |
| `isDeleted` | `Boolean` | no | `@default(false)` |  |
| `deletedAt` | `DateTime` | yes | `` |  |
| `deletedBy` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `activity` → **Activity** (FK `activityId`, onDelete: Cascade)
- `author` → **User** (FK `authorId`, onDelete: default (Restrict/SetNull по nullable))

Indexes / constraints:
- `@@index([activityId, createdAt])`
- `@@map("activity_comments")`

Used by: activity

### ActivityFeedSettings

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `@unique` |  |
| `showPurchases` | `Boolean` | no | `@default(true)` |  |
| `showAchievements` | `Boolean` | no | `@default(true)` |  |
| `showBadges` | `Boolean` | no | `@default(true)` |  |
| `showAwards` | `Boolean` | no | `@default(true)` |  |
| `showGifts` | `Boolean` | no | `@default(true)` |  |
| `showFriendships` | `Boolean` | no | `@default(true)` |  |
| `showProfileUpdates` | `Boolean` | no | `@default(false)` |  |
| `showMilestones` | `Boolean` | no | `@default(true)` |  |
| `showServerActivity` | `Boolean` | no | `@default(true)` |  |
| `purchasesVisibility` | `ActivityVisibility` | no | `@default(FRIENDS)` |  |
| `achievementsVisibility` | `ActivityVisibility` | no | `@default(PUBLIC)` |  |
| `badgesVisibility` | `ActivityVisibility` | no | `@default(PUBLIC)` |  |
| `giftsVisibility` | `ActivityVisibility` | no | `@default(FRIENDS)` |  |
| `friendshipsVisibility` | `ActivityVisibility` | no | `@default(FRIENDS)` |  |
| `profileUpdatesVisibility` | `ActivityVisibility` | no | `@default(FRIENDS)` |  |
| `notifyOnComment` | `Boolean` | no | `@default(true)` |  |
| `notifyOnReaction` | `Boolean` | no | `@default(false)` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@map("activity_feed_settings")`

Used by: activity

### CustomEmoji

Purpose: Custom shortcode emojis for markdown (:name:)

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `name` | `String` | no | `@unique @db.VarChar(32)` |  |
| `imageUrl` | `String` | no | `` |  |
| `category` | `String` | yes | `` |  |
| `isAnimated` | `Boolean` | no | `@default(false)` |  |
| `isPremium` | `Boolean` | no | `@default(false)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `createdBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Indexes / constraints:
- `@@index([name])`
- `@@index([category])`
- `@@index([isActive])`
- `@@map("custom_emojis")`

Used by: emojis

### ProfileDecoration

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique @db.VarChar(64)` |  |
| `name` | `String` | no | `@db.VarChar(100)` |  |
| `imageUrl` | `String` | no | `` |  |
| `availability` | `DecorationAvailability` | no | `@default(UNAVAILABLE)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `owners` ← many **UserDecoration** (обратная сторона)
- `selectedBy` ← many **User** (обратная сторона)
- `product` ← one **Product** (обратная сторона)

Indexes / constraints:
- `@@index([availability, isActive])`
- `@@index([order])`
- `@@map("profile_decorations")`

Used by: decorations, store

### UserDecoration

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `userId` | `String` | no | `` |  |
| `decorationId` | `String` | no | `` |  |
| `source` | `DecorationGrantSource` | no | `` |  |
| `grantedById` | `String` | yes | `` |  |
| `orderId` | `String` | yes | `` |  |
| `acquiredAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: Cascade)
- `decoration` → **ProfileDecoration** (FK `decorationId`, onDelete: Cascade)
- `grantedBy` → **User** (FK `grantedById`, onDelete: SetNull)

Indexes / constraints:
- `@@unique([userId, decorationId])`
- `@@index([userId, acquiredAt])`
- `@@index([decorationId])`
- `@@index([grantedById])`
- `@@map("user_decorations")`

Used by: decorations, store

### CalendarEvent

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique @db.VarChar(100)` |  |
| `title` | `String` | no | `@db.VarChar(160)` |  |
| `description` | `String` | no | `@db.Text` |  |
| `descriptionHtml` | `String` | no | `@db.Text` |  |
| `coverImage` | `String` | yes | `` |  |
| `category` | `CalendarEventCategory` | no | `` |  |
| `status` | `CalendarEventStatus` | no | `@default(DRAFT)` |  |
| `visibility` | `CalendarEventVisibility` | no | `@default(PUBLIC)` |  |
| `startsAt` | `DateTime` | no | `` |  |
| `endsAt` | `DateTime` | yes | `` |  |
| `isAllDay` | `Boolean` | no | `@default(false)` |  |
| `timezone` | `String` | no | `@default("Europe/Moscow") @db.VarChar(64)` |  |
| `location` | `String` | yes | `@db.VarChar(160)` |  |
| `server` | `String` | yes | `@db.VarChar(100)` |  |
| `maxParticipants` | `Int` | yes | `` |  |
| `registrationDeadline` | `DateTime` | yes | `` |  |
| `isFeatured` | `Boolean` | no | `@default(false)` |  |
| `createdById` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `createdBy` → **User** (FK `createdById`, onDelete: default (Restrict/SetNull по nullable))
- `participants` ← many **EventParticipant** (обратная сторона)

Indexes / constraints:
- `@@index([status, startsAt])`
- `@@index([visibility, startsAt])`
- `@@index([category, startsAt])`
- `@@index([createdById])`
- `@@map("calendar_events")`

Used by: events

### EventParticipant

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `eventId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `status` | `EventAttendanceStatus` | no | `@default(GOING)` |  |
| `remindedAt` | `DateTime` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `event` → **CalendarEvent** (FK `eventId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([eventId, userId])`
- `@@index([eventId, status])`
- `@@index([userId, status])`
- `@@map("event_participants")`

Used by: events

### Form

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `title` | `String` | no | `` |  |
| `description` | `String` | yes | `@db.Text` |  |
| `descriptionHtml` | `String` | yes | `@db.Text` |  |
| `coverImage` | `String` | yes | `` |  |
| `status` | `FormStatus` | no | `@default(DRAFT)` |  |
| `visibility` | `FormVisibility` | no | `@default(PUBLIC)` |  |
| `createdById` | `String` | no | `` |  |
| `maxResponses` | `Int` | yes | `` |  |
| `responsesCount` | `Int` | no | `@default(0)` |  |
| `onePerUser` | `Boolean` | no | `@default(true)` |  |
| `isAnonymous` | `Boolean` | no | `@default(false)` |  |
| `showResults` | `Boolean` | no | `@default(false)` |  |
| `requiresAuth` | `Boolean` | no | `@default(false)` |  |
| `requiresCaptcha` | `Boolean` | no | `@default(true)` |  |
| `opensAt` | `DateTime` | yes | `` |  |
| `closesAt` | `DateTime` | yes | `` |  |
| `timeLimit` | `Int` | yes | `` |  |
| `multiStep` | `Boolean` | no | `@default(false)` |  |
| `stepsConfig` | `Json` | yes | `` |  |
| `customCss` | `String` | yes | `@db.Text` |  |
| `thankYouMessage` | `String` | yes | `@db.Text` |  |
| `redirectUrl` | `String` | yes | `` |  |
| `deletedAt` | `DateTime` | yes | `` | Soft-delete via ARCHIVED status; kept for filtering deleted drafts |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `createdBy` → **User** (FK `createdById`, onDelete: default (Restrict/SetNull по nullable))
- `fields` ← many **FormField** (обратная сторона)
- `responses` ← many **FormResponse** (обратная сторона)
- `invites` ← many **FormInvite** (обратная сторона)

Indexes / constraints:
- `@@index([slug])`
- `@@index([status, visibility])`
- `@@index([createdById])`
- `@@map("forms")`

Used by: forms

### FormField

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `formId` | `String` | no | `` |  |
| `type` | `FormFieldType` | no | `` |  |
| `label` | `String` | no | `` |  |
| `description` | `String` | yes | `@db.Text` |  |
| `placeholder` | `String` | yes | `` |  |
| `isRequired` | `Boolean` | no | `@default(false)` |  |
| `order` | `Int` | no | `@default(0)` |  |
| `stepIndex` | `Int` | yes | `` |  |
| `options` | `Json` | yes | `` |  |
| `validation` | `Json` | yes | `` |  |
| `conditionalLogic` | `Json` | yes | `` |  |
| `defaultValue` | `String` | yes | `` |  |
| `minValue` | `Int` | yes | `` |  |
| `maxValue` | `Int` | yes | `` |  |
| `minLength` | `Int` | yes | `` |  |
| `maxLength` | `Int` | yes | `` |  |
| `maxFiles` | `Int` | yes | `` |  |
| `maxFileSize` | `Int` | yes | `` |  |
| `allowedMimes` | `String[]` | no | `` |  |
| `metadata` | `Json` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `form` → **Form** (FK `formId`, onDelete: Cascade)
- `answers` ← many **FormFieldAnswer** (обратная сторона)

Indexes / constraints:
- `@@index([formId, order])`
- `@@map("form_fields")`

Used by: forms

### FormResponse

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `formId` | `String` | no | `` |  |
| `respondentId` | `String` | yes | `` |  |
| `isAnonymous` | `Boolean` | no | `@default(false)` |  |
| `ipHash` | `String` | yes | `` |  |
| `userAgent` | `String` | yes | `` |  |
| `isComplete` | `Boolean` | no | `@default(false)` |  |
| `completedAt` | `DateTime` | yes | `` |  |
| `startedAt` | `DateTime` | no | `@default(now())` |  |
| `currentStep` | `Int` | no | `@default(0)` |  |
| `metadata` | `Json` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `form` → **Form** (FK `formId`, onDelete: Cascade)
- `respondent` → **User** (FK `respondentId`, onDelete: default (Restrict/SetNull по nullable))
- `answers` ← many **FormFieldAnswer** (обратная сторона)

Indexes / constraints:
- `@@index([formId, respondentId])`
- `@@index([formId, isComplete])`
- `@@map("form_responses")`

Used by: forms

### FormFieldAnswer

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `responseId` | `String` | no | `` |  |
| `fieldId` | `String` | no | `` |  |
| `textValue` | `String` | yes | `@db.Text` |  |
| `numberValue` | `Decimal` | yes | `@db.Decimal(12, 2)` |  |
| `booleanValue` | `Boolean` | yes | `` |  |
| `dateValue` | `DateTime` | yes | `` |  |
| `jsonValue` | `Json` | yes | `` |  |
| `fileUrls` | `String[]` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `response` → **FormResponse** (FK `responseId`, onDelete: Cascade)
- `field` → **FormField** (FK `fieldId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([responseId])`
- `@@index([fieldId])`
- `@@map("form_field_answers")`

Used by: forms

### FormInvite

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `formId` | `String` | no | `` |  |
| `code` | `String` | no | `@unique` |  |
| `maxUses` | `Int` | yes | `` |  |
| `usedCount` | `Int` | no | `@default(0)` |  |
| `expiresAt` | `DateTime` | yes | `` |  |
| `createdBy` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `form` → **Form** (FK `formId`, onDelete: Cascade)

Indexes / constraints:
- `@@index([code])`
- `@@index([formId])`
- `@@map("form_invites")`

Used by: forms

### StreamChannel

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `platform` | `StreamPlatform` | no | `` |  |
| `channelKey` | `String` | no | `` |  |
| `channelUrl` | `String` | no | `` |  |
| `displayName` | `String` | no | `` |  |
| `avatarUrl` | `String` | yes | `` |  |
| `userId` | `String` | yes | `` |  |
| `isPartner` | `Boolean` | no | `@default(false)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `isLive` | `Boolean` | no | `@default(false)` |  |
| `title` | `String` | yes | `` |  |
| `thumbnailUrl` | `String` | yes | `` |  |
| `liveUrl` | `String` | yes | `` |  |
| `viewerCount` | `Int` | no | `@default(0)` |  |
| `startedAt` | `DateTime` | yes | `` |  |
| `lastCheckedAt` | `DateTime` | yes | `` |  |
| `checkError` | `String` | yes | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `user` → **User** (FK `userId`, onDelete: SetNull)

Indexes / constraints:
- `@@unique([platform, channelKey])`
- `@@index([isActive, isLive])`
- `@@index([isPartner])`
- `@@index([userId])`
- `@@map("stream_channels")`

Used by: streaming

### VoteSite

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `slug` | `String` | no | `@unique` |  |
| `name` | `String` | no | `` |  |
| `description` | `String` | yes | `` |  |
| `url` | `String` | no | `` |  |
| `logoUrl` | `String` | yes | `` |  |
| `rewardCoins` | `Int` | no | `@default(10)` |  |
| `cooldownHours` | `Int` | no | `@default(24)` |  |
| `sortOrder` | `Int` | no | `@default(0)` |  |
| `isActive` | `Boolean` | no | `@default(true)` |  |
| `webhookSecretHash` | `String` | no | `` |  |
| `createdAt` | `DateTime` | no | `@default(now())` |  |
| `updatedAt` | `DateTime` | no | `@updatedAt` |  |

Relations:
- `votes` ← many **PlayerVote** (обратная сторона)

Indexes / constraints:
- `@@index([isActive, sortOrder])`
- `@@map("vote_sites")`

Used by: voting

### PlayerVote

Purpose: _нет комментария в schema.prisma; назначение выводится из полей и связей_

| Field | Type | Nullable | Attributes / Default | Description |
|---|---|---|---|---|
| `id` | `String` | no | `@id @default(cuid())` |  |
| `siteId` | `String` | no | `` |  |
| `userId` | `String` | no | `` |  |
| `externalId` | `String` | yes | `` |  |
| `rewardCoins` | `Int` | no | `` |  |
| `votedAt` | `DateTime` | no | `@default(now())` |  |

Relations:
- `site` → **VoteSite** (FK `siteId`, onDelete: Cascade)
- `user` → **User** (FK `userId`, onDelete: Cascade)

Indexes / constraints:
- `@@unique([siteId, externalId])`
- `@@index([userId, votedAt])`
- `@@index([siteId, votedAt])`
- `@@map("player_votes")`

Used by: voting

