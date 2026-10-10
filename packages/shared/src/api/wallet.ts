/// Кошелёк (ADR-0094): `GET /wallet` — свой баланс по валютам, только чтение.
/// Контракт не зависит от хранения (сейчас агрегат, позже — журнал проводок).

/// RUB — рубли сайта; RUBY — рубины, внутренняя валюта twomc.su.
export type WalletCurrency = 'RUB' | 'RUBY';

export interface WalletBalanceDto {
  currency: WalletCurrency;
  /// Целое число минимальных единиц строкой (копейки, штуки) — без float.
  amountMinor: string;
  /// Знаков после запятой: RUB — 2, RUBY — 0.
  scale: number;
}

export interface WalletSummaryDto {
  balances: WalletBalanceDto[];
}
