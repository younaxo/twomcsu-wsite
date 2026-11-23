// Вариант (b): КОНТРОЛЬНЫЙ - та же логика, что в ts-current, но N+1 исправлен: правила скидок за объём для ВСЕХ
// товарных позиций корзины запрашиваются ОДНИМ обращением (bulkRulesFor), дальше фильтр по количеству и сумме - в памяти.
// Всё остальное (валидация, лояльность, промокод, формулы) идентично ts-current.
import * as D from './dec.ts';
import type { Dec } from './dec.ts';

export const PRODUCT_TYPES = [
  'PRIVILEGE', 'KEY', 'SUBSCRIPTION', 'BADGE', 'BATTLE_PASS', 'BATTLE_PASS_BOOSTER',
  'UNMUTE', 'UNBAN', 'CURRENCY', 'DECORATION', 'BUNDLE',
];

export interface BulkRule {
  id: string;
  productId: string | null;
  productType: string | null;
  minQuantity: number;
  minAmount: Dec | null;
  discountType: string;
  discountValue: Dec;
  isActive: boolean;
}
export interface LoyaltyTier { minPurchases: number; discountPercent: Dec; isActive: boolean }
export interface Promo {
  code: string;
  discountType: string;
  discountValue: Dec;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  applicableToTypes: string[];
  minOrderAmount: Dec | null;
  firstPurchaseOnly: boolean;
}

/// Источник данных (замена Prisma). Каждый метод = одно «обращение к БД» (см. CONTRACT.md).
export interface Store {
  loyaltyPercent(completedOrders: number): Promise<Dec>;
  /// Одно обращение: все активные правила по набору товаров и типов (аналог findMany с OR по productId/productType IN (...)).
  bulkRulesFor(productIds: string[], productTypes: string[]): Promise<BulkRule[]>;
  promo(codeUpper: string): Promise<Promo | null>;
}

export interface Item {
  id: string;
  productId: string | null;
  productType: string | null;
  unitPrice: Dec;
  quantity: number;
}
export interface Parsed {
  now: string;
  userCompletedOrders: number | null;
  promoCode: string | null;
  softPromo: boolean;
  items: Item[];
}
export interface Result { status: number; body: unknown }

const bad = (code: string, message: string): Result => ({ status: 400, body: { code, message } });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const PRICE_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
const NOW_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const PROMO_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_UCO = 2_147_483_647; // как int32 в Java; Rust ограничивает так же (CONTRACT.md, «Целые числа»)

/// Маркер числа, записанного НЕ как целый литерал (5.0, 1e2, 0.5e1): такие значения отклоняются (CONTRACT.md).
/// Нужен потому, что JSON.parse теряет различие между 5 и 5.0; различие восстанавливается по исходному тексту (context.source).
export class NonIntegerLiteral { source: string; constructor(source: string) { this.source = source; } }
const STRING_RE = /"(?:[^"\\]|\\.)*"/g;
const NON_INT_HINT_RE = /[0-9][.eE]/;
const INT_LITERAL_RE = /^(0|-?[1-9][0-9]*)$/;

/// Разбор тела запроса. Быстрый путь - обычный JSON.parse, если вне строк нет цифры с точкой/экспонентой;
/// иначе JSON.parse с reviver (Node >= 21, доступ к исходному тексту числа), который помечает нецелые записи.
/// Бросает SyntaxError на некорректном JSON.
export function parseJsonBody(text: string): unknown {
  if (!NON_INT_HINT_RE.test(text.replace(STRING_RE, '""'))) return JSON.parse(text);
  return JSON.parse(text, (_k, v, ctx: { source?: string } = {}) =>
    typeof v === 'number' && ctx.source !== undefined && !INT_LITERAL_RE.test(ctx.source) ? new NonIntegerLiteral(ctx.source) : v);
}

/// Проверки по CONTRACT.md. Возвращает Parsed либо готовую ошибку 400.
export function parseRequest(raw: unknown): Parsed | Result {
  if (!isObj(raw)) return bad('VALIDATION', 'Тело должно быть объектом');
  const now = raw.now;
  if (typeof now !== 'string' || !NOW_RE.test(now)) return bad('VALIDATION', 'now');
  const uco = raw.userCompletedOrders ?? null;
  if (uco !== null && !(typeof uco === 'number' && Number.isInteger(uco) && uco >= 0 && uco <= MAX_UCO)) {
    return bad('VALIDATION', 'userCompletedOrders');
  }
  const promoCode = raw.promoCode ?? null;
  if (promoCode !== null && !(typeof promoCode === 'string' && PROMO_RE.test(promoCode))) {
    return bad('VALIDATION', 'promoCode');
  }
  const soft = raw.softPromo ?? true;
  if (typeof soft !== 'boolean') return bad('VALIDATION', 'softPromo');
  const rawItems = raw.items;
  if (!Array.isArray(rawItems) || rawItems.length > 500) return bad('VALIDATION', 'items');

  const items: Item[] = [];
  for (const r of rawItems) {
    if (!isObj(r)) return bad('VALIDATION', 'item');
    const id = r.id;
    if (typeof id !== 'string' || id.length < 1 || id.length > 64) return bad('VALIDATION', 'item.id');
    const productId = r.productId ?? null;
    if (productId !== null && !(typeof productId === 'string' && productId.length >= 1 && productId.length <= 64)) {
      return bad('VALIDATION', 'item.productId');
    }
    const productType = r.productType ?? null;
    if (productType !== null && !(typeof productType === 'string' && PRODUCT_TYPES.includes(productType))) {
      return bad('VALIDATION', 'item.productType');
    }
    if (typeof r.unitPrice !== 'string' || !PRICE_RE.test(r.unitPrice)) return bad('VALIDATION', 'item.unitPrice');
    const q = r.quantity;
    if (!(typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= 9999)) return bad('VALIDATION', 'item.quantity');
    if ((productId !== null) !== (productType !== null)) {
      return bad('CART_ITEM_INVALID', 'Некорректная позиция корзины');
    }
    items.push({ id, productId, productType, unitPrice: D.parse(r.unitPrice), quantity: q });
  }
  return { now, userCompletedOrders: uco, promoCode, softPromo: soft, items };
}

function percentOrFixed(type: string, value: Dec, amount: Dec): Dec {
  return type === 'PERCENT' ? D.div100(D.mul(amount, value)) : D.min(value, amount);
}

/// Как getBulkDiscount, но кандидаты берутся из уже загруженных правил (без обращения к БД).
function bulkDiscountFrom(index: BulkIndex, item: Item, lineAmount: Dec): Dec {
  const all = [...(index.byProduct.get(item.productId as string) ?? []), ...(index.byType.get(item.productType as string) ?? [])];
  const candidates = all.filter((r) => r.minQuantity <= item.quantity && (r.minAmount === null || D.cmp(r.minAmount, lineAmount) <= 0));
  if (candidates.length === 0) return D.ZERO;
  const amounts = candidates.map((c) => percentOrFixed(c.discountType, c.discountValue, lineAmount));
  return amounts.reduce((best, cur) => (D.gt(cur, best) ? cur : best));
}

interface BulkIndex { byProduct: Map<string, BulkRule[]>; byType: Map<string, BulkRule[]> }
function indexRules(rules: BulkRule[]): BulkIndex {
  const byProduct = new Map<string, BulkRule[]>();
  const byType = new Map<string, BulkRule[]>();
  for (const r of rules) {
    const map = r.productId !== null ? byProduct : byType;
    const key = r.productId !== null ? r.productId : (r.productType as string);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return { byProduct, byType };
}

/// Как requireValidPromoCode: код ошибки или null.
export function promoRefusal(promo: Promo | null, now: string, uco: number | null, productTypes: string[], afterLoyalty: Dec): string | null {
  if (!promo || !promo.isActive) return 'PROMO_NOT_FOUND';
  if (promo.validFrom !== null && promo.validFrom > now) return 'PROMO_NOT_STARTED';
  if (promo.validUntil !== null && promo.validUntil < now) return 'PROMO_EXPIRED';
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return 'PROMO_EXHAUSTED';
  if (promo.applicableToTypes.length > 0 && !productTypes.some((t) => promo.applicableToTypes.includes(t))) {
    return 'PROMO_NOT_APPLICABLE';
  }
  if (promo.minOrderAmount !== null && D.lt(afterLoyalty, promo.minOrderAmount)) return 'PROMO_MIN_AMOUNT';
  if (promo.firstPurchaseOnly && uco !== null && uco > 0) return 'PROMO_FIRST_PURCHASE_ONLY';
  return null;
}

export async function calculate(raw: unknown, store: Store): Promise<Result> {
  const parsed = parseRequest(raw);
  if ('status' in parsed) return parsed;
  const { items, now } = parsed;

  // Одно обращение за правилами для всей корзины (вместо await на каждую позицию).
  const productItems = items.filter((i) => i.productId !== null);
  const index = indexRules(
    productItems.length > 0
      ? await store.bulkRulesFor(
          [...new Set(productItems.map((i) => i.productId as string))],
          [...new Set(productItems.map((i) => i.productType as string))],
        )
      : [],
  );
  const lines: { item: Item; lineSubtotal: Dec; bulk: Dec }[] = [];
  let subtotal = D.ZERO;
  let bulkDiscountTotal = D.ZERO;
  for (const item of items) {
    const lineSubtotal = D.mul(item.unitPrice, D.fromInt(item.quantity));
    const bulk = item.productId !== null ? bulkDiscountFrom(index, item, lineSubtotal) : D.ZERO;
    subtotal = D.add(subtotal, lineSubtotal);
    bulkDiscountTotal = D.add(bulkDiscountTotal, bulk);
    lines.push({ item, lineSubtotal, bulk });
  }
  const afterBulk = D.sub(subtotal, bulkDiscountTotal);

  const loyaltyDiscountPercent = parsed.userCompletedOrders !== null ? await store.loyaltyPercent(parsed.userCompletedOrders) : D.ZERO;
  const loyaltyDiscountTotal = D.div100(D.mul(afterBulk, loyaltyDiscountPercent));
  const afterLoyalty = D.sub(afterBulk, loyaltyDiscountTotal);

  let promoDiscountTotal = D.ZERO;
  let promoError: { code: string } | null = null;
  if (parsed.promoCode !== null) {
    const productTypes = lines.map((l) => l.item.productType).filter((t): t is string => t !== null);
    const promo = await store.promo(parsed.promoCode.toUpperCase());
    const refusal = promoRefusal(promo, now, parsed.userCompletedOrders, productTypes, afterLoyalty);
    if (refusal === null) {
      promoDiscountTotal = percentOrFixed((promo as Promo).discountType, (promo as Promo).discountValue, afterLoyalty);
    } else if (!parsed.softPromo) {
      return bad(refusal, refusal);
    } else {
      promoError = { code: refusal };
    }
  }

  const discountAmount = D.add(D.add(bulkDiscountTotal, loyaltyDiscountTotal), promoDiscountTotal);
  const total = D.sub(subtotal, discountAmount);
  return {
    status: 200,
    body: {
      lines: lines.map((l) => ({
        cartItemId: l.item.id,
        productId: l.item.productId,
        quantity: l.item.quantity,
        unitPrice: D.toStr(l.item.unitPrice),
        lineSubtotal: D.toStr(l.lineSubtotal),
        bulkDiscount: D.toStr(l.bulk),
        lineTotal: D.toStr(D.sub(l.lineSubtotal, l.bulk)),
      })),
      subtotal: D.toStr(subtotal),
      bulkDiscountTotal: D.toStr(bulkDiscountTotal),
      loyaltyDiscountPercent: D.toStr(loyaltyDiscountPercent),
      loyaltyDiscountTotal: D.toStr(loyaltyDiscountTotal),
      promoDiscountTotal: D.toStr(promoDiscountTotal),
      promoError,
      discountAmount: D.toStr(discountAmount),
      total: D.toStr(D.gt(total, D.ZERO) ? total : D.ZERO),
    },
  };
}
