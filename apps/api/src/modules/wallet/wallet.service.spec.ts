import { WalletService } from './wallet.service';

describe('WalletService.balances', () => {
  const make = (rows: Array<{ currency: 'RUB' | 'RUBY'; balance: bigint }>) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new WalletService({ wallet: { findMany } } as never);
    return { service, findMany };
  };

  it('нет строк кошелька — честные нули по обеим валютам', async () => {
    const { service, findMany } = make([]);
    await expect(service.balances('u1')).resolves.toEqual({
      balances: [
        { currency: 'RUB', amountMinor: '0', scale: 2 },
        { currency: 'RUBY', amountMinor: '0', scale: 0 },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('BigInt отдаётся строкой без потери точности', async () => {
    const { service } = make([
      { currency: 'RUBY', balance: 9_007_199_254_740_993n },
      { currency: 'RUB', balance: 125_050n },
    ]);
    const { balances } = await service.balances('u1');
    expect(balances).toEqual([
      { currency: 'RUB', amountMinor: '125050', scale: 2 },
      { currency: 'RUBY', amountMinor: '9007199254740993', scale: 0 },
    ]);
  });
});
