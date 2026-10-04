import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AssignRoleDto } from './dto/assign-role.dto';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionService } from './permission.service';

@Controller('admin/users/:userId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserRolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  @Get('effective-permissions')
  @RequirePermissions('roles.view')
  async effectivePermissions(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.permissions.getEffectivePermissions(userId);
  }

  @Post('roles/:roleId')
  @RequirePermissions('roles.assign')
  async assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Body() dto: AssignRoleDto,
  ) {
    const [role, target] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (!role.isAssignable) {
      throw new ForbiddenException('Эта роль не может быть назначена');
    }

    const actorEffective = await this.permissions.getEffectivePermissions(
      actor.id,
    );
    if (!actorEffective.superuser) {
      if (role.priority >= actorEffective.maxPriority) {
        throw new ForbiddenException(
          'Нельзя выдать роль с priority выше или равным собственному',
        );
      }
      const canAct = await this.permissions.canActOn(actor.id, userId);
      if (!canAct) {
        throw new ForbiddenException(
          'Недостаточно приоритета над этим пользователем',
        );
      }
    } else if (target.accountType === 'SYSTEM') {
      throw new ForbiddenException(
        'Системный аккаунт защищён от изменения ролей',
      );
    }

    await this.prisma.$transaction([
      this.prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId, assignedBy: actor.id },
        update: {},
      }),
      this.prisma.roleAssignmentLog.create({
        data: {
          userId,
          roleId,
          action: 'GRANTED',
          actorId: actor.id,
          reason: dto.reason,
        },
      }),
    ]);
    await this.permissions.invalidateUser(userId);

    return { success: true };
  }

  @Delete('roles/:roleId')
  @RequirePermissions('roles.assign')
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }

    const actorEffective = await this.permissions.getEffectivePermissions(
      actor.id,
    );
    if (!actorEffective.superuser) {
      if (role.priority >= actorEffective.maxPriority) {
        throw new ForbiddenException(
          'Нельзя снять роль с priority выше или равным собственному',
        );
      }
      const canAct = await this.permissions.canActOn(actor.id, userId);
      if (!canAct) {
        throw new ForbiddenException(
          'Недостаточно приоритета над этим пользователем',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId, roleId } }),
      this.prisma.roleAssignmentLog.create({
        data: { userId, roleId, action: 'REVOKED', actorId: actor.id },
      }),
    ]);
    await this.permissions.invalidateUser(userId);

    return { success: true };
  }
}
