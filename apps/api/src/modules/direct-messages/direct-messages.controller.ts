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
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { DirectMessagesService } from './direct-messages.service';
import { SiteModule } from '../system/site-module.decorator';

class ListMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

@SiteModule('direct-messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
  constructor(private readonly dm: DirectMessagesService) {}

  @Get('conversations')
  async listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.dm.listConversations(user.id);
  }

  @Post('conversations/direct')
  async createDirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.dm.createDirectConversation(user.id, dto);
  }

  @Post('conversations/group')
  async createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupConversationDto,
  ) {
    return this.dm.createGroupConversation(user.id, dto);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.dm.getConversation(user.id, id);
  }

  @Get('conversations/:id/messages')
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.dm.listMessages(
      user.id,
      id,
      query.page ?? 1,
      query.limit ?? 30,
    );
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.dm.sendMessage(user.id, id, dto);
  }

  @Post('conversations/:id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.dm.markRead(user.id, id);
  }

  @Delete('conversations/:id/leave')
  async leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.dm.leave(user.id, id);
    return { success: true };
  }

  @Post('conversations/:id/invites')
  async createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.dm.createInvite(user.id, id, dto);
  }

  @Get('invites/:code')
  async getInvite(@Param('code') code: string) {
    return this.dm.getInvite(code);
  }

  @Post('invites/:code/join')
  async joinInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ) {
    return this.dm.joinViaInvite(user.id, code);
  }

  @Delete('invites/:code')
  async revokeInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ) {
    await this.dm.revokeInvite(user.id, code);
    return { success: true };
  }

  @Patch('messages/:id')
  async editMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.dm.editMessage(user.id, id, dto);
  }

  @Delete('messages/:id')
  async deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.dm.deleteMessage(user.id, id);
    return { success: true };
  }

  @Post('messages/:id/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.dm.react(user.id, id, dto);
  }
}
