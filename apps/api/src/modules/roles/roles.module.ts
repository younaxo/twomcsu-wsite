import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RoleBulkService } from './role-bulk.service';
import { RolesController } from './roles.controller';
import { UserRolesController } from './user-roles.controller';

/// Global: PermissionService/PermissionsGuard нужны практически любому
/// будущему доменному модулю с защищёнными endpoints — как и
/// Prisma/Redis/Email, это сквозная инфраструктура, а не доменная логика.
@Global()
@Module({
  controllers: [RolesController, UserRolesController],
  providers: [PermissionService, PermissionsGuard, RoleBulkService],
  exports: [PermissionService, PermissionsGuard],
})
export class RolesModule {}
