import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
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
import { SelectDecorationDto } from './dto/select-decoration.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertSocialLinkDto } from './dto/upsert-social-link.dto';
import { ProfilesService } from './profiles.service';

@Controller('users')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':username/public')
  async getPublic(@Param('username') username: string, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser }).user;
    return this.profiles.getPublicProfile(username, viewer?.id ?? null);
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
}
