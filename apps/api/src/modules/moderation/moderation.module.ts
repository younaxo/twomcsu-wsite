import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { CommentsModule } from '../comments/comments.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { ContentReportsController } from './content-reports.controller';
import { ContentReportsService } from './content-reports.service';
import { QuickModerationController } from './quick-moderation.controller';
import { QuickModerationService } from './quick-moderation.service';

@Module({
  imports: [AuthModule, ChatModule, CommentsModule, LeaderboardsModule],
  controllers: [QuickModerationController, ContentReportsController],
  providers: [QuickModerationService, ContentReportsService],
  exports: [QuickModerationService],
})
export class ModerationModule {}
