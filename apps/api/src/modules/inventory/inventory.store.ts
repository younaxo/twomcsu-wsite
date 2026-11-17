import type { InventoryGroup } from '@twomc/shared';
import type { ApplyResult, NormalizedSlot } from './inventory.types';

export const INVENTORY_STORE = Symbol('INVENTORY_STORE');

export interface InventoryKey {
  userId: string;
  serverSlug: string;
  group: InventoryGroup;
}

/// Сохранённое состояние ряда `(пользователь, сервер, группа)`.
export interface StoredInventory {
  epoch: string;
  rev: number;
  /// Json из БД: перед использованием проходит `reparseStoredSlots`.
  slots: unknown;
  slotCount: number;
  contentHash: string;
  capturedAt: Date;
  lastSeenAt: Date;
  playerOnline: boolean;
}

export interface StoredInventoryRow extends StoredInventory {
  serverSlug: string;
  group: InventoryGroup;
}

/// Запись по решению `decide`:
/// - `write`: вставка или полная замена ряда (содержимое изменилось);
/// - `touch`: содержимое то же, обновляются только epoch, rev, capturedAt,
///   lastSeenAt и playerOnline (маленькое UPDATE, JSON не перезаписывается).
export type InventoryWrite =
  | {
      kind: 'write';
      epoch: string;
      rev: number;
      slots: NormalizedSlot[];
      contentHash: string;
      capturedAt: Date;
      lastSeenAt: Date;
      playerOnline: boolean;
    }
  | {
      kind: 'touch';
      epoch: string;
      rev: number;
      capturedAt: Date;
      lastSeenAt: Date;
      playerOnline: boolean;
    };

export interface InventoryDecision {
  write: InventoryWrite | null;
  result: ApplyResult;
}

/// Хранилище снимков. `mutate` исполняет `decide` атомарно относительно
/// других `mutate` того же ключа (SERIALIZABLE-транзакция с повтором):
/// `decide` должна быть чистой, потому что может вызываться повторно.
export interface InventoryStore {
  findUserIdByUuid(uuid: string): Promise<string | null>;
  mutate(
    key: InventoryKey,
    decide: (current: StoredInventory | null) => InventoryDecision,
  ): Promise<ApplyResult>;
  listForUser(
    userId: string,
    serverSlug?: string,
  ): Promise<StoredInventoryRow[]>;
  deleteForUser(userId: string): Promise<number>;
  deleteStale(cutoff: Date): Promise<number>;
}
