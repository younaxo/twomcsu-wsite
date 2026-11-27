import type { PrismaClient, WalletEntryKind } from '@prisma/client';
import { WalletLedgerService } from '../../../src/modules/wallet/wallet-ledger.service';
import { DEMO_AUTHOR, demoEscapeToHtml } from './data';
import { assertDemoSeedAllowed, assertDemoUserNotForeign } from './guard';
import {
  DEMO_CHAT_CHANNEL,
  DEMO_CHAT_MESSAGES,
  DEMO_PLAYERS,
  demoPlayerEmail,
} from './social';

const DAY = 86_400_000;
const MINUTE = 60_000;

export const DEMO_WALLET_USERNAME = 'demo_ember';

/// Демо-заказы demo_ember (завершённые, без реальных платёжных путей:
/// провайдер `test`, вебхук не подтверждался). Все id детерминированы.
export interface DemoOrderSpec {
  orderId: string;
  orderNumber: string;
  itemId: string;
  productSlug: string;
  quantity: number;
  daysAgo: number;
  /// wallet — зачисление рубинов проводкой PURCHASE; manual — выдача вручную.
  executor: 'wallet' | 'manual';
}

export const DEMO_ORDERS: readonly DemoOrderSpec[] = [
  {
    orderId: 'demo-order-1',
    orderNumber: 'O-DEMO-0001',
    itemId: 'demo-order-item-1',
    productSlug: 'rubies',
    quantity: 500,
    daysAgo: 6,
    executor: 'wallet',
  },
  {
    orderId: 'demo-order-2',
    orderNumber: 'O-DEMO-0002',
    itemId: 'demo-order-item-2',
    productSlug: 'case-title',
    quantity: 2,
    daysAgo: 4,
    executor: 'manual',
  },
  {
    orderId: 'demo-order-3',
    orderNumber: 'O-DEMO-0003',
    itemId: 'demo-order-item-3',
    productSlug: 'rubies',
    quantity: 250,
    daysAgo: 3,
    executor: 'wallet',
  },
];

/// Проводки кошелька: ТОЛЬКО зачисления и админская корректировка. Трат и
/// передач рубинов нет (hard gate). Баланс = сумма amount (проверяется тестом).
export interface DemoWalletOp {
  key: string;
  kind: WalletEntryKind;
  amount: bigint;
  reason: string | null;
  /// Заказ-источник (для PURCHASE).
  order?: DemoOrderSpec;
  adminActor?: boolean;
}

const ORDER_BY_ID = (id: string): DemoOrderSpec => {
  const o = DEMO_ORDERS.find((x) => x.orderId === id);
  if (!o) throw new Error(`Демо-заказ не найден: ${id}`);
  return o;
};

export const DEMO_WALLET_OPS: readonly DemoWalletOp[] = [
  {
    key: `purchase:${ORDER_BY_ID('demo-order-1').itemId}:1`,
    kind: 'PURCHASE',
    amount: 500n,
    reason: null,
    order: ORDER_BY_ID('demo-order-1'),
  },
  {
    key: 'demo-seed:adjust:event-bonus',
    kind: 'ADMIN_ADJUST',
    amount: 150n,
    reason: '[Демо] Бонус за участие в ивенте',
    adminActor: true,
  },
  {
    key: `purchase:${ORDER_BY_ID('demo-order-3').itemId}:1`,
    kind: 'PURCHASE',
    amount: 250n,
    reason: null,
    order: ORDER_BY_ID('demo-order-3'),
  },
  {
    key: 'demo-seed:adjust:correction',
    kind: 'ADMIN_ADJUST',
    amount: -50n,
    reason: '[Демо] Корректировка ошибочного начисления',
    adminActor: true,
  },
];

export const demoWalletTotal = (): bigint =>
  DEMO_WALLET_OPS.reduce((sum, op) => sum + op.amount, 0n);

/// Общий чат стенда, заказы и кошелёк рубинов demo_ember. Проводки идут через
/// тот же `WalletLedgerService.post` (журнал append-only, баланс = сумма журнала,
/// блокировка кошелька, идемпотентность по ключу). Только demo_*; если баланс
/// уже расходится с журналом (чужие данные), кошелёк не трогается.
export async function seedDemoWalletAndOrders(
  prisma: PrismaClient,
): Promise<string> {
  assertDemoSeedAllowed(process.env);
  for (const p of DEMO_PLAYERS) {
    await assertDemoUserNotForeign(
      prisma,
      p.username,
      demoPlayerEmail(p.username),
    );
  }
  await assertDemoUserNotForeign(
    prisma,
    DEMO_AUTHOR.username,
    DEMO_AUTHOR.email,
  );
  const user = await prisma.user.findUnique({
    where: { username: DEMO_WALLET_USERNAME },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `Демо-пользователь не найден: ${DEMO_WALLET_USERNAME} (сначала сид соцданных)`,
    );
  }
  const now = Date.now();

  // --- общий чат ---
  const channel = await prisma.chatChannel.upsert({
    where: { slug: DEMO_CHAT_CHANNEL.slug },
    create: { ...DEMO_CHAT_CHANNEL, type: 'GENERAL', order: 0 },
    update: { name: DEMO_CHAT_CHANNEL.name },
  });
  for (const m of DEMO_CHAT_MESSAGES) {
    const author = await prisma.user.findUnique({
      where: { username: m.author },
      select: { id: true },
    });
    if (!author) throw new Error(`Демо-пользователь не найден: ${m.author}`);
    const data = {
      channelId: channel.id,
      authorId: author.id,
      content: m.text,
      contentHtml: demoEscapeToHtml(m.text),
      mentions: [] as string[],
    };
    await prisma.chatMessage.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        ...data,
        createdAt: new Date(now - m.minutesAgo * MINUTE),
      },
      update: data,
    });
  }

  // --- заказы ---
  let orders = 0;
  for (const o of DEMO_ORDERS) {
    const product = await prisma.product.findUnique({
      where: { slug: o.productSlug },
      select: { id: true },
    });
    if (!product) {
      throw new Error(`Демо-товар не найден: ${o.productSlug} (сначала сид магазина)`);
    }
    const variant = await prisma.productVariant.findUnique({
      where: {
        productId_duration: { productId: product.id, duration: 'ONE_TIME' },
      },
      select: { id: true, price: true },
    });
    if (!variant) throw new Error(`Нет варианта ONE_TIME: ${o.productSlug}`);
    const unitPrice = Number(variant.price);
    const total = unitPrice * o.quantity;
    const paidAt = new Date(now - o.daysAgo * DAY);
    await prisma.order.upsert({
      where: { orderNumber: o.orderNumber },
      create: {
        id: o.orderId,
        orderNumber: o.orderNumber,
        userId: user.id,
        status: 'COMPLETED',
        subtotal: total,
        discountAmount: 0,
        total,
        paymentMethod: 'SBP',
        paymentProvider: 'test',
        paidAt,
        createdAt: new Date(paidAt.getTime() - 5 * MINUTE),
      },
      // Существующий (возможно изменённый) заказ не перезаписывается.
      update: {},
    });
    await prisma.orderItem.upsert({
      where: { id: o.itemId },
      create: {
        id: o.itemId,
        orderId: o.orderId,
        productId: product.id,
        variantId: variant.id,
        quantity: o.quantity,
        unitPrice,
        totalPrice: total,
        isDelivered: true,
        deliveredAt: paidAt,
      },
      update: {},
    });
    await prisma.deliveryTask.upsert({
      where: { orderItemId_step: { orderItemId: o.itemId, step: 1 } },
      create: {
        orderItemId: o.itemId,
        step: 1,
        executor: o.executor,
        status: o.executor === 'wallet' ? 'DELIVERED' : 'MANUAL_DONE',
        nick: 'DemoEmber',
        recipientUserId: user.id,
        deliveredAt: paidAt,
      },
      update: {},
    });
    orders += 1;
  }

  // --- кошелёк рубинов: только через журнал ---
  const ledger = new WalletLedgerService(
    prisma as never,
    { get: () => undefined } as never,
  );
  const state = await ledger.reconcile(user.id);
  if (!state.consistent) {
    console.warn(
      'Кошелёк demo_ember: баланс расходится с журналом, проводки не добавлены.',
    );
    return `чат ${DEMO_CHAT_MESSAGES.length}, заказов ${orders}, кошелёк: расхождение, пропуск`;
  }
  const actor = await prisma.user.findUnique({
    where: { username: DEMO_AUTHOR.username },
    select: { id: true },
  });
  let posted = 0;
  for (const op of DEMO_WALLET_OPS) {
    const result = await prisma.$transaction((tx) =>
      ledger.post(tx, {
        userId: user.id,
        amount: op.amount,
        kind: op.kind,
        idempotencyKey: op.key,
        reason: op.reason,
        actorId: op.adminActor ? (actor?.id ?? null) : null,
        orderId: op.order?.orderId ?? null,
        orderItemId: op.order?.itemId ?? null,
      }),
    );
    if (result.created) posted += 1;
  }
  return `чат ${DEMO_CHAT_MESSAGES.length}, заказов ${orders}, проводок кошелька ${DEMO_WALLET_OPS.length} (новых ${posted})`;
}
