import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AchievementsService } from './achievements.service';
import { SetShowcaseDto } from './dto/set-showcase.dto';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('achievements')
@Controller('users')
export class UserAchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/achievements')
  async myAchievements(@CurrentUser() user: AuthenticatedUser) {
    return this.achievements.getUserAchievements(user.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username/achievements')
  async byUsername(@Param('username') username: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    const isOwner =
      !!viewer && viewer.username.toLowerCase() === username.toLowerCase();
    return this.achievements.getUserAchievementsByUsername(username, isOwner);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/achievements/showcase')
  async setShowcase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetShowcaseDto,
  ) {
    return this.achievements.setShowcase(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/achievements/showcase/:achievementId')
  async removeShowcase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('achievementId') achievementId: string,
  ) {
    await this.achievements.removeFromShowcase(user.id, achievementId);
    return { success: true };
  }
}
