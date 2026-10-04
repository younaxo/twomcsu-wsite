import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AchievementsService } from './achievements.service';

@Controller('moderation/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModerationAchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Post(':userId/achievements/:achievementId/grant')
  @RequirePermissions('users.achievements.grant')
  async grant(
    @Param('userId') userId: string,
    @Param('achievementId') achievementId: string,
  ) {
    await this.achievements.grantAchievement(userId, achievementId);
    return { success: true };
  }

  @Delete(':userId/achievements/:achievementId')
  @RequirePermissions('users.achievements')
  async revoke(
    @Param('userId') userId: string,
    @Param('achievementId') achievementId: string,
  ) {
    await this.achievements.revokeAchievement(userId, achievementId);
    return { success: true };
  }
}
