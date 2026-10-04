import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { DiscordService } from './discord.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

/// Global: NotificationsService нужен практически любому доменному модулю,
/// создающему события для пользователя (друзья, комментарии, активность,
/// личные сообщения, чат — и далее news/reports/store/achievements/events
/// по мере их реализации) — как и Prisma/Redis/Email/Roles, это сквозная
/// инфраструктура, а не отдельный домен верхнего уровня.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    NotificationSettingsService,
    NotificationsGateway,
    PushService,
    DiscordService,
    AdminNotificationsService,
  ],
  exports: [NotificationsService, NotificationSettingsService],
})
export class NotificationsModule {}
