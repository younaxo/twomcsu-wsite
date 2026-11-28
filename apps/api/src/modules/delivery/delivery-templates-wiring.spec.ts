import { DeliveryService } from './delivery.service';
import { CommandExecutor } from './executors/command.executor';
import { MockCommandTransport } from './executors/mock-command-transport';
import { ManualExecutor } from './executors/manual.executor';
import { SiteExecutor } from './executors/site.executor';

/// Подключение шаблонов 0.11 к созданию заданий выдачи.
function setup(opts: {
  settings?: { key: string; value: string }[];
  env?: boolean | string;
  nick?: string | null;
  templates?: {
    productId: string;
    variantId: string | null;
    template: string;
    version: number;
  }[];
  decorationId?: string | null;
}) {
  const tx = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'o1',
        userId: 'buyer',
        guestMinecraftNick: opts.nick === undefined ? 'Steve' : opts.nick,
        items: [
          {
            id: 'i1',
            giftToUserId: null,
            productId: 'p1',
            variantId: 'v1',
            variant: { duration: 'MONTH_1' },
            product: { decorationId: opts.decorationId ?? null },
          },
        ],
      }),
    },
    minecraftAccount: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryCommandTemplate: {
      findMany: jest.fn().mockResolvedValue(opts.templates ?? []),
    },
    deliveryTask: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue([{ status: 'COMPLETED' }]),
  };
  const prisma = {
    siteSetting: { findMany: jest.fn().mockResolvedValue(opts.settings ?? []) },
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'STORE_DELIVERY_ENABLED' ? opts.env : undefined,
    ),
  };
  const service = new DeliveryService(
    prisma as never,
    config as never,
    { logInTx: jest.fn() } as never,
    new ManualExecutor(),
    new SiteExecutor(prisma as never),
    new CommandExecutor(new MockCommandTransport()),
  );
  return { service, tx };
}

const ON = [
  { key: 'store.delivery.enabled', value: 'true' },
  { key: 'store.delivery.executor.command.enabled', value: 'true' },
];
const TPL = [
  {
    productId: 'p1',
    variantId: null,
    template: 'lp user {username} parent addtemp ares {duration}',
    version: 3,
  },
];

const created = (tx: ReturnType<typeof setup>['tx']) =>
  tx.deliveryTask.createMany.mock.calls[0][0].data[0];

describe('шаблоны команд в createTasksForOrder (0.11)', () => {
  it('флаги включены и шаблон есть: command с замороженной командой', async () => {
    const { service, tx } = setup({ settings: ON, templates: TPL });
    await service.createTasksForOrder(tx as never, 'o1');
    const task = created(tx);
    expect(task.executor).toBe('command');
    expect(task.status).toBe('PENDING');
    expect(task.renderedCommand).toBe('lp user Steve parent addtemp ares 30d');
    expect(task.templateVersion).toBe(3);
  });

  it('шаблон варианта приоритетнее шаблона товара', async () => {
    const { service, tx } = setup({
      settings: ON,
      templates: [
        ...TPL,
        {
          productId: 'p1',
          variantId: 'v1',
          template: 'give {username} x',
          version: 7,
        },
      ],
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).renderedCommand).toBe('give Steve x');
    expect(created(tx).templateVersion).toBe(7);
  });

  it('доставка выключена настройкой: manual, шаблоны не читаются', async () => {
    const { service, tx } = setup({
      settings: [ON[1]],
      templates: TPL,
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
    expect(tx.deliveryCommandTemplate.findMany).not.toHaveBeenCalled();
  });

  it('STORE_DELIVERY_ENABLED=false в env: manual', async () => {
    const { service, tx } = setup({
      settings: ON,
      env: 'false',
      templates: TPL,
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(tx.deliveryCommandTemplate.findMany).not.toHaveBeenCalled();
  });

  it('исполнитель command выключен: manual', async () => {
    const { service, tx } = setup({ settings: [ON[0]], templates: TPL });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
  });

  it('нет шаблона: manual как в 0.7', async () => {
    const { service, tx } = setup({ settings: ON, templates: [] });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
  });

  it('негодный ник: manual без команды', async () => {
    const { service, tx } = setup({
      settings: ON,
      templates: TPL,
      nick: 'bad;nick',
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
    expect(created(tx).nick).toBeNull();
  });

  it('испорченный шаблон в БД не уходит на сервер: manual', async () => {
    const { service, tx } = setup({
      settings: ON,
      templates: [
        {
          productId: 'p1',
          variantId: null,
          template: 'op {username}; stop',
          version: 1,
        },
      ],
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
  });

  it('корень разрешён, форма не подошла: manual без команды', async () => {
    const { service, tx } = setup({
      settings: ON,
      templates: [
        {
          productId: 'p1',
          variantId: null,
          template: 'give {username}',
          version: 1,
        },
      ],
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('manual');
    expect(created(tx).renderedCommand ?? null).toBeNull();
  });

  it('сайтовое украшение остаётся на site', async () => {
    const { service, tx } = setup({
      settings: ON,
      templates: TPL,
      decorationId: 'd1',
    });
    await service.createTasksForOrder(tx as never, 'o1');
    expect(created(tx).executor).toBe('site');
    expect(created(tx).renderedCommand ?? null).toBeNull();
  });
});
