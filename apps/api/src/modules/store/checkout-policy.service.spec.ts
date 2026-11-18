import { CheckoutPolicyService } from './checkout-policy.service';

function setup(opts: {
  setting?: string | null;
  quickBuy?: unknown;
  known?: string | null;
  linked?: string | null;
}) {
  const prisma = {
    siteSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.setting === undefined || opts.setting === null
            ? null
            : { value: opts.setting },
        ),
    },
  };
  const config = { get: jest.fn().mockReturnValue(opts.quickBuy) };
  const nicks = {
    resolve: jest.fn().mockResolvedValue(opts.known ?? null),
    linkedNickOf: jest.fn().mockResolvedValue(opts.linked ?? null),
  };
  const service = new CheckoutPolicyService(
    prisma as never,
    config as never,
    nicks as never,
  );
  return { service, nicks };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { getResponse(): { code: string } }).getResponse().code;
  }
}

describe('CheckoutPolicyService (0.5)', () => {
  describe('оферта', () => {
    it('версия из настройки site_settings', async () => {
      const { service } = setup({ setting: ' 2026-11 ' });
      await expect(service.currentOfferVersion()).resolves.toBe('2026-11');
    });

    it('без настройки — версия по умолчанию', async () => {
      const { service } = setup({});
      await expect(service.currentOfferVersion()).resolves.toBe('1');
    });

    it('нет версии — offer_not_accepted', async () => {
      const { service } = setup({ setting: 'v3' });
      expect(await codeOf(service.assertOfferAccepted(undefined))).toBe(
        'offer_not_accepted',
      );
      expect(await codeOf(service.assertOfferAccepted('  '))).toBe(
        'offer_not_accepted',
      );
    });

    it('устаревшая версия — offer_version_mismatch', async () => {
      const { service } = setup({ setting: 'v3' });
      expect(await codeOf(service.assertOfferAccepted('v2'))).toBe(
        'offer_version_mismatch',
      );
    });

    it('текущая версия — принята, возвращает версию и время', async () => {
      const { service } = setup({ setting: 'v3' });
      const res = await service.assertOfferAccepted('v3');
      expect(res.offerVersion).toBe('v3');
      expect(res.offerAcceptedAt).toBeInstanceOf(Date);
    });
  });

  describe('ник получателя', () => {
    it('вошедший без ника — свой привязанный', async () => {
      const { service, nicks } = setup({ linked: 'Steve', known: 'Steve' });
      await expect(service.resolveRecipientNick('u1', undefined)).resolves.toBe(
        'Steve',
      );
      expect(nicks.resolve).toHaveBeenCalledWith('Steve');
    });

    it('вошедший без привязки и без ника — nick_required', async () => {
      const { service } = setup({});
      expect(await codeOf(service.resolveRecipientNick('u1', undefined))).toBe(
        'nick_required',
      );
    });

    it('гость без ника — nick_required', async () => {
      const { service } = setup({});
      expect(await codeOf(service.resolveRecipientNick(null, ' '))).toBe(
        'nick_required',
      );
    });

    it('известный ник — каноническое написание', async () => {
      const { service } = setup({ known: 'Alex' });
      await expect(service.resolveRecipientNick('u1', 'alex')).resolves.toBe(
        'Alex',
      );
    });

    it('неизвестный ник — единый nick_unavailable', async () => {
      const { service } = setup({ known: null });
      expect(await codeOf(service.resolveRecipientNick('u1', 'Nobody'))).toBe(
        'nick_unavailable',
      );
    });
  });

  describe('QUICK_BUY_ENABLED', () => {
    it.each([true, 'true'])('%p — включён', (v) => {
      expect(setup({ quickBuy: v }).service.isQuickBuyEnabled()).toBe(true);
    });
    it.each([false, 'false', undefined, ''])('%p — выключен', (v) => {
      const { service } = setup({ quickBuy: v });
      expect(service.isQuickBuyEnabled()).toBe(false);
      expect(() => service.assertQuickBuyEnabled()).toThrow();
    });
  });
});
