import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../roles/permission.service';
import { UpdateMaintenanceDto, UpdateSiteModuleDto } from './dto/system.dto';
import { SITE_MODULES, findSiteModule } from './site-modules.registry';
import { SiteStatusService } from './site-status.service';
import { MaintenanceState, SiteStatusStore } from './site-status.store';

const DEFAULT_MAINTENANCE = {
  title: 'Технические работы',
  message: 'Сайт временно недоступен. Работы ведутся, скоро всё заработает!',
};

/// Модули сайта и техработы (ADR-0082): реестр с состоянием, включение и
/// выключение по уровням (ядро нельзя, защищённые — с особым правом), техработы
/// полные/частичные. Каждое изменение — в аудит с diff.
@Injectable()
export class SystemService {
  constructor(
    private readonly store: SiteStatusStore,
    private readonly status: SiteStatusService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  async listModules() {
    const [rows, snapshot] = await Promise.all([
      this.store.getModules(),
      this.status.snapshot(),
    ]);
    return SITE_MODULES.map((definition) => {
      const row = rows.get(definition.key);
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        tier: definition.tier,
        enabled:
          definition.tier === 'core' || !snapshot.disabled.has(definition.key),
        reason: row?.reason ?? null,
        disabledAt: row?.disabledAt ?? null,
      };
    });
  }

  async updateModule(key: string, dto: UpdateSiteModuleDto, actorId: string) {
    const definition = findSiteModule(key);
    if (!definition) throw new NotFoundException('Модуль не найден');
    if (definition.tier === 'core') {
      throw new BadRequestException(
        'Модуль ядра нельзя выключить: без него не восстановить доступ к сайту',
      );
    }
    if (
      definition.tier === 'protected' &&
      !(await this.permissions.hasPermission(
        actorId,
        'system.modules.protected',
      ))
    ) {
      throw new ForbiddenException(
        'Для защищённого модуля нужно отдельное право',
      );
    }
    const before = (await this.listModules()).find((item) => item.key === key)!;
    const reason = dto.enabled ? null : dto.reason?.trim() || null;
    await this.store.setModule(
      key,
      { isEnabled: dto.enabled, reason },
      actorId,
    );
    this.status.invalidate();
    await this.audit.log({
      actorId,
      action: dto.enabled ? 'system.module.enable' : 'system.module.disable',
      targetType: 'SiteModule',
      targetId: key,
      severity: definition.tier === 'protected' ? 'critical' : 'warning',
      changes: {
        enabled: { from: before.enabled, to: dto.enabled },
        ...(reason ? { reason } : {}),
      },
    });
    return (await this.listModules()).find((item) => item.key === key)!;
  }

  private toDto(state: MaintenanceState | null) {
    return {
      enabled: state?.isEnabled ?? false,
      scope: state?.scope ?? 'full',
      modules: state?.modules ?? [],
      title: state?.title ?? DEFAULT_MAINTENANCE.title,
      message: state?.message ?? DEFAULT_MAINTENANCE.message,
      reason: state?.reason ?? null,
      startsAt: state?.startsAt ?? null,
      estimatedEnd: state?.estimatedEnd ?? null,
      active: SiteStatusService.isActive(state),
      enabledAt: state?.enabledAt ?? null,
      updatedAt: state?.updatedAt ?? null,
    };
  }

  async getMaintenance() {
    return this.toDto(await this.store.getMaintenance());
  }

  async updateMaintenance(dto: UpdateMaintenanceDto, actorId: string) {
    const modules = [...new Set(dto.modules)];
    for (const key of modules) {
      const definition = findSiteModule(key);
      if (!definition)
        throw new BadRequestException(`Неизвестный модуль: ${key}`);
      if (definition.tier === 'core') {
        throw new BadRequestException(
          `Модуль ядра «${definition.label}» не закрывается`,
        );
      }
    }
    if (dto.scope === 'partial' && dto.enabled && modules.length === 0) {
      throw new BadRequestException('Выберите модули для частичных работ');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const estimatedEnd = dto.estimatedEnd ? new Date(dto.estimatedEnd) : null;
    if (startsAt && estimatedEnd && startsAt >= estimatedEnd) {
      throw new BadRequestException('Начало должно быть раньше окончания');
    }
    const before = await this.getMaintenance();
    await this.store.setMaintenance(
      {
        isEnabled: dto.enabled,
        scope: dto.scope,
        modules: dto.scope === 'partial' ? modules : [],
        title: dto.title.trim(),
        message: dto.message.trim(),
        reason: dto.reason?.trim() || null,
        startsAt,
        estimatedEnd,
      },
      actorId,
    );
    this.status.invalidate();
    const after = await this.getMaintenance();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of [
      'enabled',
      'scope',
      'modules',
      'title',
      'message',
      'reason',
      'startsAt',
      'estimatedEnd',
    ] as const) {
      const plain = (value: unknown) =>
        value instanceof Date ? value.toISOString() : value;
      const from = plain(before[key]);
      const to = plain(after[key]);
      if (JSON.stringify(from) !== JSON.stringify(to))
        changes[key] = { from, to };
    }
    await this.audit.log({
      actorId,
      action:
        before.enabled === after.enabled
          ? 'system.maintenance.update'
          : after.enabled
            ? 'system.maintenance.enable'
            : 'system.maintenance.disable',
      targetType: 'Maintenance',
      targetId: 'global',
      severity:
        after.enabled && after.scope === 'full' ? 'critical' : 'warning',
      changes: changes as Prisma.InputJsonValue,
    });
    return after;
  }

  /// Публичный статус: без внутренней причины.
  async publicStatus() {
    const snapshot = await this.status.snapshot();
    const maintenance = snapshot.maintenance;
    return {
      maintenance: maintenance?.isEnabled
        ? {
            active: maintenance.active,
            scope: maintenance.scope,
            modules: maintenance.scope === 'partial' ? maintenance.modules : [],
            title: maintenance.title,
            message: maintenance.message,
            startsAt: maintenance.startsAt,
            estimatedEnd: maintenance.estimatedEnd,
          }
        : null,
      disabledModules: [...snapshot.disabled].sort(),
      serverTime: new Date().toISOString(),
    };
  }
}
