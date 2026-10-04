import { Module } from '@nestjs/common';
import { AchievementProgressService } from './achievement-progress.service';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';
import { AdminAchievementsController } from './admin-achievements.controller';
import { ModerationAchievementsController } from './moderation-achievements.controller';
import { UserAchievementsController } from './user-achievements.controller';

@Module({
  controllers: [
    AchievementsController,
    AdminAchievementsController,
    ModerationAchievementsController,
    UserAchievementsController,
  ],
  providers: [AchievementsService, AchievementProgressService],
  exports: [AchievementProgressService],
})
export class AchievementsModule {}
