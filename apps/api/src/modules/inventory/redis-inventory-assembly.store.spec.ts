import { DEFAULT_ASSEMBLY_CONFIG } from './inventory-assembly.config';
import type { OfferInput } from './inventory-assembly.store';
import {
  OFFER_SCRIPT,
  RedisInventoryAssemblyStore,
} from './redis-inventory-assembly.store';

/// Регресс класса дефекта Q35 без Redis: набор ARGV, который `offer()`
/// передаёт в Lua, и его соответствие индексам в тексте скрипта.
function input(n: number, nowMs: number): OfferInput {
  return {
    serverId: 's1',
    snapshotId: 'snap',
    eventId: `ev-${n}`,
    nowMs,
    token: 'tok',
    userId: 'u1',
    probedLive: false,
    part: { n, slotGroup: `g${n}`, hash: `h${n}`, slotsJson: '[]', bytes: 10 },
    header: {
      parts: 4,
      group: 'main',
      epoch: '1763380800000',
      rev: 1,
      capturedAtMs: 1763380800000,
      playerOnline: true,
      uuidHash: 'u'.repeat(32),
    },
    expectedGroups: ['g1', 'g2', 'g3', 'g4'],
    config: DEFAULT_ASSEMBLY_CONFIG,
  };
}

async function capture(i: OfferInput): Promise<string[]> {
  let args: string[] = [];
  const store = new RedisInventoryAssemblyStore({
    eval: async (_s, numKeys, ...a) => {
      args = a.slice(numKeys);
      return ['buffered'];
    },
    configGet: async () => null,
    infoMemory: async () => '',
  });
  await store.offer(i);
  return args;
}

describe('RedisInventoryAssemblyStore.offer: ARGV', () => {
  it('заголовочные ARGV 17..23 одинаковы у разных частей и разных nowMs', async () => {
    const a = await capture(input(1, 1000));
    const b = await capture(input(2, 2000));
    expect(a.slice(16, 23)).toEqual(b.slice(16, 23));
    expect(a[11]).toBe('1'); // n
    expect(b[11]).toBe('2');
  });

  it('порядок ARGV совпадает с индексами в Lua (ARGV[7..24])', async () => {
    const a = await capture(input(3, 1000));
    const expected: Record<number, string> = {
      7: 'snap',
      9: 'tok',
      10: 'u1',
      11: '0',
      12: '3',
      13: 'g3',
      14: 'h3',
      15: '[]',
      16: '10',
      17: '4',
      18: 'main',
      19: '1763380800000',
      20: '1',
      21: '1763380800000',
      22: '1',
      23: 'u'.repeat(32),
      24: 'g1,g2,g3,g4',
    };
    for (const [idx, v] of Object.entries(expected)) {
      expect(a[Number(idx) - 1]).toBe(v);
    }
    expect(a).toHaveLength(36);
    for (const [name, idx] of [
      ['snapId', 7],
      ['n', 12],
      ['slotGroup', 13],
      ['partsS', 17],
      ['group', 18],
      ['epoch', 19],
      ['rev', 20],
      ['cap', 21],
      ['online', 22],
      ['uh', 23],
      ['expected', 24],
      ['overhead', 36],
    ] as const) {
      expect(OFFER_SCRIPT).toContain(
        `${name} = ${name === 'overhead' ? 'tonumber(' : ''}ARGV[${idx}]`,
      );
    }
  });
});
