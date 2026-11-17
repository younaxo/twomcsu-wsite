import type { InventoryGroup } from '@twomc/shared';

/// Точка расширения для донат-правил (ADR-0168, раздел 6.4; срез 7). Правил и
/// уровней здесь НЕТ: Donation Privileges — hard gate (этап 05). Реализация по
/// умолчанию всегда возвращает `default`. Срез 2 политику не вызывает: она
/// нужна `canViewInventory` чужого инвентаря (срез 4).
export type InventoryEntitlementDecision = 'default' | 'deny' | 'allow';

export interface InventoryEntitlementPolicy {
  evaluate(
    viewerId: string | null,
    targetUserId: string,
    group: InventoryGroup,
  ): InventoryEntitlementDecision;
}

export const INVENTORY_ENTITLEMENT_POLICY = Symbol(
  'INVENTORY_ENTITLEMENT_POLICY',
);

export class DefaultInventoryEntitlementPolicy implements InventoryEntitlementPolicy {
  evaluate(): InventoryEntitlementDecision {
    return 'default';
  }
}
