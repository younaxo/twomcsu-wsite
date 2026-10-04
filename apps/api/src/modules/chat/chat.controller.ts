import { Controller, Get, Param, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('channels')
  async listChannels() {
    return this.chat.listActiveChannels();
  }

  @Get('channels/:slug')
  async getChannel(@Param('slug') slug: string) {
    return this.chat.getChannelBySlug(slug);
  }

  @Get('channels/:slug/messages')
  async getMessages(
    @Param('slug') slug: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chat.listMessages(slug, query.page ?? 1, query.limit ?? 30);
  }

  @Get('channels/:slug/online')
  async getOnline(@Param('slug') slug: string) {
    const channel = await this.chat.getChannelBySlug(slug);
    const userIds = await this.chat.getOnlineUserIds(channel.id);
    return { userIds, count: userIds.length };
  }

  @Get('channels/:slug/pinned')
  async getPinned(@Param('slug') slug: string) {
    return this.chat.getPinned(slug);
  }
}
