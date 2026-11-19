import { createHmac, randomBytes } from 'crypto';
import { sha256Hex } from './giveaway-crypto';

/// Чистые функции розыгрыша (ADR-G003 п. 3). Без зависимостей от Nest и БД:
/// результат полностью определяется снимком и зерном и проверяется независимо.

export const SNAPSHOT_SCHEMA = 'twomc.giveaway.snapshot.v1';
export const DRAW_ALGORITHM = 'twomc-giveaway-draw-v1';

export interface SnapshotEntry {
  ticket: string;
  playerUuid: string;
  playerName: string;
}

export interface DrawPrize {
  name: string;
  quantity: number;
  imageFile: string | null;
}

export interface Place {
  place: number;
  prizeName: string;
  prizeImage: string | null;
}

function compareTickets(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/// Канонический JSON снимка: билеты по возрастанию значения билета (сравнение
/// кодовых единиц), ключи в порядке ticket, playerUuid, playerName, без
/// пробелов. Дубликаты билетов недопустимы.
export function canonicalSnapshot(entries: SnapshotEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    compareTickets(a.ticket, b.ticket),
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ticket === sorted[i - 1].ticket) {
      throw new Error('duplicate_ticket');
    }
  }
  return JSON.stringify({
    schema: SNAPSHOT_SCHEMA,
    tickets: sorted.map((e) => ({
      ticket: e.ticket,
      playerUuid: e.playerUuid,
      playerName: e.playerName,
    })),
  });
}

/// SHA-256 (hex) от UTF-8 байт канонического JSON.
export function snapshotHashOf(canonicalJson: string): string {
  return sha256Hex(Buffer.from(canonicalJson, 'utf8'));
}

export function newSeed(): Buffer {
  return randomBytes(32);
}

/// Поток 32-битных чисел: блок(c) = HMAC-SHA256(ключ = зерно, сообщение =
/// ASCII snapshotHash (64 байта) || u32be(c)), c = 0, 1, 2, ...; из блока
/// последовательно берутся 8 слов по 4 байта (big-endian).
export class DrawStream {
  private counter = 0;
  private block: Buffer = Buffer.alloc(0);
  private offset = 0;

  constructor(
    private readonly seed: Buffer,
    private readonly snapshotHash: string,
  ) {
    if (seed.length !== 32) throw new Error('seed_length');
  }

  static blockOf(seed: Buffer, snapshotHash: string, counter: number): Buffer {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter, 0);
    return createHmac('sha256', seed)
      .update(Buffer.concat([Buffer.from(snapshotHash, 'ascii'), c]))
      .digest();
  }

  nextUint32(): number {
    if (this.offset >= this.block.length) {
      this.block = DrawStream.blockOf(
        this.seed,
        this.snapshotHash,
        this.counter,
      );
      this.counter += 1;
      this.offset = 0;
    }
    const v = this.block.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  /// Равномерное целое [0, n) с отбрасыванием смещения: значения не меньше
  /// 2^32 - (2^32 mod n) отклоняются, берётся следующее слово.
  below(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 0x1_0000_0000) {
      throw new Error('bad_bound');
    }
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
    for (;;) {
      const x = this.nextUint32();
      if (x < limit) return x % n;
    }
  }
}

/// Fisher-Yates (от конца к началу) над индексами 0..n-1; возвращает
/// перестановку индексов в отсортированном списке билетов.
export function permutation(
  n: number,
  seed: Buffer,
  snapshotHash: string,
): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  const s = new DrawStream(seed, snapshotHash);
  for (let i = n - 1; i >= 1; i--) {
    const j = s.below(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/// Порядок билетов (значения) для снимка из канонического JSON.
export function drawOrder(
  entries: SnapshotEntry[],
  seed: Buffer,
  snapshotHash: string,
): SnapshotEntry[] {
  const sorted = [...entries].sort((a, b) =>
    compareTickets(a.ticket, b.ticket),
  );
  return permutation(sorted.length, seed, snapshotHash).map((i) => sorted[i]);
}

/// Места по призам: приз с меньшим приоритетом (раньше в списке) занимает
/// места первым, количество приза = число мест.
export function placesFor(prizesInPriorityOrder: DrawPrize[]): Place[] {
  const out: Place[] = [];
  for (const p of prizesInPriorityOrder) {
    for (let k = 0; k < p.quantity; k++) {
      out.push({
        place: out.length + 1,
        prizeName: p.name,
        prizeImage: p.imageFile,
      });
    }
  }
  return out;
}

/// Следующий в перестановке индекс, который ещё не использован (не выигрывал
/// и не дисквалифицирован); null, если билеты закончились.
export function nextCandidateIndex(
  orderLength: number,
  used: ReadonlySet<number>,
): number | null {
  for (let i = 0; i < orderLength; i++) if (!used.has(i)) return i;
  return null;
}
