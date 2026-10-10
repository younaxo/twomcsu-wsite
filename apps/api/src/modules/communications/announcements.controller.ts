import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AnnouncementsService } from './announcements.service';
import {
  ListAnnouncementsQueryDto,
  PublicAnnouncementsQueryDto,
  UpsertAnnouncementDto,
} from './dto/announcement.dto';

/// Управление объявлениями (ADR-0081). Аудит — явный, с diff, внутри сервиса.
@Controller('admin/communications/announcements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnnouncementsAdminController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermissions('announcements.view')
  list(@Query() query: ListAnnouncementsQueryDto) {
    return this.announcements.list(query.page ?? 1, query.limit ?? 50);
  }

  @Post()
  @HttpCode(201)
  @SkipAudit()
  @RequirePermissions('announcements.manage')
  create(
    @Body() dto: UpsertAnnouncementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.announcements.create(dto, actor.id);
  }

  @Patch(':id')
  @SkipAudit()
  @RequirePermissions('announcements.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpsertAnnouncementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.announcements.update(id, dto, actor.id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @SkipAudit()
  @RequirePermissions('announcements.manage')
  publish(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.publish(id, actor.id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @SkipAudit()
  @RequirePermissions('announcements.manage')
  unpublish(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.unpublish(id, actor.id);
  }

  @Delete(':id')
  @SkipAudit()
  @RequirePermissions('announcements.manage')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.announcements.remove(id, actor.id);
  }
}

/// Публичные активные объявления для зрителя (гость — без токена).
@Controller('site/announcements')
export class PublicAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: PublicAnnouncementsQueryDto, @Req() req: Request) {
    const viewer = (req as Request & { user?: AuthenticatedUser | null }).user;
    return this.announcements.listPublic(
      query.placement ?? 'banner',
      viewer?.id ?? null,
    );
  }
}
