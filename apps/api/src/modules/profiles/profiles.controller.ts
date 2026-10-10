import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateMediaRequestDto } from './dto/create-media-request.dto';
import { CreateProfileReportDto } from './dto/create-profile-report.dto';
import { ProfileReactionDto } from './dto/profile-reaction.dto';
import { SelectDecorationDto } from './dto/select-decoration.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertSocialLinkDto } from './dto/upsert-social-link.dto';
import { ProfilesService } from './profiles.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('profiles')
@Controller('users')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username/public')
  async getPublic(@Param('username') username: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.profiles.getPublicProfile(username, viewer?.id ?? null);
  }

  /// Короткая карточка для превью профиля (ник → popover/sheet): роли,
  /// онлайн, статистика (если не скрыта), счётчики. Скрытый профиль — только
  /// `{ username, hidden: true }`.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username/summary')
  async summary(@Param('username') username: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.profiles.getProfileSummary(username, viewer?.id ?? null);
  }

  /// Витрина «Награды и значки» (ADR-0100): реальные награды пользователя и
  /// выставленные им завершённые достижения. Скрытый профиль — 404.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username/showcase')
  async showcase(@Param('username') username: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.profiles.getShowcase(username, viewer?.id ?? null);
  }

  /// Просмотр профиля (B5): свой не считается, повтор не дублирует.
  @UseGuards(JwtAuthGuard)
  @Post(':username/view')
  async view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
  ) {
    return this.profiles.recordView(username, user.id);
  }

  /// Лайк / дизлайк / снять (B5).
  @UseGuards(JwtAuthGuard)
  @Put(':username/reaction')
  async reaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
    @Body() dto: ProfileReactionDto,
  ) {
    return this.profiles.react(username, user.id, dto.type);
  }

  /// Жалоба на профиль — часть модуля сайта «Жалобы и обращения»: при
  /// выключенном модуле 503, как у остальных жалоб.
  @SiteModule('reports')
  @UseGuards(JwtAuthGuard)
  @Post(':username/report')
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
    @Body() dto: CreateProfileReportDto,
  ) {
    return this.profiles.report(user.id, username, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  async getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getOwnProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  async updateOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.updateOwnProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/social-links')
  async listSocialLinks(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.listSocialLinks(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/social-links/:platform')
  async upsertSocialLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform', new ParseEnumPipe(SocialPlatform))
    platform: SocialPlatform,
    @Body() dto: UpsertSocialLinkDto,
  ) {
    return this.profiles.upsertSocialLink(user.id, platform, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/social-links/:platform')
  async removeSocialLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform', new ParseEnumPipe(SocialPlatform))
    platform: SocialPlatform,
  ) {
    await this.profiles.removeSocialLink(user.id, platform);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/decorations')
  async listOwnedDecorations(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.listOwnedDecorations(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/decoration')
  async selectDecoration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectDecorationDto,
  ) {
    return this.profiles.selectDecoration(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/media-request')
  async createMediaRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMediaRequestDto,
  ) {
    return this.profiles.createMediaRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/media-requests')
  async listMediaRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.listMyMediaRequests(user.id);
  }
}
