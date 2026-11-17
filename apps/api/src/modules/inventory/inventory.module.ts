import { Module } from '@nestjs/common';
import { InventoryApplyService } from './inventory-apply.service';
import { InventoryEnabledGuard } from './inventory-enabled.guard';
import {
  DefaultInventoryEntitlementPolicy,
  INVENTORY_ENTITLEMENT_POLICY,
} from './inventory-entitlement.policy';
import { InventoryPrivacyService } from './inventory-privacy.service';
import { InventoryRetentionService } from './inventory-retention.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { INVENTORY_STORE } from './inventory.store';
import { PrismaInventoryStore } from './prisma-inventory.store';

/// Модуль инвентаря Minecraft на сайте (этап 04, срез 2; ADR-0168, ADR-0179).
/// Приёмника Bridge нет (этап 03): `InventoryApplyService` экспортируется для
/// него и вызывается пока только тестами. Планировщика очистки нет (Q36).
@Module({
  controllers: [InventoryController],
  providers: [
    { provide: INVENTORY_STORE, useClass: PrismaInventoryStore },
    {
      provide: INVENTORY_ENTITLEMENT_POLICY,
      useClass: DefaultInventoryEntitlementPolicy,
    },
    InventoryEnabledGuard,
    InventoryApplyService,
    InventoryService,
    InventoryPrivacyService,
    InventoryRetentionService,
  ],
  exports: [
    InventoryApplyService,
    InventoryService,
    InventoryPrivacyService,
    INVENTORY_ENTITLEMENT_POLICY,
  ],
})
export class InventoryModule {}
