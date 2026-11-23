import { Injectable } from '@nestjs/common';
import { WalletCurrency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { serializePage } from './wallet-serialize';

/// Кошелёк пользователя (ADR-0094, дополнен ADR-0191) — только чтение.
/// С 0.15 баланс RUBY ведёт журнал проводок (`WalletLedgerService`): строка
/// `Wallet` — его материализация в той же транзакции; ответ `balances` прежний.
///
/// Контракт для UI стабилен и не зависит от хранения: сейчас баланс — агрегат
/// `Wallet` (строки нет → 0), позже его будет вести журнал проводок
/// (переводы рубинов, магазин, мини-игры) — ответ `GET /wallet` не меняется.
/// Суммы — целые минимальные единицы строкой (BigInt без потери точности):
/// RUB — копейки (`scale` 2), RUBY — штуки (`scale` 0).

export const WALLET_CURRENCIES: readonly WalletCurrency[] = ['RUB', 'RUBY'];

const SCALE: Record<WalletCurrency, number> = { RUB: 2, RUBY: 0 };

export interface WalletBalance {
  currency: WalletCurrency;
  amountMinor: string;
  scale: number;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
  ) {}

  /// История рубинов (0.15, ADR-0191): только своя, выкл. флаг -> 503.
  async history(userId: string, page: number, limit: number) {
    this.ledger.assertEnabled();
    return serializePage(await this.ledger.history(userId, page, limit));
  }

  async balances(userId: string): Promise<{ balances: WalletBalance[] }> {
    const rows = await this.prisma.wallet.findMany({
      where: { userId },
      select: { currency: true, balance: true },
    });
    const byCurrency = new Map(rows.map((row) => [row.currency, row.balance]));
    return {
      balances: WALLET_CURRENCIES.map((currency) => ({
        currency,
        amountMinor: (byCurrency.get(currency) ?? 0n).toString(),
        scale: SCALE[currency],
      })),
    };
  }
}
