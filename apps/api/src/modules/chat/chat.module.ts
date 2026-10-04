import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminChatController } from './admin-chat.controller';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ModerationService } from './moderation.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService, ModerationService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
