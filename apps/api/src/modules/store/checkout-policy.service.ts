import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NickResolver } from './nick-resolver.service';
import {
  checkoutBadRequest,
  quickBuyDisabled,
  StoreCheckoutError,
} from './store-errors';

/// Ключ настройки сайта с текущей версией оферты (`site_settings`).
export const STORE_OFFER_VERSION_SETTING = 'store.offerVersion';
/// Предел длины версии оферты: колонка Order.offerVersion — VARCHAR(32).
export const STORE_OFFER_VERSION_MAX_LENGTH = 32;
/// Пока владелец не задал версию настройкой, действует версия «1».
export const STORE_OFFER_VERSION_DEFAULT = '1';

/// Правила оформления заказа (0.5): акцепт оферты, ник получателя, флаг
/// анонимной покупки. Деньги и расчёт цены сюда не входят.
@Injectable()
export class CheckoutPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly nicks: NickResolver,
  ) {}

  /// Анонимный quick-buy: `QUICK_BUY_ENABLED` (Joi: в production по умолчанию
  /// false, в dev/test true). Значение, не заданное явно, — выключено (fail closed).
  isQuickBuyEnabled(): boolean {
    const raw = this.config.get<boolean | string | undefined>(
      'QUICK_BUY_ENABLED',
    );
    return raw === true || raw === 'true';
  }

  assertQuickBuyEnabled(): void {
    if (!this.isQuickBuyEnabled()) {
      throw quickBuyDisabled();
    }
  }

  async currentOfferVersion(): Promise<string> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: STORE_OFFER_VERSION_SETTING },
      select: { value: true },
    });
    const value = row?.value.trim();
    return value ? value : STORE_OFFER_VERSION_DEFAULT;
  }

  /// Клиент подтверждает акцепт, присылая версию оферты, которую он видел.
  /// Нет версии — `offer_not_accepted`; версия не текущая — `offer_version_mismatch`
  /// (клиент перечитывает оферту и просит согласие заново).
  async assertOfferAccepted(
    accepted: string | undefined,
  ): Promise<{ offerVersion: string; offerAcceptedAt: Date }> {
    const current = await this.currentOfferVersion();
    const given = accepted?.trim();
    if (!given) {
      throw checkoutBadRequest(
        StoreCheckoutError.OFFER_NOT_ACCEPTED,
        'Для оформления заказа нужно принять условия оферты',
      );
    }
    if (given !== current) {
      throw checkoutBadRequest(
        StoreCheckoutError.OFFER_VERSION_MISMATCH,
        'Условия оферты обновились — ознакомьтесь и подтвердите согласие заново',
      );
    }
    return { offerVersion: current, offerAcceptedAt: new Date() };
  }

  /// Ник получателя. Для вошедшего без явного ника — его привязанный ник;
  /// нет ни того ни другого — `nick_required`. Любой ник, не найденный в
  /// известных сайту источниках, — единый `nick_unavailable` без причины.
  async resolveRecipientNick(
    userId: string | null,
    requested: string | undefined,
  ): Promise<string> {
    let nick = requested?.trim();
    if (!nick && userId) {
      nick = (await this.nicks.linkedNickOf(userId)) ?? undefined;
    }
    if (!nick) {
      throw checkoutBadRequest(
        StoreCheckoutError.NICK_REQUIRED,
        'Укажите ник получателя',
      );
    }
    const canonical = await this.nicks.resolve(nick);
    if (!canonical) {
      throw checkoutBadRequest(
        StoreCheckoutError.NICK_UNAVAILABLE,
        'Этот ник недоступен для покупки',
      );
    }
    return canonical;
  }
}
