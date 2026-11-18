import { Prisma } from '@prisma/client';
import { InMemoryPaymentLedger } from './payment-ledger';
import { PaymentProviderError } from './payment-provider.errors';

const D = (v: string) => new Prisma.Decimal(v);

function paid(amount = '100.00') {
  const ledger = new InMemoryPaymentLedger();
  ledger.create('p1', 'O-1', D(amount), 'RUB');
  ledger.setStatus('p1', 'succeeded');
  return ledger;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof PaymentProviderError ? e.code : 'other';
  }
  return undefined;
}

describe('InMemoryPaymentLedger (ADR-0187)', () => {
  it('статус: неизвестный платёж — not_found', () => {
    expect(codeOf(() => new InMemoryPaymentLedger().getStatus('x'))).toBe(
      'not_found',
    );
  });

  it('поздний успех: failed -> succeeded допустим, succeeded -> failed нет', () => {
    const ledger = new InMemoryPaymentLedger();
    ledger.create('p1', 'O-1', D('10'), 'RUB');
    ledger.setStatus('p1', 'failed');
    expect(ledger.getStatus('p1').status).toBe('failed');
    ledger.setStatus('p1', 'succeeded');
    expect(ledger.getStatus('p1').status).toBe('succeeded');
    ledger.setStatus('p1', 'failed');
    expect(ledger.getStatus('p1').status).toBe('succeeded');
  });

  it('частичный, затем остаток: статус refunded только после полного возврата', () => {
    const ledger = paid();
    ledger.refund('p1', D('30.00'), 'k1');
    expect(ledger.getStatus('p1').status).toBe('succeeded');
    expect(ledger.getStatus('p1').refundedAmount.toString()).toBe('30');
    ledger.refund('p1', D('70.00'), 'k2');
    expect(ledger.getStatus('p1').status).toBe('refunded');
  });

  it('сумма сверх остатка — refund_not_allowed, состояние не меняется', () => {
    const ledger = paid();
    ledger.refund('p1', D('60.00'), 'k1');
    expect(codeOf(() => ledger.refund('p1', D('40.01'), 'k2'))).toBe(
      'refund_not_allowed',
    );
    expect(ledger.getStatus('p1').refundedAmount.toString()).toBe('60');
  });

  it('повтор с тем же ключом возвращает тот же возврат, второй не создаётся', () => {
    const ledger = paid();
    const a = ledger.refund('p1', D('25.00'), 'k1');
    const b = ledger.refund('p1', D('25.00'), 'k1');
    expect(b.refundId).toBe(a.refundId);
    expect(ledger.getStatus('p1').refundedAmount.toString()).toBe('25');
  });

  it('тот же ключ с другой суммой — rejected', () => {
    const ledger = paid();
    ledger.refund('p1', D('25.00'), 'k1');
    expect(codeOf(() => ledger.refund('p1', D('26.00'), 'k1'))).toBe(
      'rejected',
    );
  });

  it.each(['', 'k'.repeat(129)])(
    'ключ идемпотентности %p — rejected',
    (key) => {
      expect(codeOf(() => paid().refund('p1', D('1'), key))).toBe('rejected');
    },
  );

  it.each(['0', '-1', '1.001'])('сумма %s — rejected', (amount) => {
    expect(codeOf(() => paid().refund('p1', D(amount), 'k'))).toBe('rejected');
  });

  it('возврат неоплаченного и неизвестного платежа', () => {
    const ledger = new InMemoryPaymentLedger();
    ledger.create('p1', 'O-1', D('10'), 'RUB');
    expect(codeOf(() => ledger.refund('p1', D('1'), 'k'))).toBe(
      'refund_not_allowed',
    );
    expect(codeOf(() => ledger.refund('nope', D('1'), 'k2'))).toBe('not_found');
  });
});

describe('PaymentProviderError', () => {
  it.each([
    ['unavailable', true],
    ['timeout', true],
    ['rejected', false],
    ['not_found', false],
    ['refund_not_allowed', false],
    ['invalid_response', false],
    ['not_configured', false],
  ] as const)('%s: retryable=%s', (code, retryable) => {
    expect(new PaymentProviderError(code).retryable).toBe(retryable);
  });
});
