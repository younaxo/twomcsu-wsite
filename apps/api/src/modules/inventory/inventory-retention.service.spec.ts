import {
  InMemoryInventoryStore,
  item,
  snapshot,
  T0,
  TEST_UUID,
} from '../../../test/support/in-memory-inventory';
import { InventoryApplyService } from './inventory-apply.service';
import {
  INVENTORY_RETENTION_DAYS,
  InventoryRetentionService,
} from './inventory-retention.service';

const DAY = 24 * 60 * 60 * 1000;

describe('InventoryRetentionService (очистка выключена: только ручной вызов)', () => {
  it('удаляет только ряды без обновлений дольше 90 суток', async () => {
    const store = new InMemoryInventoryStore();
    store.link(TEST_UUID, 'u1');
    const apply = new InventoryApplyService(store);
    const longAgo = new Date(T0.getTime() - 100 * DAY);
    const recent = new Date(T0.getTime() - 10 * DAY);
    await apply.applySnapshot(
      'old',
      snapshot({ capturedAt: longAgo.toISOString() }),
      longAgo,
    );
    await apply.applySnapshot(
      'new',
      snapshot({
        capturedAt: recent.toISOString(),
        slots: [{ area: 'hotbar', slot: 0, item: item('minecraft:stone') }],
      }),
      recent,
    );
    // lastSeenAt (а не capturedAt) определяет возраст: ряд «old» обновлялся 100 суток назад.
    const service = new InventoryRetentionService(store);
    expect(INVENTORY_RETENTION_DAYS).toBe(90);
    expect(await service.purgeStale(T0)).toBe(1);
    expect(store.get('u1', 'old', 'main')).toBeUndefined();
    expect(store.get('u1', 'new', 'main')).toBeDefined();
  });

  it('граница ровно 90 суток не удаляет', async () => {
    const store = new InMemoryInventoryStore();
    store.link(TEST_UUID, 'u1');
    const apply = new InventoryApplyService(store);
    const edge = new Date(T0.getTime() - 90 * DAY);
    await apply.applySnapshot(
      'edge',
      snapshot({ capturedAt: edge.toISOString() }),
      edge,
    );
    expect(await new InventoryRetentionService(store).purgeStale(T0)).toBe(0);
  });
});
