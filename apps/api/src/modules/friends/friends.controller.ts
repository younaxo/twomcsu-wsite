import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.listFriends(user.id);
  }

  @Delete(':userId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    await this.friends.removeFriend(user.id, userId);
    return { success: true };
  }

  @Get('blocked')
  async listBlocked(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.listBlocked(user.id);
  }

  @Post('block/:userId')
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    await this.friends.block(user.id, userId);
    return { success: true };
  }

  @Delete('block/:userId')
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    await this.friends.unblock(user.id, userId);
    return { success: true };
  }

  @Get('requests/incoming')
  async incoming(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.listIncomingRequests(user.id);
  }

  @Get('requests/incoming/count')
  async incomingCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.friends.incomingCount(user.id) };
  }

  @Get('requests/outgoing')
  async outgoing(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.listOutgoingRequests(user.id);
  }

  @Post('requests/:username')
  async sendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
  ) {
    return this.friends.sendRequest(user.id, username);
  }

  @Post('requests/:id/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.friends.acceptRequest(user.id, id);
  }

  @Delete('requests/:id')
  async removeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.friends.removeRequest(user.id, id);
    return { success: true };
  }
}
