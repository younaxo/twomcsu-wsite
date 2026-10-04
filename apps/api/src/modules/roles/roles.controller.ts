import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionService } from './permission.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  @Get('roles')
  @RequirePermissions('roles.view')
  async list() {
    return this.prisma.role.findMany({ orderBy: { priority: 'desc' } });
  }

  @Get('permissions')
  @RequirePermissions('permissions.manage')
  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
  }

  @Get('roles/:id')
  @RequirePermissions('roles.view')
  async get(@Param('id') id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
    return role;
  }

  @Get('roles/:id/history')
  @RequirePermissions('roles.history.view')
  async history(@Param('id') id: string) {
    return this.prisma.roleAssignmentLog.findMany({
      where: { roleId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
  ) {
    const actorPriority = await this.permissions.getMaxPriority(actor.id);
    if (dto.priority >= actorPriority) {
      throw new ForbiddenException(
        'Нельзя создать роль с priority выше или равным собственному',
      );
    }
    return this.prisma.role.create({ data: dto });
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.edit')
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }

    const actorPriority = await this.permissions.getMaxPriority(actor.id);
    if (role.priority >= actorPriority) {
      throw new ForbiddenException(
        'Редактировать роль можно только ниже собственного priority',
      );
    }
    if (dto.priority !== undefined && dto.priority >= actorPriority) {
      throw new ForbiddenException(
        'Нельзя повысить роль до priority выше или равного собственному',
      );
    }

    const updated = await this.prisma.role.update({ where: { id }, data: dto });
    await this.permissions.invalidateRole(id);
    return updated;
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.delete')
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
    if (role.isSystem) {
      throw new ForbiddenException('Системную роль нельзя удалить');
    }
    const actorPriority = await this.permissions.getMaxPriority(actor.id);
    if (role.priority >= actorPriority) {
      throw new ForbiddenException(
        'Удалить роль можно только ниже собственного priority',
      );
    }

    await this.prisma.role.delete({ where: { id } });
    await this.permissions.invalidateRole(id);
    return { success: true };
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('permissions.manage')
  async setPermissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }

    const actorEffective = await this.permissions.getEffectivePermissions(
      actor.id,
    );
    if (role.isSystem && !actorEffective.superuser) {
      throw new ForbiddenException(
        'Права системной роли может менять только superuser',
      );
    }
    if (
      role.priority >= actorEffective.maxPriority &&
      !actorEffective.superuser
    ) {
      throw new ForbiddenException(
        'Редактировать роль можно только ниже собственного priority',
      );
    }
    // Выдавать permission можно только если он есть у самого актёра (ADR-0004, §B.4).
    if (!actorEffective.superuser) {
      const missing = dto.permissionKeys.filter(
        (key) => !actorEffective.permissions.includes(key),
      );
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Нельзя выдать роли права, которых нет у вас самих: ${missing.join(', ')}`,
        );
      }
    }

    const permissionRecords = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissionKeys } },
    });
    const foundKeys = new Set(permissionRecords.map((p) => p.key));
    const unknown = dto.permissionKeys.filter((key) => !foundKeys.has(key));
    if (unknown.length > 0) {
      throw new NotFoundException(
        `Неизвестные permission keys: ${unknown.join(', ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissionRecords.map((p) => ({
          roleId: id,
          permissionId: p.id,
        })),
      }),
    ]);
    await this.permissions.invalidateRole(id);

    return this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  }
}
