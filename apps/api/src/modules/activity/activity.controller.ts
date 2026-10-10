import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivityService } from './activity.service';
import { CreateActivityCommentDto } from './dto/create-activity-comment.dto';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';
import { ReactActivityDto } from './dto/react-activity.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';
import { SiteModule } from '../system/site-module.decorator';

function viewerIdOf(req: Request): string | null {
  return (req as Request & { user?: AuthenticatedUser }).user?.id ?? null;
}

@SiteModule('activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  // Литеральные маршруты объявлены раньше ':id', иначе Nest примет
  // 'feed'/'settings' за значение параметра :id.
  @Public()
  @Get('feed')
  async globalFeed(@Query() query: ListActivityQueryDto) {
    return this.activity.listGlobalFeed(query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed/user/:username')
  async userFeed(
    @Param('username') username: string,
    @Query() query: ListActivityQueryDto,
    @Req() req: Request,
  ) {
    return this.activity.listUserFeed(
      username,
      viewerIdOf(req),
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.activity.getSettings(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateActivitySettingsDto,
  ) {
    return this.activity.updateSettings(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  async removeComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.activity.removeComment(user.id, id);
    return { success: true };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: Request) {
    return this.activity.getOne(id, viewerIdOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactActivityDto,
  ) {
    return this.activity.react(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comments')
  async comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateActivityCommentDto,
  ) {
    return this.activity.comment(user.id, id, dto);
  }
}
