import type { WalletCurrency } from './api/wallet';

/// Иконки валют TwoMC (ADR-0098) — официальные PNG из resource pack на CDN:
/// `minecraft/resourspack/currencies/<file>`. MONEY — монета баланса сайта,
/// RUBY — рубин. Pixel-art 16×16: только целочисленный масштаб и
/// `image-rendering: pixelated`, без AVIF/WebP (PNG и меньше, и без потерь).
/// URL в JSX не пишутся — только через реестр и `<CurrencyIcon />`.

export type CurrencyAssetId = 'MONEY' | 'RUBY';

export interface CurrencyAssetDefinition {
  id: CurrencyAssetId;
  /// Путь относительно CDN; абсолютный URL собирает frontend.
  path: string;
  width: number;
  height: number;
  /// Подпись валюты в интерфейсе.
  label: string;
  /// Иконка декоративная рядом с подписью; alt — для одиночного показа.
  alt: string;
}

export const CURRENCY_ASSET_PATH = 'minecraft/resourspack/currencies';

export const CURRENCY_ASSETS: Readonly<Record<CurrencyAssetId, CurrencyAssetDefinition>> = {
  MONEY: {
    id: 'MONEY',
    path: `${CURRENCY_ASSET_PATH}/money.png`,
    width: 16,
    height: 16,
    label: 'Баланс',
    alt: 'Монета',
  },
  RUBY: {
    id: 'RUBY',
    path: `${CURRENCY_ASSET_PATH}/ruby.png`,
    width: 16,
    height: 16,
    label: 'Рубины',
    alt: 'Рубин',
  },
};

/// Валюта кошелька → её иконка: рубли баланса — монета, рубины — рубин.
export const WALLET_CURRENCY_ASSET: Readonly<Record<WalletCurrency, CurrencyAssetId>> = {
  RUB: 'MONEY',
  RUBY: 'RUBY',
};

export function currencyAsset(currency: CurrencyAssetId | WalletCurrency): CurrencyAssetDefinition {
  const id =
    currency in CURRENCY_ASSETS
      ? (currency as CurrencyAssetId)
      : WALLET_CURRENCY_ASSET[currency as WalletCurrency];
  return CURRENCY_ASSETS[id];
}
