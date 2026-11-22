import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPaymentProviderError } from './payment/payment-provider.errors';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { reconcileSettings, refundsEnabled } from './refunds-config';
import { OrdersService } from './orders.service';
import { RefundsService } from './refunds.service';

export interface ReconcileReport {
  checked: number;
  completed: number;
  failed: number;
  stillPending: number;
  errors: number;
  refundsResolved: number;
}

/// Фоновая сверка (0.9, ADR-0188), только при STORE_REFUNDS_ENABLED=true.
/// 1) Заказы PENDING (и FAILED — «ложный FAILED») с paymentId, старше N минут
///    и не старше окна (по умолчанию 72 ч): `getPaymentStatus` -> тот же путь,
///    что и у вебхука (`OrdersService.handleWebhook`: сверка суммы/валюты,
///    идемпотентность, создание заданий выдачи). 2) REFUND_PENDING:
///    возврат отражён у провайдера -> REFUNDED/COMPLETED.
/// Размер пачки ограничен; `paymentReconciledAt` не даёт опрашивать один заказ
/// чаще порога. В логах только id заказов и коды, без секретов и ответов.
@Injectable()
export class StoreReconcileService {
  private readonly logger = new Logger(StoreReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registry: PaymentProviderRegistry,
    private readonly orders: OrdersService,
    private readonly refunds: RefundsService,
  ) {}

  isEnabled(): boolean {
    return refundsEnabled(this.config);
  }

  async runOnce(now: Date = new Date()): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      checked: 0,
      completed: 0,
      failed: 0,
      stillPending: 0,
      errors: 0,
      refundsResolved: 0,
    };
    if (!this.isEnabled()) return report;
    const s = reconcileSettings(this.config);
    const minAgeAt = new Date(now.getTime() - s.minAgeMinutes * 60_000);
    const windowAt = new Date(now.getTime() - s.windowHours * 3_600_000);

    const candidates = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.FAILED] },
        paymentId: { not: null },
        paymentProvider: { not: null },
        createdAt: { lt: minAgeAt, gt: windowAt },
        OR: [
          { paymentReconciledAt: null },
          { paymentReconciledAt: { lt: minAgeAt } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: s.batch,
    });
    for (const order of candidates) {
      report.checked += 1;
      try {
        const provider = this.registry.get(order.paymentProvider ?? '');
        if (!provider || !provider.isConfigured() || !order.paymentId) {
          continue;
        }
        const status = await provider.getPaymentStatus(order.paymentId);
        await this.prisma.order.updateMany({
          where: { id: order.id },
          data: { paymentReconciledAt: now },
        });
        if (status.status === 'pending') {
          report.stillPending += 1;
          continue;
        }
        if (status.status === 'refunded' || status.refundedAmount.gt(0)) {
          // Платёж уже возвращён у провайдера мимо сайта: решает человек.
          this.logger.warn(
            `Сверка: заказ ${order.id} возвращён у провайдера вне сайта, нужен ручной разбор`,
          );
          continue;
        }
        if (status.status === 'failed') {
          if (order.status === OrderStatus.PENDING) {
            await this.orders.handleWebhook(provider, {
              orderNumber: order.orderNumber,
              paymentId: order.paymentId,
              status: 'failed',
              amount: status.amount,
              currency: status.currency,
            });
            report.failed += 1;
          }
          continue;
        }
        const res = await this.orders.handleWebhook(provider, {
          orderNumber: order.orderNumber,
          paymentId: order.paymentId,
          status: 'succeeded',
          amount: status.amount,
          currency: status.currency,
        });
        if (res.accepted && !res.reason) {
          report.completed += 1;
          this.logger.log(
            `Сверка: заказ ${order.id} оплачен (${order.status} -> COMPLETED)`,
          );
        } else if (!res.accepted) {
          this.logger.warn(
            `Сверка: заказ ${order.id} отклонён (${res.reason})`,
          );
        }
      } catch (error) {
        report.errors += 1;
        this.logger.warn(
          `Сверка: заказ ${order.id}: ${isPaymentProviderError(error) ? error.code : 'ошибка'}`,
        );
      }
    }

    const pendingRefunds = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.REFUND_PENDING,
        updatedAt: { lt: minAgeAt },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: s.batch,
    });
    for (const o of pendingRefunds) {
      try {
        if ((await this.refunds.syncPendingRefund(o.id)) === 'resolved') {
          report.refundsResolved += 1;
        }
      } catch (error) {
        report.errors += 1;
        this.logger.warn(
          `Сверка возврата: заказ ${o.id}: ${isPaymentProviderError(error) ? error.code : 'ошибка'}`,
        );
      }
    }
    return report;
  }
}
