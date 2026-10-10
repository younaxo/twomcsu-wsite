import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DiscordPersonalWebhookDto } from './dto/discord-personal-webhook.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { PushSubscribeDto } from './dto/push-subscribe.dto';
import { UpdateDigestDto } from './dto/update-digest.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdateTypeSettingDto } from './dto/update-type-setting.dto';
import {
  NotificationSettingsService,
  settingsView,
} from './notification-settings.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SiteModule } from '../system/site-module.decorator';
import { PushUnsubscribeDto } from './dto/push-unsubscribe.dto';
import { Throttle } from '@nestjs/throttler';

@SiteModule('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly settings: NotificationSettingsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  /// Все ответы настроек — без токена вебхука (ADR-0110).
  private view(row: Parameters<typeof settingsView>[0]) {
    return settingsView(row, this.email.configured);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(
      user.id,
      query.page ?? 1,
      query.limit ?? 30,
      query.unreadOnly,
      query.type,
    );
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.view(await this.settings.getOrCreate(user.id));
  }

  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.view(await this.settings.update(user.id, dto));
  }

  @Patch('settings/type/:type')
  async updateTypeSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Body() dto: UpdateTypeSettingDto,
  ) {
    return this.view(
      await this.settings.updateType(user.id, type, dto.enabled),
    );
  }

  @Post('settings/reset')
  async resetSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.view(await this.settings.reset(user.id));
  }

  @Get('push/vapid-key')
  vapidKey() {
    const key = this.push.getPublicKey();
    return { publicKey: key, configured: key !== null };
  }

  @Post('push/subscribe')
  async subscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushSubscribeDto,
  ) {
    return this.notifications.subscribePush(user.id, dto);
  }

  @Get('push/subscriptions')
  pushSubscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listPushSubscriptions(user.id);
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  async unsubscribeEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushUnsubscribeDto,
  ) {
    await this.notifications.unsubscribePushByEndpoint(user.id, dto.endpoint);
    return { success: true };
  }

  @Delete('push/subscribe/:id')
  async unsubscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.notifications.unsubscribePush(user.id, id);
    return { success: true };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('discord/webhook')
  async saveDiscordWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DiscordPersonalWebhookDto,
  ) {
    return this.view(await this.settings.saveDiscordWebhook(user.id, dto.url));
  }

  @Delete('discord/webhook')
  async deleteDiscordWebhook(@CurrentUser() user: AuthenticatedUser) {
    return this.view(await this.settings.deleteDiscordWebhook(user.id));
  }

  /// Проверочные отправки — не чаще 5 раз в 10 минут (не канал для спама).
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('discord/webhook/test')
  async testDiscordWebhook(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.testDiscordWebhook(user.id);
  }

  @Patch('digest')
  async updateDigest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDigestDto,
  ) {
    return this.view(await this.settings.updateDigest(user.id, dto));
  }

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('digest/test')
  async testDigest(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.sendDigestForUser(user.id);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/unread')
  async markUnread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markUnread(user.id, id);
  }

  /// Объявлены до `DELETE :id`, иначе `read` попадёт в параметр id.
  @Delete('read')
  async removeRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.removeRead(user.id);
  }

  @Delete()
  async clearAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.clearAll(user.id);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.id, id);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.notifications.remove(user.id, id);
    return { success: true };
  }
}
