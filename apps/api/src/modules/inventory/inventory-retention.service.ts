import { Inject, Injectable } from '@nestjs/common';
import { INVENTORY_STORE, type InventoryStore } from './inventory.store';

/// Q36 (а): ряды без обновлений (`lastSeenAt`) дольше 90 суток удаляются.
export const INVENTORY_RETENTION_DAYS = 90;

/// Очистка устаревших рядов. ВЫКЛЮЧЕНА: планировщика нет, никто не вызывает
/// `purgeStale` автоматически, пока владелец не подтвердит срок (Q36). Причина:
/// удаление необратимо, а срок и сама очистка не утверждены; включение — это
/// отдельный срез с планировщиком и блокировкой лидера (как у зеркала
/// наказаний), чтобы не удалять данные из нескольких экземпляров сразу.
@Injectable()
export class InventoryRetentionService {
  constructor(
    @Inject(INVENTORY_STORE) private readonly store: InventoryStore,
  ) {}

  /// Возвращает число удалённых рядов.
  purgeStale(
    now: Date = new Date(),
    days: number = INVENTORY_RETENTION_DAYS,
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.store.deleteStale(cutoff);
  }
}
