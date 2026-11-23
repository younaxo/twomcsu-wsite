// Детерминированный генератор синтетических корзин (без внешних зависимостей, без ПДн).
// Использование:
//   node tools/gen-carts.mjs [--count 2000] [--seed 42] [--out generated/carts.json] [--rules 0]
// --rules N > 0 дополнительно пишет generated/dataset-large.json (исходные правила + N случайных).
// Всегда пишет generated/bench-{small,medium,large}.json (одна корзина: 3, 10, 50 позиций) для нагрузчика.
// Область определения (CONTRACT.md): проценты с 1 знаком, суммы с 2 знаками, subtotal < 1e8.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const COUNT = Number(args.count ?? 2000);
const SEED = Number(args.seed ?? 42);
const RULES = Number(args.rules ?? 0);
const OUT = join(root, args.out ?? 'generated/carts.json');
if (!Number.isInteger(COUNT) || COUNT < 1) throw new Error('--count должно быть целым >= 1');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // [lo, hi]
const pick = (arr) => arr[int(0, arr.length - 1)];
const money = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

const TYPES = ['PRIVILEGE', 'KEY', 'SUBSCRIPTION', 'BADGE', 'BATTLE_PASS', 'BATTLE_PASS_BOOSTER', 'UNMUTE', 'UNBAN', 'CURRENCY', 'DECORATION'];
const PRODUCTS = 400;
const pid = (n) => `p${String(n).padStart(3, '0')}`;
const typeOf = (n) => TYPES[(n - 1) % TYPES.length];

const dataset = JSON.parse(readFileSync(join(root, 'fixtures', 'dataset.json'), 'utf8'));
const promoCodes = [...dataset.promoCodes.map((p) => p.code), 'NOPE1', 'summer10', 'Key_Only'];
const NOWS = ['2026-11-23T12:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', '2027-06-01T08:30:00Z'];

function makeCart(index, forcedItems) {
  const n = forcedItems ?? (rnd() < 0.1 ? int(15, 30) : int(1, 12));
  const items = [];
  for (let i = 0; i < n; i += 1) {
    const id = `i${i + 1}`;
    const price = money(int(1, 499999)); // 0.01 .. 4999.99
    if (rnd() < 0.1) {
      items.push({ id, productId: null, productType: null, unitPrice: price, quantity: int(1, 5) });
    } else {
      // чаще p001..p003 (есть правила), иначе случайный товар
      const p = rnd() < 0.3 ? int(1, 3) : int(1, PRODUCTS);
      const quantity = rnd() < 0.25 ? pick([2, 3, 5, 10, 50, 100, 120, 500]) : int(1, 12);
      items.push({ id, productId: pid(p), productType: typeOf(p), unitPrice: price, quantity });
    }
  }
  const req = {
    now: rnd() < 0.8 ? NOWS[0] : pick(NOWS),
    userCompletedOrders: rnd() < 0.2 ? null : pick([0, 1, 2, 4, 5, 6, 19, 20, 49, 50, 100]),
    promoCode: rnd() < 0.4 ? pick(promoCodes) : null,
    items,
  };
  if (rnd() < 0.3) req.softPromo = rnd() < 0.5;
  return { name: `gen-${index}`, request: req };
}

const carts = [];
for (let i = 0; i < COUNT; i += 1) carts.push(makeCart(i + 1));

mkdirSync(join(root, 'generated'), { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ seed: SEED, count: COUNT, carts }) + '\n');

// Профили для нагрузчика: фиксированная корзина (товары, без скидок-исключений: с промокодом и лояльностью).
for (const [name, n] of [['small', 3], ['medium', 10], ['large', 50]]) {
  const r = mulberry32(1000 + n);
  const items = [];
  for (let i = 0; i < n; i += 1) {
    const p = 1 + Math.floor(r() * 3) + (i % 7) * 5;
    items.push({ id: `i${i + 1}`, productId: pid(p), productType: typeOf(p), unitPrice: money(100 + Math.floor(r() * 99900)), quantity: 1 + Math.floor(r() * 12) });
  }
  writeFileSync(join(root, 'generated', `bench-${name}.json`), JSON.stringify({ now: NOWS[0], userCompletedOrders: 5, promoCode: 'SUMMER10', items }) + '\n');
}

if (RULES > 0) {
  const big = JSON.parse(JSON.stringify(dataset));
  for (let i = 0; i < RULES; i += 1) {
    const byProduct = rnd() < 0.7;
    const percent = rnd() < 0.7;
    big.bulkDiscounts.push({
      id: `g${String(i + 1).padStart(5, '0')}`,
      productId: byProduct ? pid(int(1, PRODUCTS)) : null,
      productType: byProduct ? null : pick(TYPES),
      minQuantity: pick([2, 3, 5, 10, 20, 50]),
      minAmount: rnd() < 0.3 ? money(int(1000, 50000)) : null,
      discountType: percent ? 'PERCENT' : pick(['FIXED', 'BONUS']),
      discountValue: percent ? `${int(1, 30)}.${pick([0, 5])}` : money(int(100, 5000)),
      isActive: rnd() < 0.9,
    });
  }
  writeFileSync(join(root, 'generated', 'dataset-large.json'), JSON.stringify(big) + '\n');
}
console.log(`carts: ${COUNT} (seed ${SEED}) -> ${OUT}${RULES > 0 ? `; dataset-large: +${RULES} rules` : ''}`);
