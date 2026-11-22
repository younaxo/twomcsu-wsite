import { createFakeDb } from '../../../test/helpers/wallet-fake-db';
import { WalletAdminService } from './wallet-admin.service';
import { WalletLedgerService } from './wallet-ledger.service';

function setup(
  opts: {
    enabled?: boolean;
    method?: string;
    max?: number;
    daily?: number;
  } = {},
) {
  const db = createFakeDb();
  const config = {
    get: jest.fn((k: string) =>
      k === 'WALLET_LEDGER_ENABLED'
        ? (opts.enabled ?? true)
        : k === 'WALLET_ADJUST_MAX'
          ? opts.max
          : k === 'WALLET_ADJUST_DAILY_MAX'
            ? opts.daily
            : undefined,
    ),
  };
  const ledger = new WalletLedgerService(db.prisma as never, config as never);
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const twoFactor = {
    verify: jest.fn().mockResolvedValue(opts.method ?? 'totp'),
  };
  const counters = new Map<string, number>();
  const redis = {
    client: {
      eval: jest.fn((_s: string, _n: number, key: string) => {
        counters.set(key, (counters.get(key) ?? 0) + 1);
        return Promise.resolve(counters.get(key));
      }),
      del: jest.fn((k: string) => {
        counters.delete(k);
        return Promise.resolve(1);
      }),
    },
  };
  const service = new WalletAdminService(
    db.prisma as never,
    config as never,
    ledger,
    audit as never,
    twoFactor as never,
    redis as never,
  );
  return { service, db, audit, twoFactor, redis, counters };
}

const dto = (over: Record<string, unknown> = {}) => ({
  amount: '50',
  reason: 'компенсация',
  twoFactorCode: '123456',
  ...over,
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return (e as { getResponse?: () => { code?: string } }).getResponse?.()
      ?.code;
  }
  return undefined;
}

describe('WalletAdminService (0.15)', () => {
  it('флаг выключен -> 503 wallet_disabled для просмотра и корректировки', async () => {
    const s = setup({ enabled: false });
    expect(await code(s.service.view('u1', 1, 30))).toBe('wallet_disabled');
    expect(await code(s.service.adjust('u1', dto(), 'a1'))).toBe(
      'wallet_disabled',
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(s.db.entries).toHaveLength(0);
  });

  it('корректировка: проводка ADMIN_ADJUST, аудит critical в транзакции', async () => {
    const s = setup();
    const res = await s.service.adjust('u1', dto(), 'a1');
    expect(res.balance).toBe('50');
    expect(res.entry.amount).toBe('50');
    expect(s.db.entries[0]).toMatchObject({
      kind: 'ADMIN_ADJUST',
      actorId: 'a1',
      reason: 'компенсация',
    });
    expect(s.audit.logInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'wallet.adjusted',
        severity: 'critical',
        targetId: 'u1',
      }),
    );
    expect(s.twoFactor.verify).toHaveBeenCalledWith('a1', '123456', {
      allowBackup: false,
    });
  });

  it('нельзя в минус: 409 wallet_insufficient, аудита нет', async () => {
    const s = setup();
    await s.service.adjust('u1', dto({ amount: '10' }), 'a1');
    s.audit.logInTx.mockClear();
    expect(
      await code(s.service.adjust('u1', dto({ amount: '-11' }), 'a1')),
    ).toBe('wallet_insufficient');
    expect(s.audit.logInTx).not.toHaveBeenCalled();
    expect(s.db.balances.get('u1')).toBe(10n);
  });

  it('потолок величины: больше WALLET_ADJUST_MAX -> 400 wallet_adjust_limit', async () => {
    const s = setup({ max: 100 });
    expect(
      await code(s.service.adjust('u1', dto({ amount: '101' }), 'a1')),
    ).toBe('wallet_adjust_limit');
    expect(
      await code(s.service.adjust('u1', dto({ amount: '-101' }), 'a1')),
    ).toBe('wallet_adjust_limit');
    expect(await code(s.service.adjust('u1', dto({ amount: '0' }), 'a1'))).toBe(
      'wallet_amount_invalid',
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
  });

  it('свой кошелёк: 403 wallet_self_adjust_forbidden, 2FA не тратится', async () => {
    const s = setup();
    expect(await code(s.service.adjust('a1', dto(), 'a1'))).toBe(
      'wallet_self_adjust_forbidden',
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
    expect(s.db.entries).toHaveLength(0);
  });

  it('суточный лимит суммы на актёра: превышение откатывает, повтор requestId не считается', async () => {
    const s = setup({ daily: 100 });
    await s.service.adjust('u1', dto({ amount: '60', requestId: 'r1' }), 'a1');
    // 60 + |-50| = 110 > 100
    expect(
      await code(s.service.adjust('u1', dto({ amount: '-50' }), 'a1')),
    ).toBe('wallet_adjust_daily_limit');
    // повтор того же requestId возвращает прежнюю проводку
    const replay = await s.service.adjust(
      'u1',
      dto({ amount: '60', requestId: 'r1' }),
      'a1',
    );
    expect(replay.replayed).toBe(true);
    // другой актёр считается отдельно
    await s.service.adjust('u1', dto({ amount: '40' }), 'a2');
  });

  it('причина обязательна', async () => {
    const s = setup();
    expect(
      await code(s.service.adjust('u1', dto({ reason: '  ' }), 'a1')),
    ).toBe('wallet_reason_required');
  });

  it('2FA: нет кода -> 403; не TOTP (резервный) -> 403 wallet_two_factor_invalid', async () => {
    const s = setup();
    expect(
      await code(s.service.adjust('u1', dto({ twoFactorCode: '' }), 'a1')),
    ).toBe('wallet_two_factor_required');
    const b = setup({ method: 'backup' });
    expect(await code(b.service.adjust('u1', dto(), 'a1'))).toBe(
      'wallet_two_factor_invalid',
    );
    expect(b.db.entries).toHaveLength(0);
  });

  it('перебор 2FA: шестая попытка в окне -> 429 без проверки кода', async () => {
    const s = setup({ method: 'backup' });
    for (let i = 0; i < 5; i++) {
      expect(await code(s.service.adjust('u1', dto(), 'a1'))).toBe(
        'wallet_two_factor_invalid',
      );
    }
    s.twoFactor.verify.mockClear();
    expect(await code(s.service.adjust('u1', dto(), 'a1'))).toBe(
      'wallet_two_factor_locked',
    );
    expect(s.twoFactor.verify).not.toHaveBeenCalled();
  });

  it('верный код сбрасывает счётчик', async () => {
    const s = setup();
    await s.service.adjust('u1', dto(), 'a1');
    expect(s.counters.size).toBe(0);
  });

  it('повтор с тем же requestId не применяет корректировку дважды', async () => {
    const s = setup();
    const a = await s.service.adjust(
      'u1',
      dto({ requestId: 'req-12345678' }),
      'a1',
    );
    const b = await s.service.adjust(
      'u1',
      dto({ requestId: 'req-12345678' }),
      'a1',
    );
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(s.db.entries).toHaveLength(1);
    expect(s.audit.logInTx).toHaveBeenCalledTimes(1);
  });

  it('просмотр: баланс из журнала, согласованность, история с actorId', async () => {
    const s = setup();
    await s.service.adjust('u1', dto(), 'a1');
    const view = await s.service.view('u1', 1, 30);
    expect(view).toMatchObject({
      balance: '50',
      consistent: true,
      scale: 0,
    });
    expect(view.history.items[0]).toMatchObject({ actorId: 'a1' });
  });
});
