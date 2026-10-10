import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import {
  StorageCleanupDto,
  StorageCleanupPreviewDto,
  UpdateStorageRetentionDto,
} from './dto/system.dto';
import { StorageRetentionService } from './storage-retention.service';

/// «Система → Хранилище и журналы» (ADR-0084). Аудит — явный, в сервисе.
@Controller('admin/system/storage')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StorageAdminController {
  constructor(private readonly retention: StorageRetentionService) {}

  @Get()
  @RequirePermissions('system.storage.view')
  overview() {
    return this.retention.overview();
  }

  @Patch()
  @SkipAudit()
  @RequirePermissions('system.storage.manage')
  update(
    @Body() dto: UpdateStorageRetentionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.retention.update(dto, actor.id);
  }

  @Post('preview')
  @HttpCode(200)
  @SkipAudit()
  @RequirePermissions('system.storage.view')
  preview(@Body() dto: StorageCleanupPreviewDto) {
    return this.retention.preview(dto.category, dto.olderThanDays);
  }

  @Post('cleanup')
  @HttpCode(200)
  @SkipAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('system.storage.manage')
  cleanup(
    @Body() dto: StorageCleanupDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.retention.cleanup(
      dto.category,
      dto.olderThanDays,
      dto.confirmCount,
      actor.id,
    );
  }
}
