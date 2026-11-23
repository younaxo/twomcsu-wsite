import { WalletLedgerEntry } from '@prisma/client';
import { LedgerPage } from './wallet-ledger.service';

/// Проводка для клиентов: BigInt строкой (без потери точности), без служебных
/// ключей. `actorId` отдаёт только админ-API (`includeActor`).
export function serializeEntry(entry: WalletLedgerEntry, includeActor = false) {
  return {
    id: entry.id,
    kind: entry.kind,
    amount: entry.amount.toString(),
    balanceAfter: entry.balanceAfter.toString(),
    reason: includeActor ? entry.reason : null,
    orderId: entry.orderId,
    createdAt: entry.createdAt,
    ...(includeActor
      ? { actorId: entry.actorId, refundId: entry.refundId }
      : {}),
  };
}

export function serializePage(page: LedgerPage, includeActor = false) {
  return {
    items: page.items.map((e) => serializeEntry(e, includeActor)),
    total: page.total,
    page: page.page,
    limit: page.limit,
  };
}
