import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const WILDCARD = '*' as const;

export interface EffectivePermissions {
  superuser: boolean;
  /// Пусто, если superuser === true (доступ решает только wildcard).
  permissions: string[];
  /// -Infinity, если у пользователя нет ни одной роли.
  maxPriority: number;
}

const CACHE_TTL_SECONDS = 300;

function cacheKeyUser(userId: string): string {
  return `perm:user:${userId}`;
}

function cacheKeyRoleUsers(roleId: string): string {
  return `perm:role-users:${roleId}`;
}

/// Единственная точка проверки superuser/effective permissions/priority-
/// иерархии (ADR-0004). Эффективные права считаются из БД и кешируются в
/// Redis (TTL ≤ 300 с, см. docs/technical/10-RBAC-PERMISSIONS.md §B.5);
/// инвалидация — немедленный DEL при изменении ролей/прав пользователя.
@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const cached = await this.redis.client.get(cacheKeyUser(userId));
    if (cached) {
      return JSON.parse(cached) as EffectivePermissions;
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    const superuser = userRoles.some((ur) => ur.role.isSuperuser);
    const maxPriority = userRoles.length
      ? Math.max(...userRoles.map((ur) => ur.role.priority))
      : Number.NEGATIVE_INFINITY;

    // На старте — только ALLOW (простое объединение); effect/priority-резолюция
    // для DENY закладывается в схему (RolePermission.effect), но не используется
    // здесь ещё, чтобы не усложнять раньше реальной необходимости (ADR-0004).
    const permissions = superuser
      ? []
      : Array.from(
          new Set(
            userRoles.flatMap((ur) =>
              ur.role.permissions
                .filter((rp) => rp.effect === 'ALLOW')
                .map((rp) => rp.permission.key),
            ),
          ),
        );

    const result: EffectivePermissions = {
      superuser,
      permissions,
      maxPriority,
    };

    await this.redis.client.set(
      cacheKeyUser(userId),
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );
    // Обратный индекс для инвалидации при изменении прав роли (см. invalidateRole).
    await Promise.all(
      userRoles.map((ur) =>
        this.redis.client.sadd(cacheKeyRoleUsers(ur.roleId), userId),
      ),
    );

    return result;
  }

  async isSuperuser(userId: string): Promise<boolean> {
    return (await this.getEffectivePermissions(userId)).superuser;
  }

  async hasPermission(userId: string, key: string): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.superuser || effective.permissions.includes(key);
  }

  async hasAllPermissions(userId: string, keys: string[]): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    if (effective.superuser) {
      return true;
    }
    return keys.every((key) => effective.permissions.includes(key));
  }

  async getMaxPriority(userId: string): Promise<number> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.superuser
      ? Number.POSITIVE_INFINITY
      : effective.maxPriority;
  }

  /// Разрешено ли actor выполнять административное действие над target
  /// (ban/edit/assign role и т.п.) — см. §B.4. Защищённый системный аккаунт
  /// (#0, accountType=SYSTEM) никогда не может быть целью, даже для superuser.
  async canActOn(actorId: string, targetUserId: string): Promise<boolean> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target || target.accountType === 'SYSTEM') {
      return false;
    }
    const [actorPriority, targetPriority] = await Promise.all([
      this.getMaxPriority(actorId),
      this.getMaxPriority(targetUserId),
    ]);
    return actorPriority > targetPriority;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.client.del(cacheKeyUser(userId));
  }

  /// Вызывать при изменении RolePermission/priority роли — отзывает кеш
  /// у всех пользователей, у кого эта роль назначена.
  async invalidateRole(roleId: string): Promise<void> {
    const key = cacheKeyRoleUsers(roleId);
    const userIds = await this.redis.client.smembers(key);
    if (userIds.length > 0) {
      await this.redis.client.del(...userIds.map(cacheKeyUser));
    }
    await this.redis.client.del(key);
  }
}
