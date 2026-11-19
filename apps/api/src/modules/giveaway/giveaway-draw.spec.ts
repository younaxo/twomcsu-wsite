import {
  DRAW_ALGORITHM,
  DrawStream,
  canonicalSnapshot,
  drawOrder,
  nextCandidateIndex,
  permutation,
  placesFor,
  snapshotHashOf,
} from './giveaway-draw';
import { VECTOR_ENTRIES, VECTOR_SEED } from './giveaway-draw.fixtures';

const HASH = '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996';

describe('алгоритм розыгрыша (ADR-G003 п. 3, тестовый вектор)', () => {
  it('канонический JSON и хэш снимка', () => {
    const json = canonicalSnapshot(VECTOR_ENTRIES);
    expect(
      json.startsWith(
        '{"schema":"twomc.giveaway.snapshot.v1","tickets":[{"ticket":"A001"',
      ),
    ).toBe(true);
    expect(snapshotHashOf(json)).toBe(HASH);
    // порядок входа не влияет
    expect(
      snapshotHashOf(canonicalSnapshot([...VECTOR_ENTRIES].reverse())),
    ).toBe(HASH);
  });

  it('первый блок HMAC и слова потока', () => {
    expect(DrawStream.blockOf(VECTOR_SEED, HASH, 0).toString('hex')).toBe(
      '45414e46bb577f507ed9438a1ba4b8f4a0f937195c0f1d9ddb786834955d1251',
    );
    const s = new DrawStream(VECTOR_SEED, HASH);
    expect([s.nextUint32(), s.nextUint32(), s.nextUint32()]).toEqual([
      1161907782, 3143073616, 2128167818,
    ]);
  });

  it('перестановка и порядок билетов детерминированы', () => {
    expect(permutation(10, VECTOR_SEED, HASH)).toEqual([
      4, 1, 8, 0, 6, 3, 5, 9, 7, 2,
    ]);
    const a = drawOrder(VECTOR_ENTRIES, VECTOR_SEED, HASH).map((e) => e.ticket);
    expect(a).toEqual([
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
    expect(
      drawOrder([...VECTOR_ENTRIES].reverse(), VECTOR_SEED, HASH).map(
        (e) => e.ticket,
      ),
    ).toEqual(a);
    expect(DRAW_ALGORITHM).toBe('twomc-giveaway-draw-v1');
  });

  it('другое зерно даёт другой порядок, перестановка полная', () => {
    const other = Buffer.alloc(32, 7);
    const p = permutation(10, other, HASH);
    expect([...p].sort((x, y) => x - y)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(p).not.toEqual([4, 1, 8, 0, 6, 3, 5, 9, 7, 2]);
  });

  it('below: границы и отбрасывание смещения', () => {
    const s = new DrawStream(VECTOR_SEED, HASH);
    for (let i = 0; i < 200; i++) expect(s.below(7)).toBeLessThan(7);
    expect(() => s.below(0)).toThrow();
    // n = 3 * 2^30: limit = 2^32 - (2^32 mod n) = 3 * 2^30, слова выше отбрасываются
    const stub = new DrawStream(VECTOR_SEED, HASH);
    const words = [0xffffffff, 0xc0000000, 5];
    stub.nextUint32 = () => words.shift() as number;
    expect(stub.below(3 * 2 ** 30)).toBe(5);
  });

  it('места по приоритету призов и замена по той же перестановке', () => {
    const places = placesFor([
      { name: 'Клавиатура', quantity: 2, imageFile: 'keyboard.png' },
      { name: 'Микрофон', quantity: 1, imageFile: null },
    ]);
    expect(places.map((p) => [p.place, p.prizeName])).toEqual([
      [1, 'Клавиатура'],
      [2, 'Клавиатура'],
      [3, 'Микрофон'],
    ]);
    expect(nextCandidateIndex(10, new Set([0, 1, 2]))).toBe(3);
    expect(nextCandidateIndex(3, new Set([0, 1, 2]))).toBeNull();
    expect(() =>
      canonicalSnapshot([VECTOR_ENTRIES[0], VECTOR_ENTRIES[0]]),
    ).toThrow();
  });
});
