import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AchievementsService } from './achievements.service';
import { ListAchievementsQueryDto } from './dto/list-achievements-query.dto';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@Query() query: ListAchievementsQueryDto, @Req() req: Request) {
    return this.achievements.getAllAchievements(
      viewerOf(req)?.id ?? null,
      query,
    );
  }

  @Get('stats')
  async stats() {
    return this.achievements.getStats();
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  async bySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.achievements.getAchievementBySlug(
      slug,
      viewerOf(req)?.id ?? null,
    );
  }
}
