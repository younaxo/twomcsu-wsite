import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryTaskStatus,
  OrderRefund,
  OrderRefundStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { DeliveryService } from '../delivery/delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WalletError, walletDisabled } from '../wallet/wallet-errors';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import {
  CreateStoreRefundDto,
  ListStoreRefundsQueryDto,
  MarkStoreRefundFailedDto,
} from './dto/store-refund.dto';
import { isPaymentProviderError } from './payment/payment-provider.errors';
import { PaymentProvider } from './payment/payment-provider.interface';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { pendingRefundTimeoutHours, refundsEnabled } from './refunds-config';
import {
  refundBadRequest,
  refundConflict,
  refundDisabled,
  refundForbidden,
  RefundError,
  refundPaymentUnavailable,
  refundTwoFactorLocked,
  refundUnprocessable,
} from './refund-errors';

export type RefundKind = 'NORMAL' | 'OVERRIDE';

export interface RefundResult {
  refund: OrderRefund;
  orderStatus: OrderStatus;
}

/// Защита кода 2FA возврата от перебора: не более N неверных кодов за окно.
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_WINDOW_SECONDS = 15 * 60;
const twoFactorFailKey = (actorId: string) =>
  `store:refund:2fa-fail:${actorId}`;

const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 } as const;
const DELIVERED_TASK_STATUSES = [
  DeliveryTaskStatus.DELIVERED,
  DeliveryTaskStatus.MANUAL_DONE,
];

/// Возвраты (0.9, ADR-0188). Деньги возвращаются только через
/// `PaymentProvider.refund` на исходный способ оплаты. Порядок: короткая
/// транзакция (блокировка заказа, проверки, `REFUND_PENDING`, запись попытки,
/// аудит) -> вызов провайдера ВНЕ транзакции -> короткая транзакция итога.
/// Неизвестный исход (таймаут/5xx) оставляет `REFUND_PENDING`: его разрешает
/// сверка по `getPaymentStatus`, повтор провайдеру идёт тем же ключом.
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registry: PaymentProviderRegistry,
    private readonly delivery: DeliveryService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
    private readonly redis: RedisService,
    /// Журнал кошелька (0.15, ADR-0191): возврат непотраченных рубинов.
    private readonly wallet?: WalletLedgerService,
  ) {}

  isEnabled(): boolean {
    return refundsEnabled(this.config);
  }

  assertEnabled(): void {
    if (!this.isEnabled()) throw refundDisabled();
  }

  async list(query: ListStoreRefundsQueryDto) {
    this.assertEnabled();
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.OrderRefundWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.orderRefund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: {
            select: { orderNumber: true, status: true, total: true },
          },
        },
      }),
      this.prisma.orderRefund.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /// Обычный возврат: только до выдачи.
  create(idOrNumber: string, dto: CreateStoreRefundDto, actorId: string) {
    return this.run('NORMAL', idOrNumber, dto, actorId);
  }

  /// «Возврат по ошибке» после выдачи (Q85): право `store.refund.override`
  /// проверяет контроллер; здесь — свежая 2FA, причина, отзыв, строгий аудит.
  override(idOrNumber: string, dto: CreateStoreRefundDto, actorId: string) {
    return this.run('OVERRIDE', idOrNumber, dto, actorId);
  }

  private async run(
    kind: RefundKind,
    idOrNumber: string,
    dto: CreateStoreRefundDto,
    actorId: string,
  ): Promise<RefundResult> {
    this.assertEnabled();
    const reason = (dto.reason ?? '').trim();
    if (!reason) {
      throw refundBadRequest(
        RefundError.REASON_REQUIRED,
        'Причина возврата обязательна',
      );
    }
    await this.assertFreshTwoFactor(actorId, dto.twoFactorCode);

    const started = await this.begin(kind, idOrNumber, dto, reason, actorId);
    return this.dispatch(started.refund, started.paymentId, started.provider);
  }

  /// Свежий код: только TOTP, резервные коды не подходят; шаг одноразовый
  /// (`TwoFactorService.verify` не принимает повтор того же шага).
  private async assertFreshTwoFactor(
    actorId: string,
    code: string | undefined,
  ): Promise<void> {
    if (!code || !code.trim()) {
      throw refundForbidden(
        RefundError.TWO_FACTOR_REQUIRED,
        'Нужен свежий код двухфакторной аутентификации',
      );
    }
    const key = twoFactorFailKey(actorId);
    const failures = Number(await this.redis.client.get(key)) || 0;
    if (failures >= TWO_FACTOR_MAX_FAILURES) throw refundTwoFactorLocked();
    const method = await this.twoFactor.verify(actorId, code, {
      allowBackup: false,
    });
    if (method !== 'totp') {
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, TWO_FACTOR_WINDOW_SECONDS);
      }
      throw refundForbidden(
        RefundError.TWO_FACTOR_INVALID,
        'Неверный код двухфакторной аутентификации',
      );
    }
    await this.redis.client.del(key);
  }

  private async begin(
    kind: RefundKind,
    idOrNumber: string,
    dto: CreateStoreRefundDto,
    reason: string,
    actorId: string,
  ): Promise<{
    refund: OrderRefund;
    paymentId: string;
    provider: PaymentProvider;
  }> {
    const found = await this.prisma.order.findFirst({
      where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Заказ не найден');
    const id = found.id;

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Заказ не найден');
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { refunds: { orderBy: { createdAt: 'asc' } } },
      });

      if ((order.paymentMethod ?? '').toLowerCase() === 'ruby') {
        // Допущение (ADR-0188): кошелька рубинов в оформлении заказа нет; при
        // его появлении возврат — только непотраченный остаток на тот же кошелёк.
        throw refundUnprocessable(
          RefundError.RUBIES_UNSUPPORTED,
          'Возврат рубинов пока не поддерживается',
        );
      }
      if (order.status === OrderStatus.REFUND_PENDING) {
        throw refundConflict(
          RefundError.IN_PROGRESS,
          'Возврат по заказу уже выполняется',
        );
      }
      if (order.status === OrderStatus.REFUNDED) {
        throw refundConflict(
          RefundError.ALREADY_REFUNDED,
          'Заказ уже возвращён',
        );
      }
      if (
        order.status !== OrderStatus.COMPLETED &&
        order.status !== OrderStatus.REFUND_FAILED
      ) {
        throw refundConflict(
          RefundError.ORDER_NOT_REFUNDABLE,
          `Вернуть можно только оплаченный заказ, текущий статус: ${order.status}`,
        );
      }

      const provider = order.paymentProvider
        ? this.registry.get(order.paymentProvider)
        : undefined;
      if (!order.paymentId || !provider || !provider.isConfigured()) {
        throw refundPaymentUnavailable();
      }

      const refunded = order.refunds
        .filter((r) => r.status === OrderRefundStatus.SUCCEEDED)
        .reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
      const remaining = order.total.minus(refunded);
      if (!remaining.gt(0)) {
        throw refundConflict(
          RefundError.ALREADY_REFUNDED,
          'Заказ уже возвращён',
        );
      }
      const amount = this.parseAmount(dto.amount, remaining);

      await this.assertDeliveryRule(tx, kind, id);

      const lastFailed = [...order.refunds]
        .reverse()
        .find((r) => r.status === OrderRefundStatus.FAILED);
      // Повтор после отказа с той же суммой и видом — тот же ключ: провайдер не
      // создаст второй возврат, если «отказ» на деле дошёл до него.
      const retry =
        order.status === OrderStatus.REFUND_FAILED &&
        lastFailed &&
        lastFailed.kind === kind &&
        lastFailed.amount.equals(amount)
          ? lastFailed
          : null;
      const refund = retry
        ? await tx.orderRefund.update({
            where: { id: retry.id },
            data: {
              status: OrderRefundStatus.PENDING,
              errorCode: null,
              completedAt: null,
              reason,
              actorId,
            },
          })
        : await tx.orderRefund.create({
            data: {
              orderId: id,
              amount,
              reason,
              kind,
              actorId,
              idempotencyKey: `refund:${id}:${order.refunds.length + 1}`,
            },
          });
      const reversedRubies = await this.reverseRubies(
        tx,
        order,
        refund,
        amount,
        remaining,
        reason,
        actorId,
      );
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.REFUND_PENDING },
      });
      await this.audit.logInTx(tx, {
        actorId,
        action:
          kind === 'OVERRIDE'
            ? 'orders.refund.override_requested'
            : 'orders.refund.requested',
        targetType: 'order',
        targetId: id,
        severity: kind === 'OVERRIDE' ? 'critical' : 'warning',
        changes: {
          orderNumber: order.orderNumber,
          refundId: refund.id,
          kind,
          amount: amount.toFixed(2),
          total: order.total.toFixed(2),
          reason,
          retry: !!retry,
          ...(reversedRubies > 0n
            ? { rubiesReversed: reversedRubies.toString() }
            : {}),
        },
      });
      return { refund, paymentId: order.paymentId, provider };
    }, TX_OPTIONS);
  }

  /// Рубины, купленные по заказу (0.15, ADR-0191): возврат денег = списание
  /// непотраченного остатка рубинов проводкой REFUND_REVERSAL в той же
  /// транзакции, под блокировкой кошелька. Размер: весь остаток по заказу при
  /// возврате всего остатка суммы, иначе пропорционально (вверх), не больше
  /// остатка по заказу; баланса должно хватать, иначе отказ `refund_rubies_spent`
  /// (до обращения к провайдеру: деньги не уходят). Флаг выкл. и рубины по
  /// заказу есть -> 503 `wallet_disabled` (иначе деньги вернулись бы, а рубины
  /// остались). Возвращает списанное (0 — рубинов по заказу нет).
  private async reverseRubies(
    tx: Prisma.TransactionClient,
    order: { id: string; userId: string | null; total: Prisma.Decimal },
    refund: OrderRefund,
    amount: Prisma.Decimal,
    remaining: Prisma.Decimal,
    reason: string,
    actorId: string,
  ): Promise<bigint> {
    if (!this.wallet) return 0n;
    // Единый порядок блокировок: заказ -> кошелёк (так же, как у исполнителя
    // wallet при зачислении). Повторная блокировка в той же транзакции безопасна.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    const summary = await this.wallet.orderCreditSummary(tx, order.id);
    if (summary.credited === 0n) return 0n;
    if (!this.wallet.isEnabled()) throw walletDisabled();
    const credited = summary.credited;
    const net = summary.net;
    const proportional = BigInt(
      new Prisma.Decimal(credited.toString())
        .times(amount)
        .div(order.total)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_UP)
        .toFixed(0),
    );
    const needed = amount.equals(remaining)
      ? net
      : proportional < net
        ? proportional
        : net;
    if (needed <= 0n) return 0n;
    const recipient = await tx.walletLedgerEntry.findFirst({
      where: { orderId: order.id, kind: 'PURCHASE' },
      select: { userId: true },
    });
    if (!recipient) return 0n;
    try {
      await this.wallet.reverseForRefund(tx, {
        userId: recipient.userId,
        orderId: order.id,
        refundId: refund.id,
        needed,
        actorId,
        reason: `refund:${reason}`.slice(0, 500),
      });
    } catch (error) {
      if (
        (error as { getResponse?: () => { code?: string } }).getResponse?.()
          ?.code === WalletError.INSUFFICIENT
      ) {
        throw refundConflict(
          RefundError.RUBIES_SPENT,
          'Рубины по заказу уже потрачены или списаны: вернуть можно только непотраченный остаток',
        );
      }
      throw error;
    }
    return needed;
  }

  private parseAmount(
    raw: string | undefined,
    remaining: Prisma.Decimal,
  ): Prisma.Decimal {
    if (raw === undefined || raw === null || raw === '') return remaining;
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(raw);
    } catch {
      throw refundBadRequest(RefundError.AMOUNT_INVALID, 'Неверная сумма');
    }
    if (!amount.gt(0) || amount.decimalPlaces() > 2) {
      throw refundBadRequest(RefundError.AMOUNT_INVALID, 'Неверная сумма');
    }
    if (amount.gt(remaining)) {
      throw refundBadRequest(
        RefundError.EXCEEDS_PAID,
        'Сумма возврата больше остатка оплаченного',
      );
    }
    return amount;
  }

  /// До выдачи — обычный возврат (409 после выдачи, Q85). После выдачи —
  /// только override; override без выданного не нужен (409).
  private async assertDeliveryRule(
    tx: Prisma.TransactionClient,
    kind: RefundKind,
    orderId: string,
  ): Promise<void> {
    let blocked: ConflictException | null = null;
    try {
      // Блокирует строки заданий (гонка «возврат против выдачи») и бросает
      // 409 refund_after_delivery / delivery_in_progress.
      await this.delivery.assertRefundAllowed(tx, orderId);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      blocked = error;
    }
    const deliveredTasks = await tx.deliveryTask.count({
      where: {
        status: { in: DELIVERED_TASK_STATUSES },
        orderItem: { orderId },
      },
    });
    const deliveredItems = await tx.orderItem.count({
      where: { orderId, isDelivered: true },
    });
    const delivered = deliveredTasks + deliveredItems > 0;
    if (kind === 'NORMAL') {
      if (delivered) {
        throw refundConflict(
          RefundError.AFTER_DELIVERY,
          'Товар уже выдан: обычный возврат запрещён',
        );
      }
      if (blocked) throw blocked;
      return;
    }
    if (!delivered) {
      throw refundConflict(
        RefundError.OVERRIDE_NOT_NEEDED,
        'Товар не выдан: используйте обычный возврат',
      );
    }
  }

  /// Вызов провайдера вне транзакции и запись итога.
  private async dispatch(
    refund: OrderRefund,
    paymentId: string,
    provider: PaymentProvider,
  ): Promise<RefundResult> {
    try {
      const result = await provider.refund(
        paymentId,
        refund.amount,
        refund.idempotencyKey,
      );
      if (!result.amount.equals(refund.amount)) {
        this.logger.warn(
          `Возврат ${refund.id}: сумма провайдера не совпала, нужен ручной разбор`,
        );
        await this.auditAmountMismatch(refund, result.amount);
        return this.snapshot(refund.id);
      }
      if (result.status === 'succeeded') {
        return await this.applyOutcome(refund.id, 'succeeded', result.refundId);
      }
      if (result.status === 'failed') {
        return await this.applyOutcome(
          refund.id,
          'failed',
          result.refundId,
          'provider_failed',
        );
      }
      await this.prisma.orderRefund.updateMany({
        where: { id: refund.id, providerRefundId: null },
        data: { providerRefundId: result.refundId.slice(0, 128) },
      });
      return this.snapshot(refund.id);
    } catch (error) {
      if (isPaymentProviderError(error)) {
        if (error.retryable) {
          this.logger.warn(
            `Возврат ${refund.id}: исход неизвестен (${error.code}), останется REFUND_PENDING`,
          );
          return this.snapshot(refund.id);
        }
        return this.applyOutcome(refund.id, 'failed', undefined, error.code);
      }
      this.logger.error(
        `Возврат ${refund.id}: непредвиденный сбой вызова провайдера`,
      );
      return this.snapshot(refund.id);
    }
  }

  private async snapshot(refundId: string): Promise<RefundResult> {
    const refund = await this.prisma.orderRefund.findUniqueOrThrow({
      where: { id: refundId },
      include: { order: { select: { status: true } } },
    });
    const { order, ...rest } = refund;
    return { refund: rest as OrderRefund, orderStatus: order.status };
  }

  /// Итог возврата от провайдера (ответ, сверка, будущий вебхук возврата).
  /// Идемпотентно: повтор того же итога ничего не меняет; `succeeded` после
  /// `failed` принимается (деньги фактически ушли), `failed` после
  /// `succeeded` игнорируется.
  async applyOutcome(
    refundId: string,
    outcome: 'succeeded' | 'failed',
    providerRefundId?: string,
    errorCode?: string,
  ): Promise<RefundResult> {
    await this.prisma.$transaction(async (tx) => {
      const ref = await tx.orderRefund.findUnique({ where: { id: refundId } });
      if (!ref) throw new NotFoundException('Возврат не найден');
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE id = ${ref.orderId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Заказ не найден');
      const current = await tx.orderRefund.findUniqueOrThrow({
        where: { id: refundId },
      });
      if (current.status === OrderRefundStatus.SUCCEEDED) return;
      if (outcome === 'failed') {
        await this.markFailed(tx, current, errorCode ?? 'failed');
      } else {
        await this.markSucceeded(tx, current, providerRefundId);
      }
    }, TX_OPTIONS);
    return this.snapshot(refundId);
  }

  private async markFailed(
    tx: Prisma.TransactionClient,
    refund: OrderRefund,
    code: string,
  ): Promise<void> {
    if (refund.status === OrderRefundStatus.FAILED) return;
    // 0.15: возврат не состоялся — вернуть списанные под него рубины.
    await this.wallet?.restoreForRefund(tx, refund.id, refund.actorId);
    await tx.orderRefund.update({
      where: { id: refund.id },
      data: {
        status: OrderRefundStatus.FAILED,
        errorCode: code.slice(0, 64),
        completedAt: new Date(),
      },
    });
    await tx.order.updateMany({
      where: { id: refund.orderId, status: OrderStatus.REFUND_PENDING },
      data: { status: OrderStatus.REFUND_FAILED },
    });
    await this.auditSystem(tx, refund, 'orders.refund.failed', 'warning', {
      errorCode: code,
    });
  }

  private async markSucceeded(
    tx: Prisma.TransactionClient,
    refund: OrderRefund,
    providerRefundId?: string,
  ): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: refund.orderId },
    });
    const others = await tx.orderRefund.findMany({
      where: {
        orderId: order.id,
        status: OrderRefundStatus.SUCCEEDED,
        id: { not: refund.id },
      },
      select: { amount: true },
    });
    const refunded = others.reduce(
      (sum, r) => sum.plus(r.amount),
      refund.amount,
    );
    const full = refunded.gte(order.total);
    let requiresManualRevoke = false;

    // 0.15: деньги фактически ушли после «отказа» (списание рубинов было
    // откачено) — списываем рубины заново; если не вышло, нужен ручной разбор.
    if (refund.status === OrderRefundStatus.FAILED && this.wallet) {
      try {
        await this.reverseRubies(
          tx,
          order,
          refund,
          refund.amount,
          order.total.minus(refunded.minus(refund.amount)),
          refund.reason,
          refund.actorId as string,
        );
      } catch (error) {
        this.logger.error(
          `Возврат ${refund.id}: рубины не списаны после позднего успеха`,
        );
        requiresManualRevoke = true;
        await this.auditSystem(
          tx,
          refund,
          'orders.refund.rubies_unreversed',
          'critical',
          { code: (error as { message?: string }).message ?? 'unknown' },
        );
      }
    }
    if (full) {
      await this.delivery.cancelOpenTasks(tx, order.id);
      if (refund.kind === 'OVERRIDE') {
        await this.delivery.revokeSiteGrants(
          tx,
          order.id,
          refund.actorId ?? undefined,
        );
        // Сайтовое отозвано; игровые выдачи отозвать автоматически нельзя
        // (ADR-0184 п. 8) — остаётся пометка «нужен ручной отзыв».
        const left =
          (await tx.deliveryTask.count({
            where: {
              status: { in: DELIVERED_TASK_STATUSES },
              orderItem: { orderId: order.id },
            },
          })) +
          (await tx.orderItem.count({
            where: { orderId: order.id, isDelivered: true },
          }));
        requiresManualRevoke = left > 0;
      }
    }
    await tx.orderRefund.update({
      where: { id: refund.id },
      data: {
        status: OrderRefundStatus.SUCCEEDED,
        errorCode: null,
        completedAt: new Date(),
        requiresManualRevoke,
        ...(providerRefundId
          ? { providerRefundId: providerRefundId.slice(0, 128) }
          : {}),
      },
    });
    if (
      order.status === OrderStatus.REFUND_PENDING ||
      order.status === OrderStatus.REFUND_FAILED
    ) {
      await tx.order.update({
        where: { id: order.id },
        data: full
          ? {
              status: OrderStatus.REFUNDED,
              refundedAt: new Date(),
              cancelReason: refund.reason,
            }
          : { status: OrderStatus.COMPLETED },
      });
    }
    await this.auditSystem(
      tx,
      refund,
      refund.kind === 'OVERRIDE'
        ? 'orders.refund.override_completed'
        : 'orders.refund.completed',
      refund.kind === 'OVERRIDE' ? 'critical' : 'warning',
      {
        full,
        refunded: refunded.toFixed(2),
        requiresManualRevoke,
      },
    );
  }

  private async auditSystem(
    tx: Prisma.TransactionClient,
    refund: OrderRefund,
    action: string,
    severity: 'warning' | 'critical',
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logInTx(tx, {
      // Итог может прийти от сверки (без человека): пишем инициатора возврата.
      actorId: refund.actorId as string, // всегда задан при создании попытки
      action,
      targetType: 'order',
      targetId: refund.orderId,
      severity,
      changes: {
        refundId: refund.id,
        kind: refund.kind,
        amount: refund.amount.toFixed(2),
        ...extra,
      } as Prisma.InputJsonValue,
    });
  }

  /// Расхождение суммы ответа провайдера и попытки: возврат остаётся
  /// REFUND_PENDING (ручной разбор), но след в аудите обязателен.
  private async auditAmountMismatch(
    refund: OrderRefund,
    providerAmount: Prisma.Decimal,
  ): Promise<void> {
    try {
      await this.audit.log({
        actorId: refund.actorId as string,
        action: 'orders.refund.amount_mismatch',
        targetType: 'order',
        targetId: refund.orderId,
        severity: 'critical',
        changes: {
          refundId: refund.id,
          expected: refund.amount.toFixed(2),
          providerAmount: providerAmount.toFixed(2),
        },
      });
    } catch {
      this.logger.error(
        `Возврат ${refund.id}: не записан аудит расхождения суммы`,
      );
    }
  }

  /// Ручной выход админа (право orders.refund проверяет контроллер): отметить
  /// зависший REFUND_PENDING как неудавшийся. Нужны свежая 2FA и причина.
  /// Если провайдер на деле вернул деньги, итог придёт со сверкой/повтором:
  /// повтор с той же суммой идёт прежним ключом идемпотентности.
  async markPendingFailed(
    idOrNumber: string,
    dto: MarkStoreRefundFailedDto,
    actorId: string,
  ): Promise<RefundResult> {
    this.assertEnabled();
    const reason = (dto.reason ?? '').trim();
    if (!reason) {
      throw refundBadRequest(
        RefundError.REASON_REQUIRED,
        'Причина обязательна',
      );
    }
    await this.assertFreshTwoFactor(actorId, dto.twoFactorCode);
    const found = await this.prisma.order.findFirst({
      where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Заказ не найден');
    const refundId = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE id = ${found.id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Заказ не найден');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          refunds: { where: { status: OrderRefundStatus.PENDING }, take: 1 },
        },
      });
      const pending = order.refunds[0];
      if (order.status !== OrderStatus.REFUND_PENDING || !pending) {
        throw refundConflict(
          RefundError.NOT_PENDING,
          'У заказа нет возврата в ожидании',
        );
      }
      await this.markFailed(tx, pending, 'manual_failed');
      await this.audit.logInTx(tx, {
        actorId,
        action: 'orders.refund.marked_failed',
        targetType: 'order',
        targetId: order.id,
        severity: 'critical',
        changes: {
          orderNumber: order.orderNumber,
          refundId: pending.id,
          amount: pending.amount.toFixed(2),
          reason,
        },
      });
      return pending.id;
    }, TX_OPTIONS);
    return this.snapshot(refundId);
  }

  /// Сверка REFUND_PENDING по статусу платежа у провайдера. Итог: 'resolved'
  /// (возврат отражён у провайдера), 'expired' (ответа нет дольше срока
  /// STORE_REFUNDS_PENDING_TIMEOUT_HOURS -> REFUND_FAILED с аудитом) или
  /// 'pending'. Срок считается от последнего обновления попытки (повтор его
  /// сбрасывает).
  async syncPendingRefund(
    orderId: string,
    now: Date = new Date(),
  ): Promise<'resolved' | 'pending' | 'expired'> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        refunds: { where: { status: OrderRefundStatus.PENDING }, take: 1 },
      },
    });
    const pending = order?.refunds[0];
    if (!order || !pending || order.status !== OrderStatus.REFUND_PENDING) {
      return 'pending';
    }
    const provider = order.paymentProvider
      ? this.registry.get(order.paymentProvider)
      : undefined;
    if (order.paymentId && provider && provider.isConfigured()) {
      const status = await provider.getPaymentStatus(order.paymentId);
      const succeeded = await this.prisma.orderRefund.findMany({
        where: { orderId, status: OrderRefundStatus.SUCCEEDED },
        select: { amount: true },
      });
      const expected = succeeded.reduce(
        (sum, r) => sum.plus(r.amount),
        pending.amount,
      );
      if (status.refundedAmount.gte(expected)) {
        await this.applyOutcome(pending.id, 'succeeded');
        return 'resolved';
      }
    }
    const timeoutMs = pendingRefundTimeoutHours(this.config) * 3_600_000;
    const since = pending.updatedAt.getTime();
    if (now.getTime() - since >= timeoutMs) {
      await this.applyOutcome(
        pending.id,
        'failed',
        undefined,
        'provider_timeout',
      );
      return 'expired';
    }
    return 'pending';
  }
}
