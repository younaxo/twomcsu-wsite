import type { AssemblyConfig } from './inventory-assembly.config';
import type { InventoryGroup } from './inventory-contract';
import type { BufferedPart } from './inventory-parts';

/// Порт буфера сборки частей снимка (ADR-0168, раздел 4.4). Сегодня
/// реализован поверх Redis (`RedisInventoryAssemblyStore`, скрипты Lua); в
/// unit-тестах заменяется реализацией в памяти. Любая операция может
/// бросить исключение (Redis недоступен или вернул OOM): сборщик отвечает
/// `unavailable`, а не теряет части молча.

export const INVENTORY_ASSEMBLY_STORE = Symbol('INVENTORY_ASSEMBLY_STORE');

/// Метка снимка: `poison` — `snapshot_mismatch`/`conflict`; `evicted` —
/// вытеснен лимитом игрока; `superseded` — сброшен более свежим; `stale`.
export type AssemblyMark = 'poison' | 'evicted' | 'superseded' | 'stale';

/// Зондирование (только чтение): шаг П2.
export interface ProbeResult {
  done: boolean;
  evt: boolean;
  mark: AssemblyMark | null;
  /// Живая сборка с этим `snapshotId` есть.
  live: boolean;
}

export interface OfferInput {
  serverId: string;
  snapshotId: string;
  eventId: string;
  nowMs: number;
  /// Токен захвата применения (случайный, на запрос).
  token: string;
  /// Внутренний `userId` (после проверки привязки); для живой сборки
  /// берётся из её `meta`, здесь используется только при создании.
  userId: string | null;
  /// Зонд видел живую сборку (если её уже нет — `reprobe`).
  probedLive: boolean;
  part: {
    n: number;
    slotGroup: string;
    hash: string;
    slotsJson: string;
    bytes: number;
  };
  header: {
    parts: number;
    group: InventoryGroup;
    epoch: string;
    rev: number;
    capturedAtMs: number;
    playerOnline: boolean;
    /// Необратимый хэш UUID: сверка заголовков без хранения UUID в Redis.
    uuidHash: string;
  };
  /// Набор `slotGroup` раскладки для `group`.
  expectedGroups: readonly string[];
  config: AssemblyConfig;
}

/// Причины `rejected resync_required` при создании сборки.
export type CreateRefusal =
  | 'rate'
  | 'ceiling_assemblies'
  | 'ceiling_buffer'
  | 'ceiling_service'
  | 'ceiling_server'
  | 'ceiling_global'
  | 'ceiling_servers';

export type OfferResult =
  | { kind: 'buffered' }
  | { kind: 'duplicate' }
  | { kind: 'stale' }
  /// Сборка истекла между зондом и скриптом: повторить П2–П3 один раз.
  | { kind: 'reprobe' }
  | {
      kind: 'rejected';
      code:
        'invalid_data' | 'snapshot_mismatch' | 'conflict' | 'resync_required';
      reason: string;
    }
  /// Комплект полон, захват занят другим запросом.
  | { kind: 'lock_busy' }
  /// Комплект полон, захват получен: вернуть части для применения.
  | { kind: 'complete'; userId: string; parts: BufferedPart[] };

/// Итог применения для скрипта финиша:
/// - `applied`: `done`, `evt`, удаление сборки, сброс более старых неполных;
/// - `stale`: метка `stale`, `evt`, удаление сборки;
/// - `discard`: сборка удалена, без `done` и `evt` (отвязка, перепривязка,
///   повреждённый комплект);
/// - `retry`: сбой БД, сборка и части СОХРАНЯЮТСЯ, захват снимается.
export type FinishOutcome = 'applied' | 'stale' | 'discard' | 'retry';

export interface FinishInput {
  serverId: string;
  snapshotId: string;
  eventId: string;
  token: string;
  outcome: FinishOutcome;
  nowMs: number;
  userId: string;
  group: InventoryGroup;
  epoch: string;
  rev: number;
  config: AssemblyConfig;
}

/// `lock_lost`: токен не совпал (захват истёк и его взял другой запрос).
export type FinishResult = { ok: true } | { ok: false; reason: 'lock_lost' };

export interface InventoryAssemblyStore {
  probe(
    serverId: string,
    snapshotId: string,
    eventId: string,
  ): Promise<ProbeResult>;
  /// Шаги П4.1–П4.7 одной атомарной операцией (Lua).
  offer(input: OfferInput): Promise<OfferResult>;
  /// Шаг П6 одной атомарной операцией при совпадении токена захвата.
  finish(input: FinishInput): Promise<FinishResult>;
  /// `CONFIG GET maxmemory-policy | maxmemory`; `null` — значения нет.
  /// Бросает, если команда недоступна (ACL, управляемый Redis).
  configGet(name: 'maxmemory-policy' | 'maxmemory'): Promise<string | null>;
  /// `INFO memory`: поля `maxmemory_policy` и `maxmemory` (`null` — поля нет).
  /// Запасной путь, когда `CONFIG GET` запрещён ACL. Бросает при ошибке.
  infoMemory(): Promise<InfoMemory>;
}

export interface InfoMemory {
  policy: string | null;
  maxMemory: string | null;
}
