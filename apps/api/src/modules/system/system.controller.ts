import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { UpdateMaintenanceDto, UpdateSiteModuleDto } from './dto/system.dto';
import { SystemService } from './system.service';

/// «Система → Техработы и модули» (ADR-0082). Аудит — явный, внутри сервиса.
@Controller('admin/system')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemAdminController {
  constructor(private readonly system: SystemService) {}

  @Get('modules')
  @RequirePermissions('system.modules.view')
  modules() {
    return this.system.listModules();
  }

  @Patch('modules/:key')
  @SkipAudit()
  @RequirePermissions('system.modules.manage')
  updateModule(
    @Param('key') key: string,
    @Body() dto: UpdateSiteModuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.system.updateModule(key, dto, actor.id);
  }

  @Get('maintenance')
  @RequirePermissions('system.maintenance.view')
  maintenance() {
    return this.system.getMaintenance();
  }

  @Put('maintenance')
  @SkipAudit()
  @RequirePermissions('system.maintenance.manage')
  updateMaintenance(
    @Body() dto: UpdateMaintenanceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.system.updateMaintenance(dto, actor.id);
  }
}

/// Публичный статус сайта: техработы и выключенные модули.
@Controller('site')
export class SiteStatusController {
  constructor(private readonly system: SystemService) {}

  @Get('status')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  status() {
    return this.system.publicStatus();
  }
}
