// Минимальная точная десятичная арифметика на BigInt (без зависимостей): значение = n / 10^s.
// Заменяет Prisma.Decimal боевого кода, чтобы эксперимент запускался без установки пакетов.
// Только точные операции (сложение, вычитание, умножение, деление на 100) - как в расчёте корзины.

export interface Dec {
  readonly n: bigint;
  readonly s: number;
}

export const ZERO: Dec = { n: 0n, s: 0 };
const pow10 = (k: number): bigint => 10n ** BigInt(k);

/// Вход уже проверен регулярным выражением контракта: `^(0|[1-9][0-9]*)(\.[0-9]+)?$`.
export function parse(text: string): Dec {
  const dot = text.indexOf('.');
  if (dot < 0) return { n: BigInt(text), s: 0 };
  const frac = text.slice(dot + 1);
  return { n: BigInt(text.slice(0, dot) + frac), s: frac.length };
}

export function fromInt(v: number): Dec {
  return { n: BigInt(v), s: 0 };
}

function scaleTo(a: Dec, s: number): bigint {
  return a.n * pow10(s - a.s);
}

export function add(a: Dec, b: Dec): Dec {
  const s = Math.max(a.s, b.s);
  return { n: scaleTo(a, s) + scaleTo(b, s), s };
}

export function sub(a: Dec, b: Dec): Dec {
  const s = Math.max(a.s, b.s);
  return { n: scaleTo(a, s) - scaleTo(b, s), s };
}

export function mul(a: Dec, b: Dec): Dec {
  return { n: a.n * b.n, s: a.s + b.s };
}

/// Деление на 100 без потерь (сдвиг порядка).
export function div100(a: Dec): Dec {
  return { n: a.n, s: a.s + 2 };
}

export function cmp(a: Dec, b: Dec): number {
  const s = Math.max(a.s, b.s);
  const x = scaleTo(a, s);
  const y = scaleTo(b, s);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const gt = (a: Dec, b: Dec): boolean => cmp(a, b) > 0;
export const lt = (a: Dec, b: Dec): boolean => cmp(a, b) < 0;
export const min = (a: Dec, b: Dec): Dec => (cmp(a, b) <= 0 ? a : b);

/// Канонический вид (CONTRACT.md): без экспоненты, без хвостовых нулей, целое без точки.
export function toStr(a: Dec): string {
  let n = a.n;
  let s = a.s;
  while (s > 0 && n % 10n === 0n) {
    n /= 10n;
    s -= 1;
  }
  const neg = n < 0n;
  let digits = (neg ? -n : n).toString();
  if (s > 0) {
    digits = digits.padStart(s + 1, '0');
    digits = `${digits.slice(0, digits.length - s)}.${digits.slice(digits.length - s)}`;
  }
  return neg ? `-${digits}` : digits;
}
