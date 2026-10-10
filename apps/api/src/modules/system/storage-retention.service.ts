import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountType, Prisma, StorageRetention } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';

export type StorageCategory =
  'audit' | 'security' | 'serverStatus' | 'technical';
export const STORAGE_CATEGORIES: readonly StorageCategory[] = [
  'audit',
  'security',
  'serverStatus',
  'technical',
];
export const RETENTION_OPTIONS = [7, 30, 90, 180, 365, 0] as const;
export const CLEANUP_PERIODS = [7, 30, 90, 180, 365, null] as const;

const DAY_MS = 24 * 3_600_000;
const SETTINGS_ID = 'global';

type Field =
  'auditDays' | 'securityDays' | 'serverStatusDays' | 'technicalDays';

interface CategoryDefinition {
  key: StorageCategory;
  label: string;
  description: string;
  /// Аудит и безопасность — только с правом `system.storage.audit`.
  sensitive: boolean;
  field: Field;
  /// Таблицы (имена в БД) — для оценки объёма.
  tables: string[];
  /// Условия по таблицам: `cutoff` — старше даты, null — все записи
  /// категории. Только служебные записи; активные сессии и неиспользованные
  /// токены не трогаются никогда.
  count(cutoff: Date | null): Promise<number[]>;
  remove(cutoff: Date | null): Promise<number>;
}

/// Хранилище и журналы (ADR-0084): сроки хранения по категориям, предпросмотр
/// (число и оценка объёма), ручная очистка с подтверждением и автоматическая —
/// раз в сутки. Пользовательские данные в категории не входят.
@Injectable()
export class StorageRetentionService {
  private readonly logger = new Logger(StorageRetentionService.name);
  private readonly categories: CategoryDefinition[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {
    const older = (cutoff: Date | null, field = 'createdAt') =>
      cutoff ? { [field]: { lt: cutoff } } : {};
    /// Неактивная запись: использована/отозвана или истекла.
    const inactive = (usedField: 'usedAt' | 'revokedAt') => ({
      OR: [{ [usedField]: { not: null } }, { expiresAt: { lt: new Date() } }],
    });
    this.categories = [
      {
        key: 'audit',
        label: 'Журнал аудита',
        description: 'Действия администраторов и история выдачи ролей',
        sensitive: true,
        field: 'auditDays',
        tables: ['audit_logs', 'role_assignment_logs'],
        count: (cutoff) =>
          Promise.all([
            this.prisma.auditLog.count({ where: older(cutoff) }),
            this.prisma.roleAssignmentLog.count({ where: older(cutoff) }),
          ]),
        remove: async (cutoff) => {
          const [a, b] = await this.prisma.$transaction([
            this.prisma.auditLog.deleteMany({ where: older(cutoff) }),
            this.prisma.roleAssignmentLog.deleteMany({ where: older(cutoff) }),
          ]);
          return a.count + b.count;
        },
      },
      {
        key: 'security',
        label: 'Журнал безопасности',
        description:
          'История входов: завершённые и истёкшие сессии (активные не трогаются)',
        sensitive: true,
        field: 'securityDays',
        tables: ['refresh_tokens'],
        count: async (cutoff) => [
          await this.prisma.refreshToken.count({
            where: { AND: [inactive('revokedAt'), older(cutoff)] },
          }),
        ],
        remove: async (cutoff) =>
          (
            await this.prisma.refreshToken.deleteMany({
              where: { AND: [inactive('revokedAt'), older(cutoff)] },
            })
          ).count,
      },
      {
        key: 'serverStatus',
        label: 'Статусы серверов',
        description: 'История опросов онлайна серверов Minecraft',
        sensitive: false,
        field: 'serverStatusDays',
        tables: ['server_status_logs'],
        count: async (cutoff) => [
          await this.prisma.serverStatusLog.count({
            where: older(cutoff, 'timestamp'),
          }),
        ],
        remove: async (cutoff) =>
          (
            await this.prisma.serverStatusLog.deleteMany({
              where: older(cutoff, 'timestamp'),
            })
          ).count,
      },
      {
        key: 'technical',
        label: 'Технические записи',
        description:
          'Использованные и истёкшие коды сброса пароля и привязки Minecraft (действующие не трогаются)',
        sensitive: false,
        field: 'technicalDays',
        tables: ['password_reset_tokens', 'minecraft_connect_sessions'],
        count: (cutoff) =>
          Promise.all([
            this.prisma.passwordResetToken.count({
              where: { AND: [inactive('usedAt'), older(cutoff)] },
            }),
            this.prisma.minecraftConnectSession.count({
              where: { AND: [inactive('usedAt'), older(cutoff)] },
            }),
          ]),
        remove: async (cutoff) => {
          const [a, b] = await this.prisma.$transaction([
            this.prisma.passwordResetToken.deleteMany({
              where: { AND: [inactive('usedAt'), older(cutoff)] },
            }),
            this.prisma.minecraftConnectSession.deleteMany({
              where: { AND: [inactive('usedAt'), older(cutoff)] },
            }),
          ]);
          return a.count + b.count;
        },
      },
    ];
  }

  private definition(key: StorageCategory): CategoryDefinition {
    const found = this.categories.find((item) => item.key === key);
    if (!found) throw new BadRequestException('Неизвестная категория');
    return found;
  }

  async getSettings(): Promise<StorageRetention> {
    return this.prisma.storageRetention.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        // Прежняя настройка ENV — значение по умолчанию для аудита.
        auditDays: this.normalizeEnvDays(
          this.config.get<number>('AUDIT_RETENTION_DAYS'),
        ),
      },
      update: {},
    });
  }

  private normalizeEnvDays(value: number | undefined): number {
    const days = value ?? 90;
    return (RETENTION_OPTIONS as readonly number[]).includes(days) ? days : 90;
  }

  /// Размер таблиц в байтах (pg_total_relation_size) — оценка объёма.
  private async tableSizes(tables: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      { relname: string; bytes: bigint }[]
    >`
      SELECT relname, pg_total_relation_size(oid)::bigint AS bytes
      FROM pg_class
      WHERE relkind = 'r' AND relname IN (${Prisma.join(tables)})`;
    return new Map(rows.map((row) => [row.relname, Number(row.bytes)]));
  }

  /// Оценка объёма `counts` записей: средний размер строки × число.
  private async estimate(definition: CategoryDefinition, counts: number[]) {
    const sizes = await this.tableSizes(definition.tables);
    const totals = await definition.count(null);
    return definition.tables.reduce((sum, table, index) => {
      const total = totals[index] ?? 0;
      const size = sizes.get(table) ?? 0;
      return total > 0
        ? sum + Math.round((size / total) * (counts[index] ?? 0))
        : sum;
    }, 0);
  }

  private cutoff(days: number | null): Date | null {
    return days ? new Date(Date.now() - days * DAY_MS) : null;
  }

  async overview() {
    const settings = await this.getSettings();
    const categories = await Promise.all(
      this.categories.map(async (definition) => {
        const retentionDays = settings[definition.field];
        const totals = await definition.count(null);
        const dueCounts = retentionDays
          ? await definition.count(this.cutoff(retentionDays))
          : totals.map(() => 0);
        const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
        const sizes = await this.tableSizes(definition.tables);
        return {
          key: definition.key,
          label: definition.label,
          description: definition.description,
          sensitive: definition.sensitive,
          retentionDays,
          total: sum(totals),
          due: sum(dueCounts),
          totalBytes: definition.tables.reduce(
            (total, table) => total + (sizes.get(table) ?? 0),
            0,
          ),
          dueBytes: retentionDays
            ? await this.estimate(definition, dueCounts)
            : 0,
        };
      }),
    );
    return {
      autoCleanup: settings.autoCleanup,
      categories,
      lastRunAt: settings.lastRunAt,
      lastRunTrigger: settings.lastRunTrigger,
      lastResult: settings.lastResult,
    };
  }

  private async assertAllowed(actorId: string, category: StorageCategory) {
    if (
      this.definition(category).sensitive &&
      !(await this.permissions.hasPermission(actorId, 'system.storage.audit'))
    ) {
      throw new ForbiddenException(
        'Для журнала аудита и журнала безопасности нужно отдельное право',
      );
    }
  }

  async update(
    dto: {
      autoCleanup?: boolean;
      retention?: Partial<Record<StorageCategory, number>>;
    },
    actorId: string,
  ) {
    const before = await this.getSettings();
    const data: Prisma.StorageRetentionUpdateInput = { updatedBy: actorId };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (
      dto.autoCleanup !== undefined &&
      dto.autoCleanup !== before.autoCleanup
    ) {
      data.autoCleanup = dto.autoCleanup;
      changes.autoCleanup = { from: before.autoCleanup, to: dto.autoCleanup };
    }
    for (const [key, days] of Object.entries(dto.retention ?? {}) as [
      StorageCategory,
      number,
    ][]) {
      const definition = this.definition(key);
      if (!(RETENTION_OPTIONS as readonly number[]).includes(days)) {
        throw new BadRequestException('Недопустимый срок хранения');
      }
      if (days === before[definition.field]) continue;
      await this.assertAllowed(actorId, key);
      data[definition.field] = days;
      changes[key] = { from: before[definition.field], to: days };
    }
    await this.prisma.storageRetention.update({
      where: { id: SETTINGS_ID },
      data,
    });
    if (Object.keys(changes).length > 0) {
      await this.audit.log({
        actorId,
        action: 'system.storage.update',
        targetType: 'StorageRetention',
        targetId: SETTINGS_ID,
        severity: 'warning',
        changes: changes as Prisma.InputJsonValue,
      });
    }
    return this.overview();
  }

  async preview(category: StorageCategory, olderThanDays: number | null) {
    this.assertPeriod(olderThanDays);
    const definition = this.definition(category);
    const counts = await definition.count(this.cutoff(olderThanDays));
    return {
      count: counts.reduce((a, b) => a + b, 0),
      bytes: await this.estimate(definition, counts),
    };
  }

  private assertPeriod(days: number | null) {
    if (!(CLEANUP_PERIODS as readonly (number | null)[]).includes(days)) {
      throw new BadRequestException('Недопустимый период');
    }
  }

  /// Ручная очистка: подтверждённое число — верхняя граница (если записей к
  /// удалению стало больше, чем видел администратор, — 409).
  async cleanup(
    category: StorageCategory,
    olderThanDays: number | null,
    confirmCount: number,
    actorId: string,
  ) {
    this.assertPeriod(olderThanDays);
    await this.assertAllowed(actorId, category);
    await this.getSettings();
    const definition = this.definition(category);
    const cutoff = this.cutoff(olderThanDays);
    const current = (await definition.count(cutoff)).reduce((a, b) => a + b, 0);
    if (current > confirmCount) {
      throw new ConflictException(
        `Записей к удалению стало больше: ${current} вместо ${confirmCount}. Проверьте ещё раз.`,
      );
    }
    const deleted = await definition.remove(cutoff);
    await this.recordRun('manual', { [category]: deleted });
    // Запись об очистке создаётся после удаления — сама она не удаляется.
    await this.audit.log({
      actorId,
      action: 'system.storage.cleanup',
      targetType: 'StorageCategory',
      targetId: category,
      severity: definition.sensitive ? 'critical' : 'warning',
      changes: { category, olderThanDays, deleted, trigger: 'manual' },
    });
    return { deleted };
  }

  /// Автоматическая очистка по срокам (фоновый обработчик раз в сутки).
  async runAuto(): Promise<Partial<Record<StorageCategory, number>>> {
    const settings = await this.getSettings();
    if (!settings.autoCleanup) return {};
    const result: Partial<Record<StorageCategory, number>> = {};
    for (const definition of this.categories) {
      const days = settings[definition.field];
      if (!days) continue;
      result[definition.key] = await definition.remove(this.cutoff(days));
    }
    await this.recordRun('auto', result);
    const system = await this.prisma.user.findFirst({
      where: { accountType: AccountType.SYSTEM },
      select: { id: true },
    });
    if (system) {
      await this.audit.log({
        actorId: system.id,
        action: 'system.storage.cleanup',
        targetType: 'StorageRetention',
        targetId: SETTINGS_ID,
        changes: { ...result, trigger: 'auto' },
      });
    } else {
      this.logger.warn(
        'Нет системного аккаунта — автоочистка не записана в аудит',
      );
    }
    this.logger.log(`Автоочистка журналов: ${JSON.stringify(result)}`);
    return result;
  }

  private async recordRun(
    trigger: 'auto' | 'manual',
    result: Partial<Record<StorageCategory, number>>,
  ) {
    await this.prisma.storageRetention.update({
      where: { id: SETTINGS_ID },
      data: {
        lastRunAt: new Date(),
        lastRunTrigger: trigger,
        lastResult: result as Prisma.InputJsonValue,
      },
    });
  }
}
