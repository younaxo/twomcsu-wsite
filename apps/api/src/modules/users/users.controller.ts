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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, UserBadgeType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { GrantBadgeDto } from './dto/grant-badge.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateAccessLevelDto } from './dto/update-access-level.dto';

const SAFE_USER_SELECT = {
  id: true,
  shortId: true,
  tag: true,
  email: true,
  username: true,
  accessLevel: true,
  accountType: true,
  isBanned: true,
  isVerified: true,
  lastLoginAt: true,
  createdAt: true,
  position: true,
} satisfies Prisma.UserSelect;

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('users.view')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput | undefined = query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { tag: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  @Get(':id/full')
  async full(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        departments: { include: { department: true } },
        customPosition: { include: { customPosition: true } },
        roles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  /// Уровень доступа (ADR-0062) — отдельно от permissions и priority ролей.
  /// Защиты: системный аккаунт неизменяем; чужой уровень — только над теми,
  /// кого actor превосходит по иерархии, и не выше собственного уровня;
  /// свой — только с `users.access_level.edit_self`.
  @Patch(':id/access-level')
  @RequirePermissions('users.access_level.edit')
  @SkipAudit()
  async updateAccessLevel(
    @Param('id') id: string,
    @Body() dto: UpdateAccessLevelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const [target, actorRow, actorEffective] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        select: { id: true, accountType: true, accessLevel: true },
      }),
      this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { accessLevel: true },
      }),
      this.permissions.getEffectivePermissions(actor.id),
    ]);
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (target.accountType === 'SYSTEM') {
      throw new ForbiddenException('Системный аккаунт защищён от изменений');
    }
    const self = target.id === actor.id;
    if (self) {
      const canSelf = await this.permissions.hasPermission(
        actor.id,
        'users.access_level.edit_self',
      );
      if (!canSelf) {
        throw new ForbiddenException(
          'Изменение собственного уровня доступа требует отдельного полномочия',
        );
      }
    } else if (!actorEffective.superuser) {
      if (!(await this.permissions.canActOn(actor.id, id))) {
        throw new ForbiddenException(
          'Недостаточно приоритета над этим пользователем',
        );
      }
      const own = actorRow?.accessLevel ?? 0;
      if (dto.accessLevel > own || target.accessLevel > own) {
        throw new ForbiddenException(
          'Нельзя назначать уровень доступа выше собственного',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { accessLevel: dto.accessLevel },
      select: SAFE_USER_SELECT,
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'users.access_level.edit',
      targetType: 'User',
      targetId: id,
      severity: 'warning',
      changes: {
        accessLevel: { from: target.accessLevel, to: dto.accessLevel },
        self,
      },
    });
    return updated;
  }

  @Get(':userId/badges')
  @RequirePermissions('users.badges')
  async listBadges(@Param('userId') userId: string) {
    return this.prisma.userBadge.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
  }

  @Post(':userId/badges')
  @RequirePermissions('users.badges')
  async grantBadge(
    @Param('userId') userId: string,
    @Body() dto: GrantBadgeDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.prisma.userBadge.upsert({
      where: { userId_type: { userId, type: dto.type } },
      create: {
        userId,
        type: dto.type,
        grantedBy: admin.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      update: {
        isActive: true,
        grantedBy: admin.id,
        grantedAt: new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  @Delete(':userId/badges/:type')
  @RequirePermissions('users.badges')
  async revokeBadge(
    @Param('userId') userId: string,
    @Param('type') type: UserBadgeType,
  ) {
    const badge = await this.prisma.userBadge.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (!badge) {
      throw new NotFoundException('Бейдж не найден у этого пользователя');
    }
    await this.prisma.userBadge.delete({ where: { id: badge.id } });
    return { success: true };
  }
}
