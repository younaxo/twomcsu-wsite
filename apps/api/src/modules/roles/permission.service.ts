import { ForbiddenException, Injectable } from '@nestjs/common';
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

export interface SanctionRevokeDecision {
  allowed: boolean;
  /// Владелец снял санкцию, выданную не им (или без известного выдавшего).
  ownerOverride: boolean;
  /// Цель снятия — сам действующий.
  self: boolean;
  /// Выдавший известен (запись есть, пользователь существует, не SYSTEM).
  issuerKnown: boolean;
}

export const SANCTION_REVOKE_FORBIDDEN_CODE = 'sanction_revoke_forbidden';

/// Metadata записи аудита при снятии санкции (Q48/Q49): кто выдал (или
/// «нет записи»), владельческое переопределение, снятие с себя.
export function sanctionRevokeAuditChanges(
  decision: SanctionRevokeDecision,
  issuerId: string | null | undefined,
  extra: Record<string, string | number | boolean | null> = {},
): Record<string, string | number | boolean | null> {
  return {
    ...extra,
    issuerId: issuerId || 'нет записи',
    ownerOverride: decision.ownerOverride,
    self: decision.self,
  };
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
      const parsed = JSON.parse(cached) as Omit<
        EffectivePermissions,
        'maxPriority'
      > & { maxPriority: number | null };
      // JSON.stringify(-Infinity) даёт null, а null в сравнениях равен 0:
      // восстанавливаем «нет ролей» как -Infinity (L9, ревью Q25).
      return {
        ...parsed,
        maxPriority:
          typeof parsed.maxPriority === 'number'
            ? parsed.maxPriority
            : Number.NEGATIVE_INFINITY,
      };
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

  /// Единое правило снятия санкции — мут/бан чата, бан аккаунта, бан в
  /// обращениях, массовое снятие (Q25, Q48, Q49; ADR-0173). Порядок:
  /// 1) действующий — владелец (isSuperuser): разрешено всегда, в т.ч. с себя;
  /// 2) выдавший неизвестен (нет записи, пользователь удалён, SYSTEM): только
  ///    владелец;
  /// 3) цель — сам действующий, а выдал не он: запрещено (Q49);
  /// 4) действующий — сам выдавший: разрешено;
  /// 5) иначе — приоритет действующего >= приоритета выдавшего.
  /// `ownerOverride` — владелец снял санкцию, выданную не им самим (или без
  /// известного выдавшего); `self` — цель совпадает с действующим.
  async evaluateSanctionRevoke(
    actorId: string,
    issuerId: string | null | undefined,
    targetUserId?: string,
  ): Promise<SanctionRevokeDecision> {
    const self = targetUserId !== undefined && targetUserId === actorId;
    const issuer = issuerId
      ? await this.prisma.user.findUnique({
          where: { id: issuerId },
          select: { id: true, accountType: true },
        })
      : null;
    const issuerKnown = Boolean(issuer) && issuer?.accountType !== 'SYSTEM';
    if (await this.isSuperuser(actorId)) {
      // issuerKnown отражает факт (запись есть, пользователь существует, не
      // SYSTEM); на доступ владельца он не влияет.
      return {
        allowed: true,
        ownerOverride: !issuerId || issuerId !== actorId,
        self,
        issuerKnown,
      };
    }
    const deny = {
      allowed: false,
      ownerOverride: false,
      self,
      issuerKnown,
    };
    if (!issuer || issuer.accountType === 'SYSTEM') {
      return deny;
    }
    if (self && issuer.id !== actorId) {
      return deny;
    }
    if (issuer.id === actorId) {
      return { ...deny, allowed: true };
    }
    const [actorPriority, issuerPriority] = await Promise.all([
      this.getMaxPriority(actorId),
      this.getMaxPriority(issuer.id),
    ]);
    return { ...deny, allowed: actorPriority >= issuerPriority };
  }

  /// Как evaluateSanctionRevoke, но при отказе бросает 403
  /// `sanction_revoke_forbidden` (текст общий, роли не раскрываются).
  async assertCanRevokeSanction(
    actorId: string,
    issuerId: string | null | undefined,
    targetUserId?: string,
  ): Promise<SanctionRevokeDecision> {
    const decision = await this.evaluateSanctionRevoke(
      actorId,
      issuerId,
      targetUserId,
    );
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: SANCTION_REVOKE_FORBIDDEN_CODE,
        message: 'Недостаточно прав для снятия этого ограничения',
      });
    }
    return decision;
  }

  async canRevokeSanction(
    actorId: string,
    issuerId: string | null | undefined,
    targetUserId?: string,
  ): Promise<boolean> {
    return (await this.evaluateSanctionRevoke(actorId, issuerId, targetUserId))
      .allowed;
  }

  /// Выдача роли пользователю (Q23, ADR-0170): права выдаваемой роли должны
  /// входить в эффективные права выдающего. Владелец (роль isSuperuser) —
  /// исключение. Роль с полным доступом (isSuperuser) может выдать только
  /// владелец; право '*' (WILDCARD) у выдающего покрывает любые права.
  /// Бросает 403 `role_permissions_exceed_grantor`.
  async assertGrantorCoversRole(
    grantorId: string,
    role: { id: string; isSuperuser: boolean },
  ): Promise<void> {
    const grantor = await this.getEffectivePermissions(grantorId);
    if (grantor.superuser) {
      return;
    }
    if (role.isSuperuser) {
      throw new ForbiddenException({
        code: 'role_permissions_exceed_grantor',
        message: 'Роль с полным доступом может выдать только владелец',
        missing: [WILDCARD],
      });
    }
    if (grantor.permissions.includes(WILDCARD)) {
      return;
    }
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id, effect: 'ALLOW' },
      include: { permission: true },
    });
    const own = new Set(grantor.permissions);
    const missing = rolePermissions
      .map((rp) => rp.permission.key)
      .filter((key) => !own.has(key))
      .sort();
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'role_permissions_exceed_grantor',
        message: `Нельзя выдать роль с правами, которых нет у вас самих: ${missing.join(', ')}`,
        missing,
      });
    }
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
