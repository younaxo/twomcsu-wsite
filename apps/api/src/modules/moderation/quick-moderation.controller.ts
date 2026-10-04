import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { BanUserDto } from './dto/ban-user.dto';
import { HardDeleteDto } from './dto/hard-delete.dto';
import { KickUserDto } from './dto/kick-user.dto';
import { MuteUserDto } from './dto/mute-user.dto';
import { WarnUserDto } from './dto/warn-user.dto';
import { QuickModerationService } from './quick-moderation.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuickModerationController {
  constructor(private readonly moderation: QuickModerationService) {}

  @Post('moderation/users/:userId/mute')
  @RequirePermissions('users.mute')
  async mute(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MuteUserDto,
  ) {
    return this.moderation.mute(userId, user.id, dto);
  }

  @Post('moderation/users/:userId/warn')
  @RequirePermissions('users.warn')
  async warn(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WarnUserDto,
  ) {
    return this.moderation.warn(userId, user.id, dto);
  }

  @Post('moderation/messages/:messageId/hard-delete')
  @RequirePermissions('messages.hard_delete')
  async hardDeleteMessage(
    @Param('messageId') messageId: string,
    @Body() _dto: HardDeleteDto,
  ) {
    return this.moderation.hardDeleteMessage(messageId);
  }

  @Post('moderation/comments/:commentId/hard-delete')
  @RequirePermissions('comments.hard_delete')
  async hardDeleteComment(
    @Param('commentId') commentId: string,
    @Body() _dto: HardDeleteDto,
  ) {
    return this.moderation.hardDeleteComment(commentId);
  }

  @Post('moderation/users/:userId/kick')
  @RequirePermissions('users.kick')
  async kick(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: KickUserDto,
  ) {
    return this.moderation.kick(userId, user.id, dto);
  }

  @Post('moderation/users/:userId/ban')
  @RequirePermissions('users.ban')
  async ban(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BanUserDto,
  ) {
    return this.moderation.ban(userId, user.id, dto);
  }

  @Delete('admin/users/:userId')
  @RequirePermissions('users.delete')
  async deleteAccount(@Param('userId') userId: string) {
    return this.moderation.deleteAccount(userId);
  }
}
