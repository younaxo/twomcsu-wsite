import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
  | { confirmed: true; via: 'config' | 'info' | 'owner_acknowledged' }
  | {
      confirmed: false;
      reason:
        | 'unchecked'
        | 'eviction_policy'
        | 'maxmemory_unset'
        | 'config_unavailable';
    };

/// Отказ ACL: `NOPERM` (Redis 6+) или команда переименована/отключена
/// (`unknown command`, управляемые сервисы). Всё прочее (таймаут, обрыв,
/// OOM, `LOADING`) — НЕ отказ ACL: владельческое подтверждение к нему не
/// применяется.
export function isPermissionDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bNOPERM\b|unknown command/i.test(message);
}

@Injectable()
export class InventoryRedisPolicyService {
  private state: RedisPolicyState = { confirmed: false, reason: 'unchecked' };
  private readonly config: AssemblyConfig;
  private readonly logger = new Logger(InventoryRedisPolicyService.name);
  /// Номер переподключения: результат проверки, начатой до переподключения,
  /// не перезаписывает состояние после него.
  private generation = 0;
  /// Метрики проверки (`bridge_inventory_redis_policy_total{result}`).
  readonly counters = new Map<string, number>();

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
  /// Сначала синхронно сбрасывает подтверждение (fail-closed), затем
  /// выполняет РЕАЛЬНУЮ проверку (`refresh`); подтверждение не наследуется.
  onReconnect(): Promise<RedisPolicyState> {
    this.generation += 1;
    this.state = { confirmed: false, reason: 'unchecked' };
    return this.refresh();
  }

  /// Проверка при старте, после переподключения и по таймеру (60 с, пока не
  /// подтверждено; затем раз в 10 минут): таймер задаёт приёмник, здесь
  /// планировщика нет.
  ///
  /// Порядок: `CONFIG GET`; при отказе ACL — `INFO memory`; если и он
  /// недоступен по ACL — подтверждение владельца. Иная ошибка (не ACL) —
  /// `config_unavailable` без подтверждения.
  async refresh(): Promise<RedisPolicyState> {
    const generation = this.generation;
    const next = await this.check();
    if (generation === this.generation) this.state = next;
    return this.state;
  }

  private async check(): Promise<RedisPolicyState> {
    let policy: string | null;
    let maxMemory: string | null;
    let via: 'config' | 'info' = 'config';
    try {
      policy = await this.store.configGet('maxmemory-policy');
      maxMemory = await this.store.configGet('maxmemory');
    } catch (error) {
      if (!isPermissionDenied(error)) {
        return this.unavailable('config_error');
      }
      try {
        const info = await this.store.infoMemory();
        policy = info.policy;
        maxMemory = info.maxMemory;
        via = 'info';
      } catch (infoError) {
        if (!isPermissionDenied(infoError)) {
          return this.unavailable('info_error');
        }
        return this.acknowledgedOrUnavailable();
      }
      if (policy === null || maxMemory === null) {
        // INFO ответил, но полей нет: проверить нечем.
        return this.acknowledgedOrUnavailable();
      }
    }
    const limit = maxMemory === null ? NaN : Number(maxMemory);
    if (policy !== 'noeviction') {
      return this.reject('eviction_policy');
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      return this.reject('maxmemory_unset');
    }
    this.count(`confirmed:${via}`);
    return { confirmed: true, via };
  }

  private reject(
    reason: 'eviction_policy' | 'maxmemory_unset',
  ): RedisPolicyState {
    this.count(`blocked:${reason}`);
    return { confirmed: false, reason };
  }

  private unavailable(cause: string): RedisPolicyState {
    this.count(`blocked:config_unavailable:${cause}`);
    this.logger.warn(
      `inventory: проверка политики Redis не выполнена (${cause}); сборка снимков заблокирована`,
    );
    return { confirmed: false, reason: 'config_unavailable' };
  }

  /// Проверить нечем (ACL запрещает и `CONFIG GET`, и `INFO memory`):
  /// подтверждение владельца из конфигурации, иначе блокировка. Каждое
  /// использование флага пишется в лог (warn) и в метрику.
  private acknowledgedOrUnavailable(): RedisPolicyState {
    if (!this.config.redisPolicyAcknowledged) {
      return this.unavailable('acl_denied');
    }
    this.count('owner_acknowledged_used');
    this.logger.warn(
      'inventory: политика Redis (noeviction, maxmemory > 0) принята по подтверждению владельца INVENTORY_REDIS_POLICY_ACKNOWLEDGED; ACL запрещает CONFIG GET и INFO memory, фактическая проверка невозможна',
    );
    return { confirmed: true, via: 'owner_acknowledged' };
  }

  private count(key: string): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }
}
