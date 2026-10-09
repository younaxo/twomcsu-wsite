import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { DashboardService } from './dashboard.service';
import { BroadcastDto } from './dto/broadcast.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';
import { UpsertSettingsDto } from './dto/upsert-settings.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  async getDashboard() {
    return this.dashboard.getDashboard();
  }

  @Get('audit-log')
  @RequirePermissions('audit_log.view')
  async auditLog(@Query() query: ListAuditLogQueryDto) {
    return this.audit.list(query);
  }

  @Get('audit-log/stats')
  @RequirePermissions('audit_log.stats')
  async auditStats() {
    return this.audit.getStats();
  }

  @Post('broadcast')
  @RequirePermissions('broadcast.create')
  @SkipAudit()
  async broadcast(
    @Body() dto: BroadcastDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.dashboard.broadcast(dto, admin.id);
  }

  @Get('settings')
  @RequirePermissions('settings.view')
  async getSettings() {
    return this.dashboard.getSettings();
  }

  @Patch('settings')
  @RequirePermissions('settings.edit')
  @SkipAudit()
  async updateSettings(
    @Body() dto: UpsertSettingsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.dashboard.upsertSettings(dto, admin.id);
  }
}
