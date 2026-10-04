import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [DirectMessagesController],
  providers: [DirectMessagesService, DirectMessagesGateway],
})
export class DirectMessagesModule {}
