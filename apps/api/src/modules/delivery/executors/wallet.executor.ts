import { Injectable, Logger } from '@nestjs/common';
import { OrderRefundStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletLedgerService } from '../../wallet/wallet-ledger.service';
import {
  DeliveryExecutor,
  DeliveryResult,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';
import { EXECUTOR_WALLET } from '../delivery.constants';

const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 } as const;

/// Зачисление купленных рубинов на кошелёк (0.15, ADR-0191): товар CURRENCY,
/// 1 ₽ = 1 рубин, количество рубинов = `quantity` позиции. Идемпотентно:
/// ключ проводки `purchase:<orderItemId>:<step>` UNIQUE, повтор задания или
/// вебхука второй раз не зачисляет (исполнитель `idempotent`, при сбое задание
/// просто повторится). Перед проводкой заказ блокируется (`FOR UPDATE`) и
/// проверяется: оплачен, не в возврате, цена позиции = количество рубинов. Флаг WALLET_LEDGER_ENABLED выкл. -> не зачисляет,
/// задание уходит в ручную выдачу.
@Injectable()
export class WalletExecutor implements DeliveryExecutor {
  readonly kind = EXECUTOR_WALLET;
  readonly idempotent = true;
  readonly automatic = true;
  private readonly logger = new Logger(WalletExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
  ) {}

  async execute(task: DeliveryTaskSnapshot): Promise<DeliveryResult> {
    if (!this.ledger.isEnabled()) {
      this.logger.warn(
        `Кошелёк выключен: задание ${task.taskId} уходит в ручную выдачу (wallet_disabled)`,
      );
      return { kind: 'awaiting_manual' };
    }
    if (!task.recipientUserId) {
      return { kind: 'failed', reason: 'recipient_not_registered' };
    }
    if (!Number.isInteger(task.quantity) || task.quantity < 1) {
      return { kind: 'failed', reason: 'quantity_invalid' };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: task.recipientUserId },
      select: { id: true },
    });
    if (!user) return { kind: 'failed', reason: 'recipient_not_found' };

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<DeliveryResult | { entryId: string }> => {
        // Порядок блокировок общий с возвратом: заказ -> кошелёк (post).
        const locked = await tx.$queryRaw<
          { id: string; status: OrderStatus }[]
        >`
          SELECT id, status FROM orders WHERE id = ${task.orderId} FOR UPDATE`;
        const order = locked[0];
        if (!order) return { kind: 'failed', reason: 'order_not_found' };
        // Уже зачислено (повтор после сбоя при записи результата): не отказывать.
        const key = `purchase:${task.orderItemId}:${task.step}`;
        const done = await tx.walletLedgerEntry.findUnique({
          where: { idempotencyKey: key },
        });
        if (done) return { entryId: done.id };
        if (
          order.status === OrderStatus.REFUNDED ||
          order.status === OrderStatus.REFUND_PENDING
        ) {
          return { kind: 'failed', reason: 'order_refund_in_progress' };
        }
        if (
          order.status !== OrderStatus.COMPLETED &&
          order.status !== OrderStatus.REFUND_FAILED
        ) {
          return { kind: 'failed', reason: 'order_not_paid' };
        }
        const activeRefund = await tx.orderRefund.findFirst({
          where: { orderId: task.orderId, status: OrderRefundStatus.PENDING },
          select: { id: true },
        });
        if (activeRefund) {
          return { kind: 'failed', reason: 'order_refund_in_progress' };
        }
        // 1 ₽ = 1 рубин: цена позиции должна равняться количеству рублей.
        const item = await tx.orderItem.findUnique({
          where: { id: task.orderItemId },
          select: { unitPrice: true, totalPrice: true },
        });
        if (
          !item ||
          !new Prisma.Decimal(item.unitPrice).equals(1) ||
          !new Prisma.Decimal(item.totalPrice).equals(task.quantity)
        ) {
          this.logger.warn(
            `Задание ${task.taskId}: цена позиции не равна количеству рубинов`,
          );
          return { kind: 'unknown', reason: 'currency_price_mismatch' };
        }
        const posted = await this.ledger.post(tx, {
          userId: user.id,
          amount: BigInt(task.quantity),
          kind: 'PURCHASE',
          idempotencyKey: `purchase:${task.orderItemId}:${task.step}`,
          reason: null,
          orderId: task.orderId,
          orderItemId: task.orderItemId,
        });
        return { entryId: posted.entry.id };
      },
      TX_OPTIONS,
    );
    if ('kind' in outcome) return outcome;
    return { kind: 'delivered', externalRef: outcome.entryId };
  }
}
