import { Injectable } from '@nestjs/common';
import { InventoryApplyService } from '../inventory/inventory-apply.service';

export type InventoryApplyOutcome =
  | 'applied'
  | 'skipped_unlinked'
  | 'stale'
  | 'invalid';

/// Применение `inventory.snapshot` (раздел 16 контракта): тонкий адаптер к
/// `InventoryApplyService` (ADR-0168). Сервер берётся только из ключа
/// (`serverSlug`), порядок свежести - `(epoch, rev)` в хранилище инвентаря,
/// не дублируется. Игрок без привязки: ряд не создаётся (`unknown_player` у
/// инвентаря -> `skipped_unlinked`). Содержимое предметов в логи не попадает.
@Injectable()
export class BridgeInventoryService {
  constructor(private readonly apply: InventoryApplyService) {}

  async applySnapshot(
    serverSlug: string,
    data: Record<string, unknown>,
    now: Date,
  ): Promise<InventoryApplyOutcome> {
    const res = await this.apply.applySnapshot(serverSlug, data, now);
    switch (res.status) {
      case 'applied':
        return 'applied';
      case 'stale':
        return 'stale';
      case 'rejected':
        return res.code === 'unknown_player' ? 'skipped_unlinked' : 'invalid';
      default:
        // `resync_required` для одиночного снимка недостижим; на всякий случай
        // как ошибка данных (плагин построит новый снимок).
        return 'invalid';
    }
  }
}
