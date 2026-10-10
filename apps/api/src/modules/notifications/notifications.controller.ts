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
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SiteModule } from '../system/site-module.decorator';
import { PushUnsubscribeDto } from './dto/push-unsubscribe.dto';

@SiteModule('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly settings: NotificationSettingsService,
    private readonly push: PushService,
  ) {}

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
    return this.settings.getOrCreate(user.id);
  }

  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.settings.update(user.id, dto);
  }

  @Patch('settings/type/:type')
  async updateTypeSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Body() dto: UpdateTypeSettingDto,
  ) {
    return this.settings.updateType(user.id, type, dto.enabled);
  }

  @Post('settings/reset')
  async resetSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.reset(user.id);
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

  @Post('discord/webhook')
  async saveDiscordWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DiscordPersonalWebhookDto,
  ) {
    return this.settings.saveDiscordWebhook(user.id, dto.url);
  }

  @Delete('discord/webhook')
  async deleteDiscordWebhook(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.deleteDiscordWebhook(user.id);
  }

  @Post('discord/webhook/test')
  async testDiscordWebhook(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.testDiscordWebhook(user.id);
  }

  @Patch('digest')
  async updateDigest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDigestDto,
  ) {
    return this.settings.updateDigest(user.id, dto);
  }

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
