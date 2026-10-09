import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkRolePermissionsDto } from './dto/bulk-role-permissions.dto';
import { PermissionService } from './permission.service';

export interface BulkRoleChange {
  id: string;
  name: string;
  added: string[];
  removed: string[];
}

/// Массовое редактирование прав ролей (ADR-0068).
///
/// Операция атомарна: либо все выбранные роли получают изменения в одной
/// транзакции, либо ни одна (защищённые роли блокируют всю операцию с
/// перечнем причин — ничего не пропускается молча).
@Injectable()
export class RoleBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async editPermissions(dto: BulkRolePermissionsDto, actorId: string) {
    const add = dto.add ?? [];
    const remove = dto.remove ?? [];
    const replace = dto.replace;

    if (replace !== undefined) {
      if (add.length > 0 || remove.length > 0) {
        throw new BadRequestException(
          'Замена набора прав не сочетается с добавлением/удалением',
        );
      }
      if (dto.confirmReplace !== true) {
        throw new BadRequestException(
          'Полная замена прав требует отдельного подтверждения (confirmReplace)',
        );
      }
    } else if (add.length === 0 && remove.length === 0) {
      throw new BadRequestException(
        'Не указано, какие права добавить или убрать',
      );
    }
    const overlap = add.filter((key) => remove.includes(key));
    if (overlap.length > 0) {
      throw new BadRequestException(
        `Одно и то же право нельзя и добавить, и убрать: ${overlap.join(', ')}`,
      );
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds } },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== dto.roleIds.length) {
      throw new NotFoundException('Часть выбранных ролей не найдена');
    }

    const actor = await this.permissions.getEffectivePermissions(actorId);
    const blocked: string[] = [];
    for (const role of roles) {
      if (role.isSuperuser) {
        blocked.push(
          `${role.displayName}: роль с полным доступом — права не редактируются`,
        );
      } else if (role.isSystem && !actor.superuser) {
        blocked.push(`${role.displayName}: системная роль — только superuser`);
      } else if (!actor.superuser && role.priority >= actor.maxPriority) {
        blocked.push(`${role.displayName}: priority не ниже вашего`);
      }
    }
    if (blocked.length > 0) {
      throw new ForbiddenException({
        message: 'Операция отменена: часть ролей нельзя изменить',
        blocked,
      });
    }

    const granted = replace ?? add;
    if (!actor.superuser) {
      const missing = granted.filter((key) => !actor.permissions.includes(key));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Нельзя выдать права, которых нет у вас самих: ${missing.join(', ')}`,
        );
      }
    }

    const keys = [...new Set([...add, ...remove, ...(replace ?? [])])];
    const records = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(records.map((p) => [p.key, p.id]));
    // Права, которые уходят при replace/remove, могут не входить в запрос —
    // их id берём из текущих прав ролей.
    for (const role of roles) {
      for (const rp of role.permissions) {
        byKey.set(rp.permission.key, rp.permissionId);
      }
    }
    const known = new Set(records.map((p) => p.key));
    const unknown = keys.filter((key) => !known.has(key));
    if (unknown.length > 0) {
      throw new NotFoundException(
        `Неизвестные permission keys: ${unknown.join(', ')}`,
      );
    }

    const changes: BulkRoleChange[] = roles.map((role) => {
      const current = new Set(role.permissions.map((rp) => rp.permission.key));
      const target = replace
        ? new Set(replace)
        : new Set([...[...current].filter((k) => !remove.includes(k)), ...add]);
      return {
        id: role.id,
        name: role.displayName,
        added: [...target].filter((k) => !current.has(k)).sort(),
        removed: [...current].filter((k) => !target.has(k)).sort(),
      };
    });

    await this.prisma.$transaction(
      changes.flatMap((change) => [
        this.prisma.rolePermission.deleteMany({
          where: {
            roleId: change.id,
            permissionId: {
              in: change.removed.map((key) => byKey.get(key) as string),
            },
          },
        }),
        this.prisma.rolePermission.createMany({
          data: change.added.map((key) => ({
            roleId: change.id,
            permissionId: byKey.get(key) as string,
          })),
          skipDuplicates: true,
        }),
      ]),
    );
    await Promise.all(
      roles.map((role) => this.permissions.invalidateRole(role.id)),
    );

    // Audit: одно родительское событие + по событию на каждую изменённую роль
    // (компактные diff вместо одного огромного JSON).
    await this.audit.log({
      actorId,
      action: 'roles.bulk.permissions',
      targetType: 'Role',
      severity: 'warning',
      changes: {
        mode: replace ? 'replace' : 'patch',
        roleIds: dto.roleIds,
        add,
        remove,
        ...(replace ? { replace } : {}),
      },
    });
    for (const change of changes) {
      if (change.added.length > 0 || change.removed.length > 0) {
        await this.audit.log({
          actorId,
          action: 'roles.permissions.update',
          targetType: 'Role',
          targetId: change.id,
          severity: 'warning',
          changes: { added: change.added, removed: change.removed, bulk: true },
        });
      }
    }
    return { updated: changes };
  }
}
