import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  INVENTORY_ASSEMBLY_CONFIG,
  resolveAssemblyConfig,
  type AssemblyConfig,
} from './inventory-assembly.config';
import {
  INVENTORY_ASSEMBLY_STORE,
  type InventoryAssemblyStore,
} from './inventory-assembly.store';

/// Состояние проверки политики Redis (ADR-0168, раздел 4.4, «Память Redis»;
/// `BRIDGE-CONTRACT.md`, 6.1, правило 8). Fail-closed: флаг «подтверждено»
/// ставится ТОЛЬКО при `maxmemory-policy = noeviction` И `maxmemory > 0`.
/// Любое другое — вытесняющая политика, `maxmemory = 0`, `CONFIG GET`
/// недоступен или проверка не выполнена — блокирует сборку снимков
/// (шаг П1); остальные типы событий не затрагиваются.
export type RedisPolicyState =
  | { confirmed: true; via: 'config' | 'owner_acknowledged' }
  | {
      confirmed: false;
      reason:
        | 'unchecked'
        | 'eviction_policy'
        | 'maxmemory_unset'
        | 'config_unavailable';
    };

@Injectable()
export class InventoryRedisPolicyService {
  private state: RedisPolicyState = { confirmed: false, reason: 'unchecked' };
  private readonly config: AssemblyConfig;

  constructor(
    @Inject(INVENTORY_ASSEMBLY_STORE)
    private readonly store: InventoryAssemblyStore,
    @Optional()
    @Inject(INVENTORY_ASSEMBLY_CONFIG)
    config?: AssemblyConfig,
  ) {
    this.config = config ?? resolveAssemblyConfig();
  }

  /// Шаг П1: флаг в памяти процесса, обращения к Redis нет.
  isConfirmed(): boolean {
    return this.state.confirmed;
  }

  current(): RedisPolicyState {
    return this.state;
  }

  /// Вызывается при КАЖДОМ переподключении к Redis: Redis могли
  /// перезапустить или заменить при failover с другой конфигурацией.
  onReconnect(): void {
    this.state = { confirmed: false, reason: 'unchecked' };
  }

  /// Проверка при старте, после переподключения и по таймеру (60 с, пока не
  /// подтверждено; затем раз в 10 минут): таймер задаёт приёмник, здесь
  /// планировщика нет.
  async refresh(): Promise<RedisPolicyState> {
    let policy: string | null;
    let maxMemory: string | null;
    try {
      policy = await this.store.configGet('maxmemory-policy');
      maxMemory = await this.store.configGet('maxmemory');
    } catch {
      // CONFIG GET запрещён (ACL, управляемый Redis) или ошибка. Владелец
      // может подтвердить `noeviction` и ненулевой предел явной настройкой.
      this.state = this.config.redisPolicyAcknowledged
        ? { confirmed: true, via: 'owner_acknowledged' }
        : { confirmed: false, reason: 'config_unavailable' };
      return this.state;
    }
    const limit = maxMemory === null ? NaN : Number(maxMemory);
    if (policy !== 'noeviction') {
      this.state = { confirmed: false, reason: 'eviction_policy' };
    } else if (!Number.isFinite(limit) || limit <= 0) {
      this.state = { confirmed: false, reason: 'maxmemory_unset' };
    } else {
      this.state = { confirmed: true, via: 'config' };
    }
    return this.state;
  }
}
