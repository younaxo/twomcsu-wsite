/// Единый порядок свежести снимков (ADR-0168, раздел 3.5; `BRIDGE-CONTRACT.md`,
/// 6.1): сначала `epoch`, затем `rev`. `capturedAt` в сравнении не участвует
/// (часы хоста плагина могут уйти назад).

const DIGITS = /^[0-9]+$/;

/// Сравнение `epoch`: строки из одних цифр — как целые (время старта в мс),
/// остальные — лексикографически (ULID-подобная строка монотонна). Результат
/// отрицателен, если `a` старее `b`.
export function compareEpoch(a: string, b: string): number {
  if (DIGITS.test(a) && DIGITS.test(b)) {
    const x = a.replace(/^0+(?=[0-9])/, '');
    const y = b.replace(/^0+(?=[0-9])/, '');
    if (x.length !== y.length) return x.length < y.length ? -1 : 1;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface Freshness {
  epoch: string;
  rev: number;
}

/// Отрицательное — `a` старее `b`; 0 — совпадают; положительное — `a` свежее.
export function compareFreshness(a: Freshness, b: Freshness): number {
  const byEpoch = compareEpoch(a.epoch, b.epoch);
  if (byEpoch !== 0) return byEpoch;
  return a.rev - b.rev;
}
