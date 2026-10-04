import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesController } from './roles.controller';
import { UserRolesController } from './user-roles.controller';

@Module({
  controllers: [RolesController, UserRolesController],
  providers: [PermissionService, PermissionsGuard],
  exports: [PermissionService],
})
export class RolesModule {}
