import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ModuleState {
  isEnabled: boolean;
  reason: string | null;
  disabledAt: Date | null;
}

export interface MaintenanceState {
  isEnabled: boolean;
  scope: 'full' | 'partial';
  modules: string[];
  title: string;
  message: string;
  reason: string | null;
  startsAt: Date | null;
  estimatedEnd: Date | null;
  enabledAt: Date | null;
  updatedAt: Date | null;
}

export type LegacyModuleFlags = Partial<Record<string, boolean>>;

/// Хранилище состояния модулей и техработ (ADR-0082). Абстракция нужна,
/// чтобы e2e проверяли guard и админку целиком, не выключая модули для
/// параллельных наборов (в тесте — хранилище в памяти).
export abstract class SiteStatusStore {
  abstract getModules(): Promise<Map<string, ModuleState>>;
  abstract setModule(
    key: string,
    state: { isEnabled: boolean; reason: string | null },
    actorId: string,
  ): Promise<void>;
  abstract getMaintenance(): Promise<MaintenanceState | null>;
  abstract setMaintenance(
    state: Omit<MaintenanceState, 'enabledAt' | 'updatedAt'>,
    actorId: string,
  ): Promise<void>;
  /// Прежние флаги `SiteSettings.*Enabled` (значения по умолчанию).
  abstract getLegacyFlags(): Promise<LegacyModuleFlags>;
}

const MAINTENANCE_ID = 'global';

@Injectable()
export class PrismaSiteStatusStore extends SiteStatusStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getModules() {
    const rows = await this.prisma.moduleStatus.findMany();
    return new Map(
      rows.map((row) => [
        row.module,
        {
          isEnabled: row.isEnabled,
          reason: row.reason,
          disabledAt: row.disabledAt,
        },
      ]),
    );
  }

  async setModule(
    key: string,
    state: { isEnabled: boolean; reason: string | null },
    actorId: string,
  ) {
    const data = {
      isEnabled: state.isEnabled,
      reason: state.reason,
      disabledBy: state.isEnabled ? null : actorId,
      disabledAt: state.isEnabled ? null : new Date(),
    };
    await this.prisma.moduleStatus.upsert({
      where: { module: key },
      create: { module: key, ...data },
      update: data,
    });
  }

  async getMaintenance(): Promise<MaintenanceState | null> {
    const row = await this.prisma.maintenanceMode.findUnique({
      where: { id: MAINTENANCE_ID },
    });
    if (!row) return null;
    return {
      isEnabled: row.isEnabled,
      scope: row.scope === 'partial' ? 'partial' : 'full',
      modules: row.modules,
      title: row.title,
      message: row.message,
      reason: row.reason,
      startsAt: row.startsAt,
      estimatedEnd: row.estimatedEnd,
      enabledAt: row.enabledAt,
      updatedAt: row.updatedAt,
    };
  }

  async setMaintenance(
    state: Omit<MaintenanceState, 'enabledAt' | 'updatedAt'>,
    actorId: string,
  ) {
    const before = await this.prisma.maintenanceMode.findUnique({
      where: { id: MAINTENANCE_ID },
      select: { isEnabled: true, enabledAt: true },
    });
    const turningOn = state.isEnabled && !before?.isEnabled;
    const data = {
      ...state,
      updatedBy: actorId,
      enabledBy: turningOn ? actorId : undefined,
      enabledAt: state.isEnabled
        ? turningOn
          ? new Date()
          : before?.enabledAt
        : null,
    };
    await this.prisma.maintenanceMode.upsert({
      where: { id: MAINTENANCE_ID },
      create: { id: MAINTENANCE_ID, ...data },
      update: data,
    });
  }

  async getLegacyFlags() {
    const settings = await this.prisma.siteSettings.findFirst({
      select: {
        chatEnabled: true,
        friendsEnabled: true,
        storeEnabled: true,
        commentsEnabled: true,
        newsEnabled: true,
        reportsEnabled: true,
      },
    });
    return settings ?? {};
  }
}
