import { Injectable } from '@nestjs/common';
import { SITE_MODULES } from './site-modules.registry';
import { MaintenanceState, SiteStatusStore } from './site-status.store';

/// Снимок состояния: выключенные модули и активные техработы.
export interface SiteStatusSnapshot {
  disabled: Set<string>;
  maintenance: (MaintenanceState & { active: boolean }) | null;
}

const CACHE_MS = 5_000;

/// Состояние сайта для guard и публичного статуса (ADR-0082). Кэш в памяти
/// на 5 с — guard не ходит в БД на каждый запрос; запись через админку
/// сбрасывает кэш сразу (в другом инстансе — не позже чем через 5 с).
@Injectable()
export class SiteStatusService {
  private cached: { at: number; value: SiteStatusSnapshot } | null = null;

  constructor(private readonly store: SiteStatusStore) {}

  invalidate() {
    this.cached = null;
  }

  /// Техработы идут, если включены и плановое начало наступило (время сервера).
  static isActive(state: MaintenanceState | null, now = new Date()): boolean {
    return Boolean(
      state?.isEnabled && (!state.startsAt || state.startsAt <= now),
    );
  }

  async snapshot(): Promise<SiteStatusSnapshot> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < CACHE_MS)
      return this.cached.value;
    const [modules, legacy, maintenance] = await Promise.all([
      this.store.getModules(),
      this.store.getLegacyFlags(),
      this.store.getMaintenance(),
    ]);
    const disabled = new Set<string>();
    for (const definition of SITE_MODULES) {
      if (definition.tier === 'core') continue;
      const row = modules.get(definition.key);
      const enabled =
        row?.isEnabled ??
        (definition.legacyFlag
          ? (legacy[definition.legacyFlag] ?? true)
          : true);
      if (!enabled) disabled.add(definition.key);
    }
    const value: SiteStatusSnapshot = {
      disabled,
      maintenance: maintenance
        ? { ...maintenance, active: SiteStatusService.isActive(maintenance) }
        : null,
    };
    this.cached = { at: now, value };
    return value;
  }

  /// Недоступен ли модуль сейчас и почему (null — доступен).
  async unavailable(
    key: string,
  ): Promise<'MODULE_DISABLED' | 'MAINTENANCE' | null> {
    const snapshot = await this.snapshot();
    const maintenance = snapshot.maintenance;
    if (
      maintenance?.active &&
      (maintenance.scope === 'full' || maintenance.modules.includes(key))
    ) {
      return 'MAINTENANCE';
    }
    return snapshot.disabled.has(key) ? 'MODULE_DISABLED' : null;
  }
}
