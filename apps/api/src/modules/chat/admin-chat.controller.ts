import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateChannelDto } from './dto/create-channel.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ModerationService } from './moderation.service';

@Controller('admin/chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminChatController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('channels')
  @RequirePermissions('chat.channels.create')
  async createChannel(@Body() dto: CreateChannelDto) {
    return this.moderation.createChannel(dto);
  }

  @Patch('channels/:id')
  @RequirePermissions('chat.channels.edit')
  async updateChannel(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.moderation.updateChannel(id, dto);
  }

  @Delete('channels/:id')
  @RequirePermissions('chat.channels.delete')
  async deleteChannel(@Param('id') id: string) {
    await this.moderation.removeChannel(id);
    return { success: true };
  }

  @Get('mutes')
  @RequirePermissions('chat.mutes.view')
  async listMutes() {
    return this.moderation.listMutes();
  }

  @Delete('mutes/:id')
  @RequirePermissions('chat.mutes.delete')
  async unmute(@Param('id') id: string) {
    await this.moderation.unmute(id);
    return { success: true };
  }

  @Get('bans')
  @RequirePermissions('chat.bans.view')
  async listBans() {
    return this.moderation.listBans();
  }

  @Delete('bans/:id')
  @RequirePermissions('chat.bans.delete')
  async unban(@Param('id') id: string) {
    await this.moderation.unban(id);
    return { success: true };
  }

  @Get('messages/search')
  @RequirePermissions('chat.messages.search.view')
  async search(@Query() query: SearchMessagesQueryDto) {
    return this.moderation.searchMessages(
      query.q,
      query.page ?? 1,
      query.limit ?? 30,
    );
  }

  @Get('messages/:id')
  @RequirePermissions('chat.messages.view')
  async getMessage(@Param('id') id: string) {
    return this.moderation.getMessageById(id);
  }
}
