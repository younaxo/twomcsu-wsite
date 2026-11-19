import {
  DRAW_ALGORITHM,
  DrawStream,
  SnapshotEntry,
  canonicalSnapshot,
  drawOrder,
  nextCandidateIndex,
  permutation,
  placesFor,
  snapshotHashOf,
} from './giveaway-draw';

/// Тестовый вектор из ADR-G003 раздел 3.
const NAMES: [string, string][] = [
  ['K417', 'Alex'],
  ['A001', 'Bob_1'],
  ['M250', 'Cat'],
  ['Z999', 'Dave'],
  ['B002', 'Eve'],
  ['C333', 'Finn'],
  ['P777', 'Gus'],
  ['T100', 'Hana'],
  ['H808', 'Ivy'],
  ['W640', 'Jack'],
];
const ENTRIES: SnapshotEntry[] = NAMES.map(([ticket, playerName], i) => ({
  ticket,
  playerName,
  playerUuid: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
}));
const SEED = Buffer.from(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  'hex',
);
const HASH = '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996';

describe('giveaway draw (ADR-G003 п. 3)', () => {
  it('algorithm id', () => {
    expect(DRAW_ALGORITHM).toBe('twomc-giveaway-draw-v1');
  });

  it('snapshotHash совпадает с вектором и не зависит от порядка ввода', () => {
    const json = canonicalSnapshot(ENTRIES);
    expect(snapshotHashOf(json)).toBe(HASH);
    expect(snapshotHashOf(canonicalSnapshot([...ENTRIES].reverse()))).toBe(
      HASH,
    );
    expect(
      json.startsWith('{"schema":"twomc.giveaway.snapshot.v1","tickets":['),
    ).toBe(true);
  });

  it('дубликат билета отклоняется', () => {
    expect(() => canonicalSnapshot([ENTRIES[0], ENTRIES[0]])).toThrow(
      'duplicate_ticket',
    );
  });

  it('block(0) и первые слова совпадают с вектором', () => {
    expect(DrawStream.blockOf(SEED, HASH, 0).toString('hex')).toBe(
      '45414e46bb577f507ed9438a1ba4b8f4a0f937195c0f1d9ddb786834955d1251',
    );
    const s = new DrawStream(SEED, HASH);
    expect([s.nextUint32(), s.nextUint32(), s.nextUint32()]).toEqual([
      1161907782, 3143073616, 2128167818,
    ]);
  });

  it('перестановка и порядок совпадают с вектором и детерминированы', () => {
    expect(permutation(10, SEED, HASH)).toEqual([4, 1, 8, 0, 6, 3, 5, 9, 7, 2]);
    expect(permutation(10, SEED, HASH)).toEqual(permutation(10, SEED, HASH));
    const order = drawOrder(ENTRIES, SEED, HASH).map((e) => e.ticket);
    expect(order).toEqual([
      'K417',
      'B002',
      'W640',
      'A001',
      'P777',
      'H808',
      'M250',
      'Z999',
      'T100',
      'C333',
    ]);
  });

  it('другое зерно даёт другой порядок', () => {
    const other = Buffer.alloc(32, 7);
    expect(drawOrder(ENTRIES, other, HASH).map((e) => e.ticket)).not.toEqual(
      drawOrder(ENTRIES, SEED, HASH).map((e) => e.ticket),
    );
  });

  it('места по призам и дисквалификация с заменой по вектору', () => {
    const places = placesFor([
      { name: 'Клавиатура', quantity: 2, imageFile: 'keyboard.png' },
      { name: 'Микрофон', quantity: 1, imageFile: null },
    ]);
    expect(places.map((p) => [p.place, p.prizeName])).toEqual([
      [1, 'Клавиатура'],
      [2, 'Клавиатура'],
      [3, 'Микрофон'],
    ]);
    const order = drawOrder(ENTRIES, SEED, HASH).map((e) => e.ticket);
    const used = new Set<number>([0, 1, 2]);
    const r1 = nextCandidateIndex(order.length, used);
    expect(order[r1 as number]).toBe('A001');
    used.add(r1 as number);
    const r2 = nextCandidateIndex(order.length, used);
    expect(order[r2 as number]).toBe('P777');
  });

  it('билеты закончились: замены нет', () => {
    expect(nextCandidateIndex(2, new Set([0, 1]))).toBeNull();
  });

  it('below отклоняет неверную границу', () => {
    const s = new DrawStream(SEED, HASH);
    expect(() => s.below(0)).toThrow('bad_bound');
  });
});
