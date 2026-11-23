import { ProductType } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import { CommandExecutor } from './executors/command.executor';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';
import { WalletExecutor } from './executors/wallet.executor';

/// Выбор исполнителя «wallet» (0.15, ADR-0191): только товар CURRENCY с
/// получателем-пользователем и только при WALLET_LEDGER_ENABLED.
function setup(opts: {
  walletEnabled?: boolean;
  type?: ProductType;
  userId?: string | null;
}) {
  const tx = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'o1',
        userId: opts.userId === undefined ? 'buyer' : opts.userId,
        guestMinecraftNick: 'Steve',
        items: [
          {
            id: 'i1',
            giftToUserId: null,
            productId: 'p1',
            variantId: null,
            variant: null,
            product: {
              decorationId: null,
              type: opts.type ?? ProductType.CURRENCY,
            },
          },
        ],
      }),
    },
    minecraftAccount: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryCommandTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryTask: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue([{ status: 'COMPLETED' }]),
  };
  const prisma = { siteSetting: { findMany: jest.fn().mockResolvedValue([]) } };
  const config = {
    get: jest.fn((key: string) =>
      key === 'WALLET_LEDGER_ENABLED' ? opts.walletEnabled : undefined,
    ),
  };
  const walletExecutor = new WalletExecutor(
    prisma as never,
    {
      isEnabled: () => true,
    } as never,
  );
  const service = new DeliveryService(
    prisma as never,
    config as never,
    { logInTx: jest.fn() } as never,
    new ManualExecutor(),
    new SiteExecutor(prisma as never),
    new CommandExecutor(),
    walletExecutor,
  );
  return { service, tx };
}

const created = (tx: ReturnType<typeof setup>['tx']) =>
  (
    tx.deliveryTask.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    }
  ).data[0];

describe('DeliveryService: исполнитель wallet (0.15)', () => {
  it('флаг включён, CURRENCY, получатель-пользователь -> wallet (PENDING)', async () => {
    const { service, tx } = setup({ walletEnabled: true });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx)).toMatchObject({
      executor: 'wallet',
      status: 'PENDING',
      recipientUserId: 'buyer',
    });
    expect(created(tx).lastError).toBeUndefined();
  });

  it('флаг выключен -> manual с причиной wallet_disabled', async () => {
    const { service, tx } = setup({ walletEnabled: false });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx)).toMatchObject({
      executor: 'manual',
      status: 'AWAITING_MANUAL',
      lastError: 'wallet_disabled',
    });
  });

  it('гостевой заказ (нет пользователя) -> manual, не wallet', async () => {
    const { service, tx } = setup({ walletEnabled: true, userId: null });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
  });

  it('другой тип товара -> manual, без lastError', async () => {
    const { service, tx } = setup({
      walletEnabled: true,
      type: ProductType.PRIVILEGE,
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).lastError).toBeUndefined();
  });
});
