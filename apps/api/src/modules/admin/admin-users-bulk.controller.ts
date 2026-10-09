import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AdminUsersBulkService } from './admin-users-bulk.service';
import { BulkUsersDto } from './dto/bulk-users.dto';

/// Отдельный controller-класс на том же префиксе `admin/users`, что и
/// UsersController (modules/users) — ровно тот же паттерн, что и
/// MediaRequestsController в PHASE 19 (разные классы, разные под-пути,
/// коллизий нет).
@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminUsersBulkController {
  constructor(private readonly bulk: AdminUsersBulkService) {}

  @Patch('bulk')
  @RequirePermissions('users.bulk.edit')
  @SkipAudit()
  async bulkUsers(
    @Body() dto: BulkUsersDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.bulk.bulkUpdate(dto, admin.id);
  }
}
