import { Injectable, Logger } from '@nestjs/common';
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
/// просто повторится). Флаг WALLET_LEDGER_ENABLED выкл. -> не зачисляет,
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

    const posted = await this.prisma.$transaction(
      (tx) =>
        this.ledger.post(tx, {
          userId: user.id,
          amount: BigInt(task.quantity),
          kind: 'PURCHASE',
          idempotencyKey: `purchase:${task.orderItemId}:${task.step}`,
          reason: null,
          orderId: task.orderId,
          orderItemId: task.orderItemId,
        }),
      TX_OPTIONS,
    );
    return { kind: 'delivered', externalRef: posted.entry.id };
  }
}
