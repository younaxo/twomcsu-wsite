-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('DEFAULT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('EVERYONE', 'FRIENDS_ONLY', 'NOBODY');

-- CreateEnum
CREATE TYPE "FriendRequestPolicy" AS ENUM ('EVERYONE', 'FRIENDS_OF_FRIENDS', 'NOBODY');

-- CreateEnum
CREATE TYPE "CommentPolicy" AS ENUM ('EVERYONE', 'FRIENDS', 'FRIENDS_OF_FRIENDS', 'NOBODY');

-- CreateEnum
CREATE TYPE "DirectMessagePolicy" AS ENUM ('EVERYONE', 'FRIENDS_OF_FRIENDS', 'FRIENDS', 'NOBODY');

-- CreateEnum
CREATE TYPE "CommentReportReason" AS ENUM ('SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommentReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('DISCORD', 'TELEGRAM', 'VK', 'YOUTUBE', 'TWITCH', 'TIKTOK', 'STEAM');

-- CreateEnum
CREATE TYPE "MediaGroup" AS ENUM ('YOUTUBE', 'TWITCH', 'TIKTOK');

-- CreateEnum
CREATE TYPE "UserBadgeType" AS ENUM ('LEADERSHIP', 'VERIFIED', 'SUBSCRIBER_PLUS', 'PROJECT_TEAM', 'DEVELOPERS_TEAM');

-- CreateEnum
CREATE TYPE "MediaBadgeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProfileReportReason" AS ENUM ('SPAM', 'INAPPROPRIATE_CONTENT', 'HARASSMENT', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProfileReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'DISLIKE');

-- CreateEnum
CREATE TYPE "AchievementCategory" AS ENUM ('GAME', 'SOCIAL', 'DONATION', 'SPECIAL', 'DAILY', 'SECRET');

-- CreateEnum
CREATE TYPE "AchievementRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "AchievementConditionType" AS ENUM ('PLAYTIME_MINUTES', 'KILLS_COUNT', 'DEATHS_COUNT', 'FRIENDS_COUNT', 'COMMENTS_COUNT', 'LIKES_RECEIVED', 'PURCHASES_COUNT', 'TOTAL_SPENT', 'GIFTS_SENT', 'GIFTS_RECEIVED', 'DAYS_STREAK', 'ACCOUNT_AGE_DAYS', 'PROFILE_VIEWS', 'BADGES_COUNT', 'REGISTRATION_ORDER', 'BUG_REPORTED', 'REPORTS_RESOLVED', 'MANUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED', 'BONUS');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRIVILEGE', 'KEY', 'SUBSCRIPTION', 'BADGE', 'BATTLE_PASS', 'BATTLE_PASS_BOOSTER', 'UNMUTE', 'UNBAN', 'CURRENCY', 'DECORATION', 'BUNDLE');

-- CreateEnum
CREATE TYPE "ProductDuration" AS ENUM ('FOREVER', 'MONTHS_3', 'MONTH_1', 'WEEK_1', 'SEASON', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('RUBIES', 'COINS');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_ON_PROFILE', 'COMMENT_MENTION', 'COMMENT_REPLY', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'GIFT_RECEIVED', 'ORDER_STATUS_CHANGED', 'CHAT_MENTION', 'NEWS_PUBLISHED', 'NEWS_COMMENT_REPLY', 'NEWS_COMMENT_MENTION', 'REPORT_MENTION', 'NEWS_LIKED', 'ANNOUNCEMENT', 'MAINTENANCE', 'ACHIEVEMENT_UNLOCKED', 'REPORT_ASSIGNED', 'REPORT_VERDICT', 'REPORT_TARGET', 'MESSAGE_RECEIVED', 'RANK_GRANTED', 'BADGE_GRANTED', 'AWARD_GRANTED', 'PAYMENT_RECEIVED', 'DAILY_REWARD_AVAILABLE', 'EVENT_REMINDER', 'EVENT_UPDATED', 'DECORATION_GRANTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DigestMode" AS ENUM ('INSTANT', 'HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('GENERAL', 'TRADE', 'HELP', 'ANNOUNCEMENTS', 'GAME', 'FLOOD');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('MESSAGE', 'SYSTEM', 'ANNOUNCEMENT', 'MOD_ACTION');

-- CreateEnum
CREATE TYPE "ChatMuteReason" AS ENUM ('SPAM', 'TOXIC', 'ADVERTISING', 'CAPS', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "TopicCategory" AS ENUM ('RULES', 'DOCUMENTS', 'INFORMATION', 'ADMIN_INTERNAL', 'FAQ', 'ANNOUNCEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TopicVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'HELPER_ONLY', 'MODERATOR_ONLY', 'ADMIN_ONLY', 'OWNER_ONLY');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('PLAYER_COMPLAINT', 'ADMIN_COMPLAINT', 'PUNISHMENT_APPEAL', 'TECHNICAL_ISSUE', 'DONATION_PROBLEM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'WAITING_RESPONSE', 'RESOLVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PunishmentType" AS ENUM ('WARN', 'MUTE', 'KICK', 'TEMPBAN', 'PERMBAN');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('UPDATE', 'EVENT', 'GUIDE', 'ANNOUNCEMENT', 'PATCH_NOTES', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PURCHASE_MADE', 'RANK_ACHIEVED', 'ACHIEVEMENT_UNLOCKED', 'BADGE_GRANTED', 'AWARD_GRANTED', 'GIFT_SENT', 'GIFT_RECEIVED', 'FRIENDSHIP_STARTED', 'PROFILE_UPDATED', 'NEWS_POSTED', 'EVENT_ANNOUNCED', 'MILESTONE_REACHED', 'JOINED_SERVER', 'TOP_ACHIEVED', 'MEDIA_APPROVED', 'DONATOR_UPGRADED', 'BIRTHDAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ActivityVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DecorationAvailability" AS ENUM ('STORE', 'ADMIN_ONLY', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DecorationGrantSource" AS ENUM ('PURCHASE', 'ADMIN', 'LEGACY');

-- CreateEnum
CREATE TYPE "CalendarEventCategory" AS ENUM ('COMMUNITY', 'TOURNAMENT', 'UPDATE', 'MAINTENANCE', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CalendarEventVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'STAFF');

-- CreateEnum
CREATE TYPE "EventAttendanceStatus" AS ENUM ('GOING', 'INTERESTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'RADIO', 'CHECKBOX', 'SELECT', 'NUMBER', 'DATE', 'TIME', 'EMAIL', 'PHONE', 'URL', 'FILE_UPLOAD', 'RATING', 'COLOR_PICKER', 'CODE_EDITOR', 'MARKDOWN_EDITOR', 'IMAGE_GALLERY', 'VIDEO_URL', 'SCHEDULE_PICKER', 'AGREEMENT_CHECKLIST', 'PLAYER_SELECTOR', 'SERVER_SELECTOR', 'RANK_SELECTOR', 'FRIENDS_SELECTOR', 'PRODUCT_SELECTOR', 'ORDER_SELECTOR', 'REPORT_REFERENCE', 'NEWS_REFERENCE', 'TOPIC_REFERENCE', 'PUNISHMENT_REFERENCE', 'SIGNATURE', 'DATE_RANGE', 'CURRENCY_AMOUNT', 'STATS_DISPLAY', 'ACHIEVEMENT_SELECTOR');

-- CreateEnum
CREATE TYPE "FormVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'HELPER_ONLY', 'MODERATOR_ONLY', 'ADMIN_ONLY', 'OWNER_ONLY', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StreamPlatform" AS ENUM ('TWITCH', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('TEMP', 'ATTACHED', 'DELETED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "color" VARCHAR(7),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isSuperuser" BOOLEAN NOT NULL DEFAULT false,
    "isAssignable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_assignment_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "backgroundColor" VARCHAR(9),
    "icon" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "shortId" SERIAL NOT NULL,
    "tag" VARCHAR(32) NOT NULL,
    "email" TEXT NOT NULL,
    "username" VARCHAR(16) NOT NULL,
    "password" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'DEFAULT',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "positionId" TEXT NOT NULL,
    "avatar" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "banner" TEXT,
    "bannerPreset" TEXT,
    "statusText" VARCHAR(128),
    "bio" VARCHAR(500),
    "country" TEXT,
    "city" VARCHAR(100),
    "gender" "Gender",
    "birthDate" TIMESTAMP(3),
    "showBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'EVERYONE',
    "friendRequestPolicy" "FriendRequestPolicy" NOT NULL DEFAULT 'EVERYONE',
    "directMessagePolicy" "DirectMessagePolicy" NOT NULL DEFAULT 'EVERYONE',
    "hideEmail" BOOLEAN NOT NULL DEFAULT true,
    "hideCountry" BOOLEAN NOT NULL DEFAULT false,
    "hideCity" BOOLEAN NOT NULL DEFAULT false,
    "hideBirthDate" BOOLEAN NOT NULL DEFAULT true,
    "hideGender" BOOLEAN NOT NULL DEFAULT false,
    "hideStatistics" BOOLEAN NOT NULL DEFAULT false,
    "hideSocials" BOOLEAN NOT NULL DEFAULT false,
    "commentPolicy" "CommentPolicy" NOT NULL DEFAULT 'EVERYONE',
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commentsForcedDisabledBy" TEXT,
    "commentsForcedReason" TEXT,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnMention" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnReply" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFriendRequest" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnGift" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnOrder" BOOLEAN NOT NULL DEFAULT true,
    "referralCode" TEXT,
    "referredBy" TEXT,
    "currentServer" TEXT,
    "currentServerId" TEXT,
    "lastServerActivity" TIMESTAMP(3),
    "isOnlineInGame" BOOLEAN NOT NULL DEFAULT false,
    "displayBadgeId" TEXT,
    "selectedDecorationId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableToTypes" "ProductType"[],
    "minOrderAmount" DECIMAL(10,2),
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_usages" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_code_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserBadgeType" NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_media_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaGroup" "MediaGroup" NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_media_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_badge_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaGroup" "MediaGroup" NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "description" TEXT,
    "status" "MediaBadgeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_badge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_reactions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_reports" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "ProfileReportReason" NOT NULL,
    "description" TEXT,
    "status" "ProfileReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_statistics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "playTime" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "killDeathRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastServer" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "awards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT NOT NULL,
    "color" TEXT,
    "rarity" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_awards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL,
    "rarity" "AchievementRarity" NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "conditionType" "AchievementConditionType" NOT NULL,
    "conditionValue" INTEGER,
    "conditionParams" JSONB,
    "rewardRubies" INTEGER NOT NULL DEFAULT 0,
    "rewardBadgeType" TEXT,
    "rewardTitle" TEXT,
    "rewardMessage" TEXT,
    "unlockedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "currentProgress" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "isShowcased" BOOLEAN NOT NULL DEFAULT false,
    "showcaseOrder" INTEGER NOT NULL DEFAULT 0,
    "rewardsGranted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_comments" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "parentId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "pinnedBy" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedReason" TEXT,
    "mentions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_reactions" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_reports" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "CommentReportReason" NOT NULL,
    "description" TEXT,
    "status" "CommentReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "image" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "fullDescription" TEXT,
    "type" "ProductType" NOT NULL,
    "image" TEXT,
    "images" TEXT[],
    "categoryId" TEXT NOT NULL,
    "positionId" TEXT,
    "isGiftable" BOOLEAN NOT NULL DEFAULT true,
    "isSelfOnly" BOOLEAN NOT NULL DEFAULT false,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "isSeasonalOnly" BOOLEAN NOT NULL DEFAULT false,
    "maxPerPurchase" INTEGER,
    "currencyType" "CurrencyType",
    "currencyAmount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "gameCommands" TEXT[],
    "server" TEXT,
    "decorationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "duration" "ProductDuration" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "oldPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "originalPrice" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_discounts" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "productType" "ProductType",
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(10,2),
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promoCodeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "bundleId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "giftToUserId" TEXT,
    "giftMessage" VARCHAR(500),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "guestMinecraftNick" VARCHAR(16),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT,
    "paymentId" TEXT,
    "paymentProvider" TEXT,
    "paymentWebhookVerifiedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "bundleId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "giftToUserId" TEXT,
    "giftMessage" VARCHAR(500),
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_discounts" (
    "id" TEXT NOT NULL,
    "minPurchases" INTEGER NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "loyalty_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "symbol" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "link" TEXT,
    "imageUrl" TEXT,
    "fromUserId" TEXT,
    "metadata" JSONB,
    "groupKey" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentViaEmail" BOOLEAN NOT NULL DEFAULT false,
    "sentViaEmailAt" TIMESTAMP(3),
    "sentViaPush" BOOLEAN NOT NULL DEFAULT false,
    "sentViaPushAt" TIMESTAMP(3),
    "sentViaDiscord" BOOLEAN NOT NULL DEFAULT false,
    "sentViaDiscordAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discordWebhookUrl" TEXT,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestMode" "DigestMode" NOT NULL DEFAULT 'INSTANT',
    "digestTime" TEXT DEFAULT '09:00',
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '08:00',
    "typeSettings" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "necessary" BOOLEAN NOT NULL DEFAULT true,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "preferences" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cookie_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 25565,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 100,
    "version" TEXT,
    "motd" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_status_logs" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 0,
    "players" TEXT[],
    "version" TEXT,
    "motd" TEXT,
    "ping" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "link" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDismissible" BOOLEAN NOT NULL DEFAULT true,
    "showFrom" TIMESTAMP(3),
    "showUntil" TIMESTAMP(3),
    "targetRole" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_mode" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL DEFAULT 'Технические работы',
    "message" TEXT NOT NULL DEFAULT 'Сайт временно недоступен. Работы ведутся, скоро всё заработает!',
    "estimatedEnd" TIMESTAMP(3),
    "enabledBy" TEXT,
    "enabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_mode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_statuses" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "disabledBy" TEXT,
    "disabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "site_settings_config" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT 'TWOMC',
    "siteDescription" TEXT,
    "siteLogo" TEXT,
    "siteFavicon" TEXT,
    "contactEmail" TEXT,
    "discordInvite" TEXT,
    "vkGroup" TEXT,
    "telegramChannel" TEXT,
    "youtubeChannel" TEXT,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "registrationRequiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "maxUsersLimit" INTEGER,
    "autoModeration" BOOLEAN NOT NULL DEFAULT true,
    "profanityFilter" BOOLEAN NOT NULL DEFAULT true,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "googleAnalyticsId" TEXT,
    "yandexMetrikaId" TEXT,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "friendsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "storeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reportsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requireAdmin2fa" BOOLEAN NOT NULL DEFAULT false,
    "ipWhitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_exports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "schedule" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_channels" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChatChannelType" NOT NULL,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "slowMode" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "minRoleGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT,
    "type" "ChatMessageType" NOT NULL DEFAULT 'MESSAGE',
    "content" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "parentId" TEXT,
    "mentions" TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "pinnedBy" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL,
    "title" VARCHAR(80),
    "avatar" TEXT,
    "directKey" TEXT,
    "createdById" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL DEFAULT 'MEMBER',
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadMessageId" TEXT,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "content" VARCHAR(4000) NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_invites" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "createdById" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_mutes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "reason" "ChatMuteReason" NOT NULL,
    "reasonNote" TEXT,
    "mutedBy" TEXT NOT NULL,
    "mutedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "bannedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_custom_positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customPositionId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_custom_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_departments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "TopicCategory" NOT NULL,
    "visibility" "TopicVisibility" NOT NULL DEFAULT 'PUBLIC',
    "icon" TEXT,
    "color" TEXT,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_attachments" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "authorId" TEXT NOT NULL,
    "server" TEXT,
    "incidentDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "descriptionHtml" TEXT,
    "additionalText" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "paymentDate" TIMESTAMP(3),
    "appealedPunishmentId" TEXT,
    "assignedToId" TEXT,
    "verdict" TEXT,
    "verdictHtml" TEXT,
    "internalNote" TEXT,
    "punishmentType" "PunishmentType",
    "punishmentDuration" TEXT,
    "punishmentReason" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "archiveReason" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedBy" TEXT,
    "lockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_targets" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_evidence_links" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_messages" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "pinnedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_moderator_notes" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_moderator_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "bannedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_punishments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "punishmentType" "PunishmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "duration" TEXT,
    "server" TEXT,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAppealable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_punishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "coverImage" TEXT,
    "category" "NewsCategory" NOT NULL,
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[],
    "ogImage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_tags" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "news_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_comments" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "parentId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_comment_reactions" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_comment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_likes" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_views" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "visibility" "ActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "hiddenBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_reactions" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_comments" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHtml" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_feed_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "showPurchases" BOOLEAN NOT NULL DEFAULT true,
    "showAchievements" BOOLEAN NOT NULL DEFAULT true,
    "showBadges" BOOLEAN NOT NULL DEFAULT true,
    "showAwards" BOOLEAN NOT NULL DEFAULT true,
    "showGifts" BOOLEAN NOT NULL DEFAULT true,
    "showFriendships" BOOLEAN NOT NULL DEFAULT true,
    "showProfileUpdates" BOOLEAN NOT NULL DEFAULT false,
    "showMilestones" BOOLEAN NOT NULL DEFAULT true,
    "showServerActivity" BOOLEAN NOT NULL DEFAULT true,
    "purchasesVisibility" "ActivityVisibility" NOT NULL DEFAULT 'FRIENDS',
    "achievementsVisibility" "ActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "badgesVisibility" "ActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "giftsVisibility" "ActivityVisibility" NOT NULL DEFAULT 'FRIENDS',
    "friendshipsVisibility" "ActivityVisibility" NOT NULL DEFAULT 'FRIENDS',
    "profileUpdatesVisibility" "ActivityVisibility" NOT NULL DEFAULT 'FRIENDS',
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnReaction" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_feed_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_emojis" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "category" TEXT,
    "isAnimated" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_emojis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_decorations" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "availability" "DecorationAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_decorations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_decorations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decorationId" TEXT NOT NULL,
    "source" "DecorationGrantSource" NOT NULL,
    "grantedById" TEXT,
    "orderId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_decorations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "coverImage" TEXT,
    "category" "CalendarEventCategory" NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CalendarEventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    "location" VARCHAR(160),
    "server" VARCHAR(100),
    "maxParticipants" INTEGER,
    "registrationDeadline" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EventAttendanceStatus" NOT NULL DEFAULT 'GOING',
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "descriptionHtml" TEXT,
    "coverImage" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "FormVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdById" TEXT NOT NULL,
    "maxResponses" INTEGER,
    "responsesCount" INTEGER NOT NULL DEFAULT 0,
    "onePerUser" BOOLEAN NOT NULL DEFAULT true,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "showResults" BOOLEAN NOT NULL DEFAULT false,
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "requiresCaptcha" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "timeLimit" INTEGER,
    "multiStep" BOOLEAN NOT NULL DEFAULT false,
    "stepsConfig" JSONB,
    "customCss" TEXT,
    "thankYouMessage" TEXT,
    "redirectUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "placeholder" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "stepIndex" INTEGER,
    "options" JSONB,
    "validation" JSONB,
    "conditionalLogic" JSONB,
    "defaultValue" TEXT,
    "minValue" INTEGER,
    "maxValue" INTEGER,
    "minLength" INTEGER,
    "maxLength" INTEGER,
    "maxFiles" INTEGER,
    "maxFileSize" INTEGER,
    "allowedMimes" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_responses" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_field_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(12,2),
    "booleanValue" BOOLEAN,
    "dateValue" TIMESTAMP(3),
    "jsonValue" JSONB,
    "fileUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_field_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_invites" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_channels" (
    "id" TEXT NOT NULL,
    "platform" "StreamPlatform" NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "userId" TEXT,
    "isPartner" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "thumbnailUrl" TEXT,
    "liveUrl" TEXT,
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "checkError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_sites" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "logoUrl" TEXT,
    "rewardCoins" INTEGER NOT NULL DEFAULT 10,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vote_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_votes" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT,
    "rewardCoins" INTEGER NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'TEMP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE INDEX "roles_priority_idx" ON "roles"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE INDEX "role_assignment_logs_userId_idx" ON "role_assignment_logs"("userId");

-- CreateIndex
CREATE INDEX "role_assignment_logs_roleId_idx" ON "role_assignment_logs"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_slug_key" ON "positions"("slug");

-- CreateIndex
CREATE INDEX "positions_slug_idx" ON "positions"("slug");

-- CreateIndex
CREATE INDEX "positions_group_idx" ON "positions"("group");

-- CreateIndex
CREATE INDEX "positions_priority_idx" ON "positions"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "users_shortId_key" ON "users"("shortId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tag_key" ON "users"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_tag_idx" ON "users"("tag");

-- CreateIndex
CREATE INDEX "users_shortId_idx" ON "users"("shortId");

-- CreateIndex
CREATE INDEX "users_positionId_idx" ON "users"("positionId");

-- CreateIndex
CREATE INDEX "users_isBanned_idx" ON "users"("isBanned");

-- CreateIndex
CREATE INDEX "users_accountType_idx" ON "users"("accountType");

-- CreateIndex
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");

-- CreateIndex
CREATE INDEX "users_lastActivityAt_idx" ON "users"("lastActivityAt");

-- CreateIndex
CREATE INDEX "users_currentServerId_idx" ON "users"("currentServerId");

-- CreateIndex
CREATE INDEX "users_isOnlineInGame_idx" ON "users"("isOnlineInGame");

-- CreateIndex
CREATE INDEX "users_displayBadgeId_idx" ON "users"("displayBadgeId");

-- CreateIndex
CREATE INDEX "users_selectedDecorationId_idx" ON "users"("selectedDecorationId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_tokenHash_idx" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_isActive_idx" ON "promo_codes"("isActive");

-- CreateIndex
CREATE INDEX "promo_code_usages_promoCodeId_idx" ON "promo_code_usages"("promoCodeId");

-- CreateIndex
CREATE INDEX "promo_code_usages_userId_idx" ON "promo_code_usages"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_usages_promoCodeId_userId_key" ON "promo_code_usages"("promoCodeId", "userId");

-- CreateIndex
CREATE INDEX "user_badges_userId_idx" ON "user_badges"("userId");

-- CreateIndex
CREATE INDEX "user_badges_userId_order_idx" ON "user_badges"("userId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_userId_type_key" ON "user_badges"("userId", "type");

-- CreateIndex
CREATE INDEX "social_links_userId_idx" ON "social_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_userId_platform_key" ON "social_links"("userId", "platform");

-- CreateIndex
CREATE INDEX "user_media_badges_userId_idx" ON "user_media_badges"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_media_badges_userId_mediaGroup_key" ON "user_media_badges"("userId", "mediaGroup");

-- CreateIndex
CREATE INDEX "media_badge_requests_userId_idx" ON "media_badge_requests"("userId");

-- CreateIndex
CREATE INDEX "media_badge_requests_status_idx" ON "media_badge_requests"("status");

-- CreateIndex
CREATE INDEX "profile_views_profileId_idx" ON "profile_views"("profileId");

-- CreateIndex
CREATE INDEX "profile_views_profileId_viewedAt_idx" ON "profile_views"("profileId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "profile_views_profileId_viewerId_key" ON "profile_views"("profileId", "viewerId");

-- CreateIndex
CREATE INDEX "profile_reactions_profileId_idx" ON "profile_reactions"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_reactions_profileId_userId_key" ON "profile_reactions"("profileId", "userId");

-- CreateIndex
CREATE INDEX "profile_reports_profileId_idx" ON "profile_reports"("profileId");

-- CreateIndex
CREATE INDEX "profile_reports_status_idx" ON "profile_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "profile_reports_profileId_reporterId_key" ON "profile_reports"("profileId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "player_statistics_userId_key" ON "player_statistics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "awards_slug_key" ON "awards"("slug");

-- CreateIndex
CREATE INDEX "user_awards_userId_idx" ON "user_awards"("userId");

-- CreateIndex
CREATE INDEX "user_awards_userId_order_idx" ON "user_awards"("userId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "user_awards_userId_awardId_key" ON "user_awards"("userId", "awardId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_slug_key" ON "achievements"("slug");

-- CreateIndex
CREATE INDEX "achievements_slug_idx" ON "achievements"("slug");

-- CreateIndex
CREATE INDEX "achievements_category_rarity_idx" ON "achievements"("category", "rarity");

-- CreateIndex
CREATE INDEX "user_achievements_userId_isCompleted_idx" ON "user_achievements"("userId", "isCompleted");

-- CreateIndex
CREATE INDEX "user_achievements_userId_isShowcased_idx" ON "user_achievements"("userId", "isShowcased");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON "user_achievements"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "friendships_requesterId_idx" ON "friendships"("requesterId");

-- CreateIndex
CREATE INDEX "friendships_addresseeId_idx" ON "friendships"("addresseeId");

-- CreateIndex
CREATE INDEX "friendships_status_idx" ON "friendships"("status");

-- CreateIndex
CREATE INDEX "friendships_addresseeId_status_idx" ON "friendships"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "friendships_requesterId_status_idx" ON "friendships"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requesterId_addresseeId_key" ON "friendships"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "profile_comments_profileId_createdAt_idx" ON "profile_comments"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "profile_comments_authorId_idx" ON "profile_comments"("authorId");

-- CreateIndex
CREATE INDEX "profile_comments_parentId_idx" ON "profile_comments"("parentId");

-- CreateIndex
CREATE INDEX "profile_comments_isPinned_idx" ON "profile_comments"("isPinned");

-- CreateIndex
CREATE INDEX "comment_reactions_commentId_idx" ON "comment_reactions"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reactions_commentId_userId_key" ON "comment_reactions"("commentId", "userId");

-- CreateIndex
CREATE INDEX "comment_reports_commentId_idx" ON "comment_reports"("commentId");

-- CreateIndex
CREATE INDEX "comment_reports_status_idx" ON "comment_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reports_commentId_reporterId_key" ON "comment_reports"("commentId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_decorationId_key" ON "products"("decorationId");

-- CreateIndex
CREATE INDEX "products_slug_idx" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- CreateIndex
CREATE INDEX "products_isActive_isFeatured_idx" ON "products"("isActive", "isFeatured");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_duration_key" ON "product_variants"("productId", "duration");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_slug_key" ON "bundles"("slug");

-- CreateIndex
CREATE INDEX "bundles_slug_idx" ON "bundles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_items_bundleId_productId_variantId_key" ON "bundle_items"("bundleId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "bulk_discounts_productId_idx" ON "bulk_discounts"("productId");

-- CreateIndex
CREATE INDEX "bulk_discounts_productType_idx" ON "bulk_discounts"("productType");

-- CreateIndex
CREATE UNIQUE INDEX "carts_userId_key" ON "carts"("userId");

-- CreateIndex
CREATE INDEX "carts_userId_idx" ON "carts"("userId");

-- CreateIndex
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_userId_key" ON "wishlists"("userId");

-- CreateIndex
CREATE INDEX "wishlists_userId_idx" ON "wishlists"("userId");

-- CreateIndex
CREATE INDEX "wishlist_items_wishlistId_idx" ON "wishlist_items"("wishlistId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlistId_productId_key" ON "wishlist_items"("wishlistId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_orderNumber_idx" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "loyalty_discounts_minPurchases_idx" ON "loyalty_discounts"("minPurchases");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_currency_key" ON "currency_rates"("currency");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_groupKey_idx" ON "notifications"("groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_key" ON "notification_settings"("userId");

-- CreateIndex
CREATE INDEX "cookie_consents_anonymousId_idx" ON "cookie_consents"("anonymousId");

-- CreateIndex
CREATE INDEX "cookie_consents_userId_updatedAt_idx" ON "cookie_consents"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "server_categories_slug_key" ON "server_categories"("slug");

-- CreateIndex
CREATE INDEX "server_categories_slug_idx" ON "server_categories"("slug");

-- CreateIndex
CREATE INDEX "server_categories_isActive_order_idx" ON "server_categories"("isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "servers_slug_key" ON "servers"("slug");

-- CreateIndex
CREATE INDEX "servers_slug_idx" ON "servers"("slug");

-- CreateIndex
CREATE INDEX "servers_isActive_order_idx" ON "servers"("isActive", "order");

-- CreateIndex
CREATE INDEX "servers_categoryId_idx" ON "servers"("categoryId");

-- CreateIndex
CREATE INDEX "server_status_logs_serverId_timestamp_idx" ON "server_status_logs"("serverId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "announcements_isActive_showFrom_showUntil_idx" ON "announcements"("isActive", "showFrom", "showUntil");

-- CreateIndex
CREATE UNIQUE INDEX "module_statuses_module_key" ON "module_statuses"("module");

-- CreateIndex
CREATE INDEX "module_statuses_module_idx" ON "module_statuses"("module");

-- CreateIndex
CREATE INDEX "admin_bookmarks_userId_idx" ON "admin_bookmarks"("userId");

-- CreateIndex
CREATE INDEX "saved_filters_userId_page_idx" ON "saved_filters"("userId", "page");

-- CreateIndex
CREATE INDEX "scheduled_exports_userId_idx" ON "scheduled_exports"("userId");

-- CreateIndex
CREATE INDEX "scheduled_exports_nextRunAt_isActive_idx" ON "scheduled_exports"("nextRunAt", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_slug_key" ON "chat_channels"("slug");

-- CreateIndex
CREATE INDEX "chat_channels_slug_idx" ON "chat_channels"("slug");

-- CreateIndex
CREATE INDEX "chat_channels_isActive_order_idx" ON "chat_channels"("isActive", "order");

-- CreateIndex
CREATE INDEX "chat_messages_channelId_createdAt_idx" ON "chat_messages"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_authorId_idx" ON "chat_messages"("authorId");

-- CreateIndex
CREATE INDEX "chat_messages_parentId_idx" ON "chat_messages"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_directKey_key" ON "conversations"("directKey");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_createdById_idx" ON "conversations"("createdById");

-- CreateIndex
CREATE INDEX "conversation_members_userId_isArchived_idx" ON "conversation_members"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "conversation_members_conversationId_role_idx" ON "conversation_members"("conversationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversationId_userId_key" ON "conversation_members"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "direct_messages_conversationId_createdAt_idx" ON "direct_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_messages_senderId_idx" ON "direct_messages"("senderId");

-- CreateIndex
CREATE INDEX "direct_messages_parentId_idx" ON "direct_messages"("parentId");

-- CreateIndex
CREATE INDEX "direct_message_reactions_messageId_idx" ON "direct_message_reactions"("messageId");

-- CreateIndex
CREATE INDEX "direct_message_reactions_userId_idx" ON "direct_message_reactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_reactions_messageId_userId_emoji_key" ON "direct_message_reactions"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_code_key" ON "group_invites"("code");

-- CreateIndex
CREATE INDEX "group_invites_conversationId_revokedAt_idx" ON "group_invites"("conversationId", "revokedAt");

-- CreateIndex
CREATE INDEX "group_invites_expiresAt_idx" ON "group_invites"("expiresAt");

-- CreateIndex
CREATE INDEX "chat_mutes_userId_isActive_idx" ON "chat_mutes"("userId", "isActive");

-- CreateIndex
CREATE INDEX "chat_mutes_mutedUntil_idx" ON "chat_mutes"("mutedUntil");

-- CreateIndex
CREATE INDEX "chat_bans_userId_isActive_idx" ON "chat_bans"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "custom_positions_slug_key" ON "custom_positions"("slug");

-- CreateIndex
CREATE INDEX "custom_positions_slug_idx" ON "custom_positions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_custom_positions_userId_key" ON "user_custom_positions"("userId");

-- CreateIndex
CREATE INDEX "user_custom_positions_userId_idx" ON "user_custom_positions"("userId");

-- CreateIndex
CREATE INDEX "user_custom_positions_customPositionId_idx" ON "user_custom_positions"("customPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_slug_key" ON "departments"("slug");

-- CreateIndex
CREATE INDEX "departments_slug_idx" ON "departments"("slug");

-- CreateIndex
CREATE INDEX "user_departments_userId_idx" ON "user_departments"("userId");

-- CreateIndex
CREATE INDEX "user_departments_departmentId_idx" ON "user_departments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_departments_userId_departmentId_key" ON "user_departments"("userId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "topics_slug_idx" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "topics_category_visibility_idx" ON "topics"("category", "visibility");

-- CreateIndex
CREATE INDEX "topics_isActive_isPinned_order_idx" ON "topics"("isActive", "isPinned", "order");

-- CreateIndex
CREATE INDEX "topic_attachments_topicId_idx" ON "topic_attachments"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reportNumber_key" ON "reports"("reportNumber");

-- CreateIndex
CREATE INDEX "reports_authorId_idx" ON "reports"("authorId");

-- CreateIndex
CREATE INDEX "reports_type_status_idx" ON "reports"("type", "status");

-- CreateIndex
CREATE INDEX "reports_reportNumber_idx" ON "reports"("reportNumber");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_assignedToId_idx" ON "reports"("assignedToId");

-- CreateIndex
CREATE INDEX "reports_appealedPunishmentId_idx" ON "reports"("appealedPunishmentId");

-- CreateIndex
CREATE INDEX "report_targets_reportId_idx" ON "report_targets"("reportId");

-- CreateIndex
CREATE INDEX "report_targets_userId_idx" ON "report_targets"("userId");

-- CreateIndex
CREATE INDEX "report_targets_username_idx" ON "report_targets"("username");

-- CreateIndex
CREATE INDEX "report_evidence_links_reportId_idx" ON "report_evidence_links"("reportId");

-- CreateIndex
CREATE INDEX "report_messages_reportId_createdAt_idx" ON "report_messages"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "report_message_attachments_messageId_idx" ON "report_message_attachments"("messageId");

-- CreateIndex
CREATE INDEX "report_moderator_notes_reportId_idx" ON "report_moderator_notes"("reportId");

-- CreateIndex
CREATE INDEX "report_attachments_reportId_idx" ON "report_attachments"("reportId");

-- CreateIndex
CREATE INDEX "report_bans_userId_isActive_idx" ON "report_bans"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_punishments_userId_isActive_idx" ON "user_punishments"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_punishments_issuedBy_idx" ON "user_punishments"("issuedBy");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_slug_idx" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_status_publishedAt_idx" ON "news"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "news_category_idx" ON "news"("category");

-- CreateIndex
CREATE INDEX "news_isPinned_isFeatured_idx" ON "news"("isPinned", "isFeatured");

-- CreateIndex
CREATE INDEX "news_tags_tag_idx" ON "news_tags"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "news_tags_newsId_tag_key" ON "news_tags"("newsId", "tag");

-- CreateIndex
CREATE INDEX "news_comments_newsId_createdAt_idx" ON "news_comments"("newsId", "createdAt");

-- CreateIndex
CREATE INDEX "news_comments_authorId_idx" ON "news_comments"("authorId");

-- CreateIndex
CREATE INDEX "news_comments_parentId_idx" ON "news_comments"("parentId");

-- CreateIndex
CREATE INDEX "news_comment_reactions_commentId_idx" ON "news_comment_reactions"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "news_comment_reactions_commentId_userId_key" ON "news_comment_reactions"("commentId", "userId");

-- CreateIndex
CREATE INDEX "news_likes_newsId_idx" ON "news_likes"("newsId");

-- CreateIndex
CREATE UNIQUE INDEX "news_likes_newsId_userId_key" ON "news_likes"("newsId", "userId");

-- CreateIndex
CREATE INDEX "news_views_newsId_viewedAt_idx" ON "news_views"("newsId", "viewedAt");

-- CreateIndex
CREATE INDEX "news_views_userId_idx" ON "news_views"("userId");

-- CreateIndex
CREATE INDEX "activities_userId_createdAt_idx" ON "activities"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_type_createdAt_idx" ON "activities"("type", "createdAt");

-- CreateIndex
CREATE INDEX "activities_visibility_createdAt_idx" ON "activities"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "activities_isPinned_createdAt_idx" ON "activities"("isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "activity_reactions_activityId_idx" ON "activity_reactions"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_reactions_activityId_userId_key" ON "activity_reactions"("activityId", "userId");

-- CreateIndex
CREATE INDEX "activity_comments_activityId_createdAt_idx" ON "activity_comments"("activityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "activity_feed_settings_userId_key" ON "activity_feed_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_emojis_name_key" ON "custom_emojis"("name");

-- CreateIndex
CREATE INDEX "custom_emojis_name_idx" ON "custom_emojis"("name");

-- CreateIndex
CREATE INDEX "custom_emojis_category_idx" ON "custom_emojis"("category");

-- CreateIndex
CREATE INDEX "custom_emojis_isActive_idx" ON "custom_emojis"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "profile_decorations_slug_key" ON "profile_decorations"("slug");

-- CreateIndex
CREATE INDEX "profile_decorations_availability_isActive_idx" ON "profile_decorations"("availability", "isActive");

-- CreateIndex
CREATE INDEX "profile_decorations_order_idx" ON "profile_decorations"("order");

-- CreateIndex
CREATE INDEX "user_decorations_userId_acquiredAt_idx" ON "user_decorations"("userId", "acquiredAt");

-- CreateIndex
CREATE INDEX "user_decorations_decorationId_idx" ON "user_decorations"("decorationId");

-- CreateIndex
CREATE INDEX "user_decorations_grantedById_idx" ON "user_decorations"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "user_decorations_userId_decorationId_key" ON "user_decorations"("userId", "decorationId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_slug_key" ON "calendar_events"("slug");

-- CreateIndex
CREATE INDEX "calendar_events_status_startsAt_idx" ON "calendar_events"("status", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_visibility_startsAt_idx" ON "calendar_events"("visibility", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_category_startsAt_idx" ON "calendar_events"("category", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_createdById_idx" ON "calendar_events"("createdById");

-- CreateIndex
CREATE INDEX "event_participants_eventId_status_idx" ON "event_participants"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_participants_userId_status_idx" ON "event_participants"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_eventId_userId_key" ON "event_participants"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "forms_slug_key" ON "forms"("slug");

-- CreateIndex
CREATE INDEX "forms_slug_idx" ON "forms"("slug");

-- CreateIndex
CREATE INDEX "forms_status_visibility_idx" ON "forms"("status", "visibility");

-- CreateIndex
CREATE INDEX "forms_createdById_idx" ON "forms"("createdById");

-- CreateIndex
CREATE INDEX "form_fields_formId_order_idx" ON "form_fields"("formId", "order");

-- CreateIndex
CREATE INDEX "form_responses_formId_respondentId_idx" ON "form_responses"("formId", "respondentId");

-- CreateIndex
CREATE INDEX "form_responses_formId_isComplete_idx" ON "form_responses"("formId", "isComplete");

-- CreateIndex
CREATE INDEX "form_field_answers_responseId_idx" ON "form_field_answers"("responseId");

-- CreateIndex
CREATE INDEX "form_field_answers_fieldId_idx" ON "form_field_answers"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "form_invites_code_key" ON "form_invites"("code");

-- CreateIndex
CREATE INDEX "form_invites_code_idx" ON "form_invites"("code");

-- CreateIndex
CREATE INDEX "form_invites_formId_idx" ON "form_invites"("formId");

-- CreateIndex
CREATE INDEX "stream_channels_isActive_isLive_idx" ON "stream_channels"("isActive", "isLive");

-- CreateIndex
CREATE INDEX "stream_channels_isPartner_idx" ON "stream_channels"("isPartner");

-- CreateIndex
CREATE INDEX "stream_channels_userId_idx" ON "stream_channels"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "stream_channels_platform_channelKey_key" ON "stream_channels"("platform", "channelKey");

-- CreateIndex
CREATE UNIQUE INDEX "vote_sites_slug_key" ON "vote_sites"("slug");

-- CreateIndex
CREATE INDEX "vote_sites_isActive_sortOrder_idx" ON "vote_sites"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "player_votes_userId_votedAt_idx" ON "player_votes"("userId", "votedAt");

-- CreateIndex
CREATE INDEX "player_votes_siteId_votedAt_idx" ON "player_votes"("siteId", "votedAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_votes_siteId_externalId_key" ON "player_votes"("siteId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "files_key_key" ON "files"("key");

-- CreateIndex
CREATE INDEX "files_status_idx" ON "files"("status");

-- CreateIndex
CREATE INDEX "files_ownerType_ownerId_idx" ON "files"("ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment_logs" ADD CONSTRAINT "role_assignment_logs_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_displayBadgeId_fkey" FOREIGN KEY ("displayBadgeId") REFERENCES "user_badges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_selectedDecorationId_fkey" FOREIGN KEY ("selectedDecorationId") REFERENCES "profile_decorations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_usages" ADD CONSTRAINT "promo_code_usages_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_usages" ADD CONSTRAINT "promo_code_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_media_badges" ADD CONSTRAINT "user_media_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_badge_requests" ADD CONSTRAINT "media_badge_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reactions" ADD CONSTRAINT "profile_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reactions" ADD CONSTRAINT "profile_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_statistics" ADD CONSTRAINT "player_statistics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_awards" ADD CONSTRAINT "user_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_awards" ADD CONSTRAINT "user_awards_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "awards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "profile_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "profile_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "profile_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_decorationId_fkey" FOREIGN KEY ("decorationId") REFERENCES "profile_decorations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_discounts" ADD CONSTRAINT "bulk_discounts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_giftToUserId_fkey" FOREIGN KEY ("giftToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookie_consents" ADD CONSTRAINT "cookie_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "server_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_status_logs" ADD CONSTRAINT "server_status_logs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_bookmarks" ADD CONSTRAINT "admin_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_exports" ADD CONSTRAINT "scheduled_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "direct_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_bans" ADD CONSTRAINT "chat_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_positions" ADD CONSTRAINT "user_custom_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_positions" ADD CONSTRAINT "user_custom_positions_customPositionId_fkey" FOREIGN KEY ("customPositionId") REFERENCES "custom_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_attachments" ADD CONSTRAINT "topic_attachments_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_appealedPunishmentId_fkey" FOREIGN KEY ("appealedPunishmentId") REFERENCES "user_punishments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_targets" ADD CONSTRAINT "report_targets_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_targets" ADD CONSTRAINT "report_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_evidence_links" ADD CONSTRAINT "report_evidence_links_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_messages" ADD CONSTRAINT "report_messages_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_messages" ADD CONSTRAINT "report_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_message_attachments" ADD CONSTRAINT "report_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "report_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_moderator_notes" ADD CONSTRAINT "report_moderator_notes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_moderator_notes" ADD CONSTRAINT "report_moderator_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_bans" ADD CONSTRAINT "report_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_punishments" ADD CONSTRAINT "user_punishments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_punishments" ADD CONSTRAINT "user_punishments_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_tags" ADD CONSTRAINT "news_tags_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "news_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comment_reactions" ADD CONSTRAINT "news_comment_reactions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "news_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comment_reactions" ADD CONSTRAINT "news_comment_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_likes" ADD CONSTRAINT "news_likes_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_likes" ADD CONSTRAINT "news_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_views" ADD CONSTRAINT "news_views_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_views" ADD CONSTRAINT "news_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reactions" ADD CONSTRAINT "activity_reactions_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reactions" ADD CONSTRAINT "activity_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_feed_settings" ADD CONSTRAINT "activity_feed_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_decorations" ADD CONSTRAINT "user_decorations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_decorations" ADD CONSTRAINT "user_decorations_decorationId_fkey" FOREIGN KEY ("decorationId") REFERENCES "profile_decorations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_decorations" ADD CONSTRAINT "user_decorations_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_field_answers" ADD CONSTRAINT "form_field_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "form_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_field_answers" ADD CONSTRAINT "form_field_answers_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "form_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invites" ADD CONSTRAINT "form_invites_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_channels" ADD CONSTRAINT "stream_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_votes" ADD CONSTRAINT "player_votes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "vote_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_votes" ADD CONSTRAINT "player_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
