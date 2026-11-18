/// Имитация вебхука платёжного провайдера для разработки (ADR-0157): шлёт
/// тот же подписанный запрос, что и провайдер `test`, на
/// `POST /webhooks/payments/test`. Описание — docs/runbooks/payment-webhook-sim.md.
///
///   npx ts-node scripts/payment-webhook-sim.ts succeeded <orderNumber> [сумма] [валюта]
///   npx ts-node scripts/payment-webhook-sim.ts failed <orderNumber> [сумма] [валюта]
///
/// Только NODE_ENV=development|test (пустой или иной = отказ, fail closed).
/// Секрет берётся из PAYMENT_WEBHOOK_SECRET; значения секретов не печатаются.
/// Сумма по умолчанию — `total` заказа из БД (DATABASE_URL), валюта — RUB.
import { computeWebhookSignature } from '../src/modules/store/payment/test-payment-provider.service';

export type SimStatus = 'succeeded' | 'failed';

export const SIM_PROVIDER = 'test';
export const SIM_DEFAULT_CURRENCY = 'RUB';

/// Разрешены только development/test. Пустой/незаданный NODE_ENV — отказ.
export function assertDevOrTestEnv(nodeEnv: string | undefined): void {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(
      'Симулятор вебхука работает только при NODE_ENV=development или test',
    );
  }
}

export interface SimRequest {
  path: string;
  rawBody: string;
  headers: Record<string, string>;
}

export function buildSimRequest(params: {
  secret: string;
  status: SimStatus;
  orderNumber: string;
  amount: string;
  currency: string;
  paymentId?: string;
  nowSeconds?: number;
}): SimRequest {
  if (!params.secret) {
    throw new Error('PAYMENT_WEBHOOK_SECRET не задан');
  }
  const rawBody = JSON.stringify({
    orderNumber: params.orderNumber,
    paymentId: params.paymentId ?? `sim_${params.orderNumber}`,
    status: params.status,
    amount: params.amount,
    currency: params.currency,
  });
  const timestamp = String(params.nowSeconds ?? Math.floor(Date.now() / 1000));
  const signature = computeWebhookSignature(
    params.secret,
    timestamp,
    rawBody,
  ).toString('hex');
  return {
    path: `/webhooks/payments/${SIM_PROVIDER}`,
    rawBody,
    headers: {
      'content-type': 'application/json',
      'x-twomc-timestamp': timestamp,
      'x-twomc-signature': signature,
    },
  };
}

async function orderTotal(orderNumber: string): Promise<string> {
  // Prisma подключается лениво: чистые функции выше не требуют БД.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: { total: true },
    });
    if (!order) {
      throw new Error('Заказ не найден');
    }
    return order.total.toFixed(2);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  assertDevOrTestEnv(process.env.NODE_ENV);
  const [command, orderNumber, amountArg, currencyArg] = process.argv.slice(2);
  if ((command !== 'succeeded' && command !== 'failed') || !orderNumber) {
    console.log(
      'Использование:\n  succeeded <orderNumber> [сумма] [валюта]\n  failed <orderNumber> [сумма] [валюта]',
    );
    process.exitCode = 1;
    return;
  }
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
  const amount = amountArg ?? (await orderTotal(orderNumber));
  const req = buildSimRequest({
    secret,
    status: command,
    orderNumber,
    amount,
    currency: currencyArg ?? SIM_DEFAULT_CURRENCY,
  });
  const base =
    process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const res = await fetch(`${base}${req.path}`, {
    method: 'POST',
    headers: req.headers,
    body: req.rawBody,
  });
  console.log(`HTTP ${res.status}: ${await res.text()}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
