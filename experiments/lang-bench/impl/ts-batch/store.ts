// Источник данных из fixtures/dataset.json в памяти. Задержка DB_LATENCY_MS моделирует одно обращение к БД.
import { readFileSync } from 'node:fs';
import * as D from './dec.ts';
import type { Dec } from './dec.ts';
import type { BulkRule, LoyaltyTier, Promo, Store } from './calc.ts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface RawDataset {
  bulkDiscounts: Array<Record<string, unknown>>;
  loyaltyDiscounts: Array<Record<string, unknown>>;
  promoCodes: Array<Record<string, unknown>>;
}

const dec = (v: unknown): Dec | null => (v === null || v === undefined ? null : D.parse(String(v)));

export class MemoryStore implements Store {
  readonly byProduct = new Map<string, BulkRule[]>();
  readonly byType = new Map<string, BulkRule[]>();
  readonly tiers: LoyaltyTier[];
  readonly promos = new Map<string, Promo>();
  readonly latencyMs: number;

  constructor(path: string, latencyMs: number) {
    this.latencyMs = latencyMs;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RawDataset;
    for (const r of raw.bulkDiscounts) {
      const rule: BulkRule = {
        id: String(r.id),
        productId: (r.productId as string | null) ?? null,
        productType: (r.productType as string | null) ?? null,
        minQuantity: Number(r.minQuantity),
        minAmount: dec(r.minAmount),
        discountType: String(r.discountType),
        discountValue: D.parse(String(r.discountValue)),
        isActive: Boolean(r.isActive),
      };
      if (!rule.isActive) continue; // фильтр isActive делает «БД» (where isActive = true)
      const map = rule.productId !== null ? this.byProduct : this.byType;
      const key = rule.productId !== null ? rule.productId : (rule.productType as string);
      const list = map.get(key);
      if (list) list.push(rule);
      else map.set(key, [rule]);
    }
    this.tiers = raw.loyaltyDiscounts
      .map((r) => ({ minPurchases: Number(r.minPurchases), discountPercent: D.parse(String(r.discountPercent)), isActive: Boolean(r.isActive) }))
      .filter((t) => t.isActive)
      .sort((a, b) => b.minPurchases - a.minPurchases);
    for (const r of raw.promoCodes) {
      this.promos.set(String(r.code), {
        code: String(r.code),
        discountType: String(r.discountType),
        discountValue: D.parse(String(r.discountValue)),
        maxUses: r.maxUses === null ? null : Number(r.maxUses),
        usedCount: Number(r.usedCount),
        validFrom: (r.validFrom as string | null) ?? null,
        validUntil: (r.validUntil as string | null) ?? null,
        isActive: Boolean(r.isActive),
        applicableToTypes: (r.applicableToTypes as string[]) ?? [],
        minOrderAmount: dec(r.minOrderAmount),
        firstPurchaseOnly: Boolean(r.firstPurchaseOnly),
      });
    }
  }

  private async trip(): Promise<void> {
    if (this.latencyMs > 0) await sleep(this.latencyMs);
  }

  async loyaltyPercent(completedOrders: number): Promise<Dec> {
    await this.trip();
    const tier = this.tiers.find((t) => t.minPurchases <= completedOrders);
    return tier ? tier.discountPercent : D.ZERO;
  }

  async bulkRulesFor(productIds: string[], productTypes: string[]): Promise<BulkRule[]> {
    await this.trip();
    const out: BulkRule[] = [];
    for (const id of productIds) out.push(...(this.byProduct.get(id) ?? []));
    for (const t of productTypes) out.push(...(this.byType.get(t) ?? []));
    return out;
  }

  async promo(codeUpper: string): Promise<Promo | null> {
    await this.trip();
    return this.promos.get(codeUpper) ?? null;
  }
}
