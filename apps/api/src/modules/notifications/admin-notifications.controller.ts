import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AdminNotificationsService } from './admin-notifications.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { DiscordService } from './discord.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminNotificationsController {
  constructor(
    private readonly discord: DiscordService,
    private readonly admin: AdminNotificationsService,
  ) {}

  @Get('webhooks')
  @RequirePermissions('notifications.webhooks.view')
  async listWebhooks() {
    return this.discord.listWebhooks();
  }

  @Post('webhooks')
  @RequirePermissions('notifications.webhooks.create')
  async createWebhook(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.discord.createWebhook(actor.id, dto);
  }

  @Patch('webhooks/:id')
  @RequirePermissions('notifications.webhooks.edit')
  async updateWebhook(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.discord.updateWebhook(id, dto);
  }

  @Delete('webhooks/:id')
  @RequirePermissions('notifications.webhooks.delete')
  async deleteWebhook(@Param('id') id: string) {
    await this.discord.deleteWebhook(id);
    return { success: true };
  }

  @Post('broadcast')
  @RequirePermissions('notifications.broadcast')
  async broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.admin.broadcast(dto);
  }

  @Get('stats')
  @RequirePermissions('notifications.stats.view')
  async stats() {
    return this.admin.stats();
  }
}
