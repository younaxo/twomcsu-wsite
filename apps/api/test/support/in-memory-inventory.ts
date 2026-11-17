/// Только для тестов: хранилище снимков в памяти и построители явно
/// тестовых данных (ники `TestPlayer001`, UUID из тестового диапазона).
import type { InventoryGroup } from '../../src/modules/inventory/inventory-contract';
import {
  type InventoryDecision,
  type InventoryKey,
  type InventoryStore,
  type StoredInventory,
  type StoredInventoryRow,
} from '../../src/modules/inventory/inventory.store';
import type { ApplyResult } from '../../src/modules/inventory/inventory.types';

export const TEST_UUID = '00000000-0000-4000-8000-000000000001';
export const TEST_UUID_2 = '00000000-0000-4000-8000-000000000002';
export const TEST_EPOCH = '01JC0000000000000000000001';
export const TEST_EPOCH_2 = '01JC0000000000000000000002';

export const T0 = new Date('2026-11-17T12:00:00.000Z');

export function iso(offsetSeconds = 0): string {
  return new Date(T0.getTime() + offsetSeconds * 1000).toISOString();
}

export function item(
  id = 'minecraft:diamond_sword',
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, count: 1, ...extra };
}

export function snapshot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uuid: TEST_UUID,
    group: 'main',
    epoch: TEST_EPOCH,
    rev: 1,
    capturedAt: iso(0),
    playerOnline: true,
    schemaVersion: 1,
    slots: [{ area: 'hotbar', slot: 0, item: item() }],
    ...overrides,
  };
}

export function delta(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uuid: TEST_UUID,
    group: 'main',
    epoch: TEST_EPOCH,
    baseRev: 1,
    rev: 2,
    capturedAt: iso(7),
    playerOnline: true,
    changes: [{ area: 'hotbar', slot: 0, item: null }],
    ...overrides,
  };
}

export class InMemoryInventoryStore implements InventoryStore {
  /// uuid → userId
  readonly accounts = new Map<string, string>();
  readonly rows = new Map<string, StoredInventoryRow & { userId: string }>();
  mutateCalls = 0;

  private keyOf(key: InventoryKey): string {
    return `${key.userId}|${key.serverSlug}|${key.group}`;
  }

  link(uuid: string, userId: string): void {
    this.accounts.set(uuid, userId);
  }

  get(
    userId: string,
    serverSlug: string,
    group: InventoryGroup,
  ): (StoredInventoryRow & { userId: string }) | undefined {
    return this.rows.get(this.keyOf({ userId, serverSlug, group }));
  }

  findUserIdByUuid(uuid: string): Promise<string | null> {
    return Promise.resolve(this.accounts.get(uuid) ?? null);
  }

  mutate(
    key: InventoryKey,
    decide: (current: StoredInventory | null) => InventoryDecision,
  ): Promise<ApplyResult> {
    this.mutateCalls += 1;
    const k = this.keyOf(key);
    const existing = this.rows.get(k) ?? null;
    const { write, result } = decide(existing);
    if (write?.kind === 'write') {
      this.rows.set(k, {
        userId: key.userId,
        serverSlug: key.serverSlug,
        group: key.group,
        epoch: write.epoch,
        rev: write.rev,
        slots: JSON.parse(JSON.stringify(write.slots)) as unknown,
        slotCount: write.slots.length,
        contentHash: write.contentHash,
        capturedAt: write.capturedAt,
        lastSeenAt: write.lastSeenAt,
        playerOnline: write.playerOnline,
      });
    } else if (write?.kind === 'touch' && existing) {
      this.rows.set(k, {
        ...existing,
        epoch: write.epoch,
        rev: write.rev,
        capturedAt: write.capturedAt,
        lastSeenAt: write.lastSeenAt,
        playerOnline: write.playerOnline,
      });
    }
    return Promise.resolve(result);
  }

  listForUser(
    userId: string,
    serverSlug?: string,
  ): Promise<StoredInventoryRow[]> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (r) =>
          r.userId === userId && (!serverSlug || r.serverSlug === serverSlug),
      ),
    );
  }

  deleteForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [k, v] of this.rows) {
      if (v.userId === userId) {
        this.rows.delete(k);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  deleteStale(cutoff: Date): Promise<number> {
    let count = 0;
    for (const [k, v] of this.rows) {
      if (v.lastSeenAt < cutoff) {
        this.rows.delete(k);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}
