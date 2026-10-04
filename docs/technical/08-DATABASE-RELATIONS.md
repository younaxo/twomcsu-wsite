# 08 — Связи между моделями

Сгенерировано из `schema.prisma`: для каждой модели показаны FK, которыми она **владеет**, и обратные коллекции. `onDelete` указан только если задан явно.

## User — карта связей

```text
User
├── position: Position  (FK positionId, onDelete default)
├── customPosition: UserCustomPosition
├── departments: UserDepartment[]
├── refreshTokens: RefreshToken[]
├── passwordResetTokens: PasswordResetToken[]
├── promoCodeUsages: PromoCodeUsage[]
├── badges: UserBadge[]
├── socialLinks: SocialLink[]
├── mediaBadges: UserMediaBadge[]
├── mediaBadgeRequests: MediaBadgeRequest[]
├── statistics: PlayerStatistics
├── awards: UserAward[]
├── profileViews: ProfileView[]
├── viewedProfiles: ProfileView[]
├── profileReactions: ProfileReaction[]
├── givenReactions: ProfileReaction[]
├── profileReports: ProfileReport[]
├── sentReports: ProfileReport[]
├── sentFriendRequests: Friendship[]
├── receivedFriendRequests: Friendship[]
├── profileComments: ProfileComment[]
├── authoredComments: ProfileComment[]
├── notifications: Notification[]
├── sentNotifications: Notification[]
├── notificationSettings: NotificationSettings
├── pushSubscriptions: PushSubscription[]
├── auditLogs: AuditLog[]
├── cookieConsents: CookieConsent[]
├── displayBadge: UserBadge  (FK displayBadgeId, onDelete SetNull)
├── cart: Cart
├── wishlist: Wishlist
├── orders: Order[]
├── giftedItems: OrderItem[]
├── authoredMessages: ChatMessage[]
├── chatMutes: ChatMute[]
├── chatBans: ChatBan[]
├── conversationMemberships: ConversationMember[]
├── createdConversations: Conversation[]
├── sentDirectMessages: DirectMessage[]
├── directMessageReactions: DirectMessageReaction[]
├── createdGroupInvites: GroupInvite[]
├── authoredReports: Report[]
├── assignedReports: Report[]
├── reportedIn: ReportTarget[]
├── reportMessages: ReportMessage[]
├── reportModeratorNotes: ReportModeratorNote[]
├── reportBans: ReportBan[]
├── punishments: UserPunishment[]
├── issuedPunishments: UserPunishment[]
├── authoredNews: News[]
├── newsComments: NewsComment[]
├── newsCommentReactions: NewsCommentReaction[]
├── newsLikes: NewsLike[]
├── newsViews: NewsView[]
├── adminBookmarks: AdminBookmark[]
├── savedFilters: SavedFilter[]
├── scheduledExports: ScheduledExport[]
├── activities: Activity[]
├── activityReactions: ActivityReaction[]
├── activityComments: ActivityComment[]
├── activityFeedSettings: ActivityFeedSettings
├── achievements: UserAchievement[]
├── createdForms: Form[]
├── formResponses: FormResponse[]
├── selectedDecoration: ProfileDecoration  (FK selectedDecorationId, onDelete SetNull)
├── ownedDecorations: UserDecoration[]
├── grantedDecorations: UserDecoration[]
├── createdCalendarEvents: CalendarEvent[]
├── eventParticipations: EventParticipant[]
├── streamChannels: StreamChannel[]
└── playerVotes: PlayerVote[]
```

## Все модели

### Position
Ссылаются на неё: User.position; Product.position

### User
Владеет FK: `position`→Position (default); `displayBadge`→UserBadge (SetNull); `selectedDecoration`→ProfileDecoration (SetNull)
Ссылаются на неё: RefreshToken.user (Cascade); PasswordResetToken.user (Cascade); PromoCodeUsage.user (Cascade); UserBadge.user (Cascade); SocialLink.user (Cascade); UserMediaBadge.user (Cascade); MediaBadgeRequest.user (Cascade); ProfileView.profile (Cascade); ProfileView.viewer (Cascade); ProfileReaction.profile (Cascade); ProfileReaction.user (Cascade); ProfileReport.profile (Cascade); ProfileReport.reporter (Cascade); PlayerStatistics.user (Cascade); UserAward.user (Cascade); UserAchievement.user (Cascade); Friendship.requester (Cascade); Friendship.addressee (Cascade); ProfileComment.profile (Cascade); ProfileComment.author (Cascade); Cart.user (Cascade); Wishlist.user (Cascade); Order.user; OrderItem.giftToUser; Notification.user (Cascade); Notification.fromUser; NotificationSettings.user (Cascade); CookieConsent.user (Cascade); PushSubscription.user (Cascade); AuditLog.actor; AdminBookmark.user (Cascade); SavedFilter.user (Cascade); ScheduledExport.user; ChatMessage.author (SetNull); Conversation.createdBy (SetNull); ConversationMember.user (Cascade); DirectMessage.sender (SetNull); DirectMessageReaction.user (Cascade); GroupInvite.createdBy (Cascade); ChatMute.user (Cascade); ChatBan.user (Cascade); UserCustomPosition.user (Cascade); UserDepartment.user (Cascade); Report.author; Report.assignedTo; ReportTarget.user; ReportMessage.author; ReportModeratorNote.author; ReportBan.user (Cascade); UserPunishment.user; UserPunishment.issuedByUser; News.author; NewsComment.author; NewsCommentReaction.user; NewsLike.user; NewsView.user; Activity.user (Cascade); ActivityReaction.user; ActivityComment.author; ActivityFeedSettings.user (Cascade); UserDecoration.user (Cascade); UserDecoration.grantedBy (SetNull); CalendarEvent.createdBy; EventParticipant.user (Cascade); Form.createdBy; FormResponse.respondent; StreamChannel.user (SetNull); PlayerVote.user (Cascade)

### RefreshToken
Владеет FK: `user`→User (Cascade)

### PasswordResetToken
Владеет FK: `user`→User (Cascade)

### PromoCode
Ссылаются на неё: PromoCodeUsage.promoCode (Cascade); Cart.promoCode; Order.promoCode

### PromoCodeUsage
Владеет FK: `promoCode`→PromoCode (Cascade); `user`→User (Cascade)

### UserBadge
Владеет FK: `user`→User (Cascade)
Ссылаются на неё: User.displayBadge (SetNull)

### SocialLink
Владеет FK: `user`→User (Cascade)

### UserMediaBadge
Владеет FK: `user`→User (Cascade)

### MediaBadgeRequest
Владеет FK: `user`→User (Cascade)

### BannerPreset
Изолированная модель (нет relations).

### ProfileView
Владеет FK: `profile`→User (Cascade); `viewer`→User (Cascade)

### ProfileReaction
Владеет FK: `profile`→User (Cascade); `user`→User (Cascade)

### ProfileReport
Владеет FK: `profile`→User (Cascade); `reporter`→User (Cascade)

### PlayerStatistics
Владеет FK: `user`→User (Cascade)

### Award
Ссылаются на неё: UserAward.award (Cascade)

### UserAward
Владеет FK: `user`→User (Cascade); `award`→Award (Cascade)

### Achievement
Ссылаются на неё: UserAchievement.achievement (Cascade)

### UserAchievement
Владеет FK: `user`→User (Cascade); `achievement`→Achievement (Cascade)

### Friendship
Владеет FK: `requester`→User (Cascade); `addressee`→User (Cascade)

### ProfileComment
Владеет FK: `profile`→User (Cascade); `author`→User (Cascade); `parent`→ProfileComment (Cascade)
Ссылаются на неё: ProfileComment.parent (Cascade); CommentReaction.comment (Cascade); CommentReport.comment (Cascade)

### CommentReaction
Владеет FK: `comment`→ProfileComment (Cascade)

### CommentReport
Владеет FK: `comment`→ProfileComment (Cascade)

### Category
Владеет FK: `parent`→Category (default)
Ссылаются на неё: Category.parent; Product.category

### Product
Владеет FK: `category`→Category (default); `position`→Position (default); `decoration`→ProfileDecoration (SetNull)
Ссылаются на неё: ProductVariant.product (Cascade); BundleItem.product; BulkDiscount.product (Cascade); CartItem.product; WishlistItem.product; OrderItem.product

### ProductVariant
Владеет FK: `product`→Product (Cascade)
Ссылаются на неё: CartItem.variant; OrderItem.variant

### Bundle
Ссылаются на неё: BundleItem.bundle (Cascade); CartItem.bundle; OrderItem.bundle

### BundleItem
Владеет FK: `bundle`→Bundle (Cascade); `product`→Product (default)

### BulkDiscount
Владеет FK: `product`→Product (Cascade)

### Cart
Владеет FK: `user`→User (Cascade); `promoCode`→PromoCode (default)
Ссылаются на неё: CartItem.cart (Cascade)

### CartItem
Владеет FK: `cart`→Cart (Cascade); `product`→Product (default); `variant`→ProductVariant (default); `bundle`→Bundle (default)

### Wishlist
Владеет FK: `user`→User (Cascade)
Ссылаются на неё: WishlistItem.wishlist (Cascade)

### WishlistItem
Владеет FK: `wishlist`→Wishlist (Cascade); `product`→Product (default)

### Order
Владеет FK: `user`→User (default); `promoCode`→PromoCode (default)
Ссылаются на неё: OrderItem.order (Cascade)

### OrderItem
Владеет FK: `order`→Order (Cascade); `product`→Product (default); `variant`→ProductVariant (default); `bundle`→Bundle (default); `giftToUser`→User (default)

### LoyaltyDiscount
Изолированная модель (нет relations).

### Notification
Владеет FK: `user`→User (Cascade); `fromUser`→User (default)

### NotificationSettings
Владеет FK: `user`→User (Cascade)

### CookieConsent
Владеет FK: `user`→User (Cascade)

### PushSubscription
Владеет FK: `user`→User (Cascade)

### DiscordWebhook
Изолированная модель (нет relations).

### CurrencyRate
Изолированная модель (нет relations).

### ServerCategory
Ссылаются на неё: Server.category (SetNull)

### Server
Владеет FK: `category`→ServerCategory (SetNull)
Ссылаются на неё: ServerStatusLog.server (Cascade)

### ServerStatusLog
Владеет FK: `server`→Server (Cascade)

### AuditLog
Владеет FK: `actor`→User (default)

### Announcement
Изолированная модель (нет relations).

### MaintenanceMode
Изолированная модель (нет relations).

### ModuleStatus
Изолированная модель (нет relations).

### SiteSetting
Изолированная модель (нет relations).

### SiteSettings
Изолированная модель (нет relations).

### AdminBookmark
Владеет FK: `user`→User (Cascade)

### SavedFilter
Владеет FK: `user`→User (Cascade)

### ScheduledExport
Владеет FK: `user`→User (default)

### ChatChannel
Ссылаются на неё: ChatMessage.channel (Cascade); ChatMute.channel (Cascade)

### ChatMessage
Владеет FK: `channel`→ChatChannel (Cascade); `author`→User (SetNull); `parent`→ChatMessage (SetNull)
Ссылаются на неё: ChatMessage.parent (SetNull); ChatMessageReaction.message (Cascade)

### ChatMessageReaction
Владеет FK: `message`→ChatMessage (Cascade)

### Conversation
Владеет FK: `createdBy`→User (SetNull)
Ссылаются на неё: ConversationMember.conversation (Cascade); DirectMessage.conversation (Cascade); GroupInvite.conversation (Cascade)

### ConversationMember
Владеет FK: `conversation`→Conversation (Cascade); `user`→User (Cascade)

### DirectMessage
Владеет FK: `conversation`→Conversation (Cascade); `sender`→User (SetNull); `parent`→DirectMessage (SetNull)
Ссылаются на неё: DirectMessage.parent (SetNull); DirectMessageReaction.message (Cascade); MessageAttachment.message (Cascade)

### DirectMessageReaction
Владеет FK: `message`→DirectMessage (Cascade); `user`→User (Cascade)

### MessageAttachment
Владеет FK: `message`→DirectMessage (Cascade)

### GroupInvite
Владеет FK: `conversation`→Conversation (Cascade); `createdBy`→User (Cascade)

### ChatMute
Владеет FK: `user`→User (Cascade); `channel`→ChatChannel (Cascade)

### ChatBan
Владеет FK: `user`→User (Cascade)

### CustomPosition
Ссылаются на неё: UserCustomPosition.customPosition (Cascade)

### UserCustomPosition
Владеет FK: `user`→User (Cascade); `customPosition`→CustomPosition (Cascade)

### Department
Ссылаются на неё: UserDepartment.department (Cascade)

### UserDepartment
Владеет FK: `user`→User (Cascade); `department`→Department (Cascade)

### Topic
Ссылаются на неё: TopicAttachment.topic (Cascade)

### TopicAttachment
Владеет FK: `topic`→Topic (Cascade)

### Report
Владеет FK: `author`→User (default); `appealedPunishment`→UserPunishment (default); `assignedTo`→User (default)
Ссылаются на неё: ReportTarget.report (Cascade); ReportEvidenceLink.report (Cascade); ReportMessage.report (Cascade); ReportModeratorNote.report (Cascade); ReportAttachment.report (Cascade)

### ReportTarget
Владеет FK: `report`→Report (Cascade); `user`→User (default)

### ReportEvidenceLink
Владеет FK: `report`→Report (Cascade)

### ReportMessage
Владеет FK: `report`→Report (Cascade); `author`→User (default)
Ссылаются на неё: ReportMessageAttachment.message (Cascade)

### ReportMessageAttachment
Владеет FK: `message`→ReportMessage (Cascade)

### ReportModeratorNote
Владеет FK: `report`→Report (Cascade); `author`→User (default)

### ReportAttachment
Владеет FK: `report`→Report (Cascade)

### ReportBan
Владеет FK: `user`→User (Cascade)

### UserPunishment
Владеет FK: `user`→User (default); `issuedByUser`→User (default)
Ссылаются на неё: Report.appealedPunishment

### GameReport
Изолированная модель (нет relations).

### GamePunishment
Изолированная модель (нет relations).

### News
Владеет FK: `author`→User (default)
Ссылаются на неё: NewsTag.news (Cascade); NewsComment.news (Cascade); NewsLike.news (Cascade); NewsView.news (Cascade)

### NewsTag
Владеет FK: `news`→News (Cascade)

### NewsComment
Владеет FK: `news`→News (Cascade); `author`→User (default); `parent`→NewsComment (Cascade)
Ссылаются на неё: NewsComment.parent (Cascade); NewsCommentReaction.comment (Cascade)

### NewsCommentReaction
Владеет FK: `comment`→NewsComment (Cascade); `user`→User (default)

### NewsLike
Владеет FK: `news`→News (Cascade); `user`→User (default)

### NewsView
Владеет FK: `news`→News (Cascade); `user`→User (default)

### Activity
Владеет FK: `user`→User (Cascade)
Ссылаются на неё: ActivityReaction.activity (Cascade); ActivityComment.activity (Cascade)

### ActivityReaction
Владеет FK: `activity`→Activity (Cascade); `user`→User (default)

### ActivityComment
Владеет FK: `activity`→Activity (Cascade); `author`→User (default)

### ActivityFeedSettings
Владеет FK: `user`→User (Cascade)

### CustomEmoji
Изолированная модель (нет relations).

### ProfileDecoration
Ссылаются на неё: User.selectedDecoration (SetNull); Product.decoration (SetNull); UserDecoration.decoration (Cascade)

### UserDecoration
Владеет FK: `user`→User (Cascade); `decoration`→ProfileDecoration (Cascade); `grantedBy`→User (SetNull)

### CalendarEvent
Владеет FK: `createdBy`→User (default)
Ссылаются на неё: EventParticipant.event (Cascade)

### EventParticipant
Владеет FK: `event`→CalendarEvent (Cascade); `user`→User (Cascade)

### Form
Владеет FK: `createdBy`→User (default)
Ссылаются на неё: FormField.form (Cascade); FormResponse.form (Cascade); FormInvite.form (Cascade)

### FormField
Владеет FK: `form`→Form (Cascade)
Ссылаются на неё: FormFieldAnswer.field (Cascade)

### FormResponse
Владеет FK: `form`→Form (Cascade); `respondent`→User (default)
Ссылаются на неё: FormFieldAnswer.response (Cascade)

### FormFieldAnswer
Владеет FK: `response`→FormResponse (Cascade); `field`→FormField (Cascade)

### FormInvite
Владеет FK: `form`→Form (Cascade)

### StreamChannel
Владеет FK: `user`→User (SetNull)

### VoteSite
Ссылаются на неё: PlayerVote.site (Cascade)

### PlayerVote
Владеет FK: `site`→VoteSite (Cascade); `user`→User (Cascade)

