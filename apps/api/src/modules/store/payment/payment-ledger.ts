import { Prisma } from '@prisma/client';
import { PaymentProviderError } from './payment-provider.errors';
import {
  ProviderPaymentState,
  ProviderPaymentStatus,
  ProviderRefund,
} from './payment-provider.interface';

interface LedgerPayment {
  paymentId: string;
  orderNumber: string;
  amount: Prisma.Decimal;
  currency: string;
  status: Exclude<ProviderPaymentState, 'refunded'>;
  refunded: Prisma.Decimal;
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/// Учёт платежей «на стороне провайдера» для dev/test (ADR-0187): общий для
/// `TestPaymentProvider` (в памяти процесса) и мок-сервера провайдера в
/// тестах. Реализует правила возврата, которые обязан соблюдать любой
/// адаптер: сумма > 0, не больше остатка, только по оплаченному платежу,
/// идемпотентность по ключу. Состояние не персистентно.
export class InMemoryPaymentLedger {
  private readonly payments = new Map<string, LedgerPayment>();
  private readonly refundsByKey = new Map<
    string,
    { fingerprint: string; refund: ProviderRefund }
  >();
  private refundSeq = 0;

  create(
    paymentId: string,
    orderNumber: string,
    amount: Prisma.Decimal,
    currency: string,
  ): void {
    if (!this.payments.has(paymentId)) {
      this.payments.set(paymentId, {
        paymentId,
        orderNumber,
        amount,
        currency,
        status: 'pending',
        refunded: new Prisma.Decimal(0),
      });
    }
  }

  has(paymentId: string): boolean {
    return this.payments.has(paymentId);
  }

  /// Итог платежа от провайдера. Допускается `failed` -> `succeeded`
  /// (поздний успех, R29); `succeeded` обратно в `failed` не переходит.
  setStatus(paymentId: string, status: 'succeeded' | 'failed'): void {
    const p = this.payments.get(paymentId);
    if (!p) {
      return;
    }
    if (p.status === 'succeeded' && status === 'failed') {
      return;
    }
    p.status = status;
  }

  getStatus(paymentId: string): ProviderPaymentStatus {
    const p = this.payments.get(paymentId);
    if (!p) {
      throw new PaymentProviderError('not_found');
    }
    const fully = p.status === 'succeeded' && p.refunded.gte(p.amount);
    return {
      paymentId: p.paymentId,
      status: fully ? 'refunded' : p.status,
      amount: p.amount,
      currency: p.currency,
      refundedAmount: p.refunded,
    };
  }

  refund(
    paymentId: string,
    amount: Prisma.Decimal,
    idempotencyKey: string,
  ): ProviderRefund {
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new PaymentProviderError('rejected', 'idempotency_key_invalid');
    }
    const fingerprint = `${paymentId}|${amount.toFixed(2)}`;
    const known = this.refundsByKey.get(idempotencyKey);
    if (known) {
      if (known.fingerprint !== fingerprint) {
        throw new PaymentProviderError('rejected', 'idempotency_key_reused');
      }
      return known.refund;
    }
    const p = this.payments.get(paymentId);
    if (!p) {
      throw new PaymentProviderError('not_found');
    }
    if (!amount.gt(0) || amount.decimalPlaces() > 2) {
      throw new PaymentProviderError('rejected', 'amount_invalid');
    }
    if (p.status !== 'succeeded') {
      throw new PaymentProviderError('refund_not_allowed', 'not_paid');
    }
    if (amount.gt(p.amount.minus(p.refunded))) {
      throw new PaymentProviderError('refund_not_allowed', 'exceeds_remaining');
    }
    p.refunded = p.refunded.plus(amount);
    const refund: ProviderRefund = {
      refundId: `rf_${++this.refundSeq}_${paymentId}`,
      paymentId,
      status: 'succeeded',
      amount,
      currency: p.currency,
    };
    this.refundsByKey.set(idempotencyKey, { fingerprint, refund });
    return refund;
  }
}
