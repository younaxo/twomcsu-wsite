import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WalletEntryKind, WalletLedgerEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { walletLedgerEnabled } from './wallet-config';
import {
  walletDisabled,
  walletIdempotencyConflict,
  walletInconsistent,
  walletInsufficient,
} from './wallet-errors';

export interface PostEntryInput {
  userId: string;
  /// Целое со знаком, не 0.
  amount: bigint;
  kind: WalletEntryKind;
  idempotencyKey: string;
  reason?: string | null;
  actorId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  refundId?: string | null;
}

export interface PostEntryResult {
  entry: WalletLedgerEntry;
  /// false — проводка с этим ключом уже была (повтор, баланс не менялся).
  created: boolean;
}

export interface OrderCreditSummary {
  /// Всего зачислено по заказу (PURCHASE).
  credited: bigint;
  /// Ещё не отозвано: PURCHASE + REFUND_REVERSAL + REFUND_RESTORE.
  net: bigint;
}

export interface LedgerPage {
  items: WalletLedgerEntry[];
  total: number;
  page: number;
  limit: number;
}

/// Журнал кошелька рубинов (0.15, ADR-0191). Единственное место, где меняется
/// баланс RUBY. Журнал append-only (UPDATE/DELETE не вызываются, плюс триггер
/// БД), баланс = сумма журнала. Материализованный баланс (`wallets.balance`)
/// обновляется ТОЛЬКО здесь, в той же транзакции, что и вставка проводки, под
/// блокировкой строки кошелька `FOR UPDATE`; перед каждой записью сумма
/// журнала сверяется с балансом (расхождение -> отказ `wallet_inconsistent`).
@Injectable()
export class WalletLedgerService {
  private readonly logger = new Logger(WalletLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return walletLedgerEnabled(this.config);
  }

  assertEnabled(): void {
    if (!this.isEnabled()) throw walletDisabled();
  }

  /// Записать проводку. Вызывать ТОЛЬКО внутри транзакции. Идемпотентно по
  /// `idempotencyKey`. Отрицательный итог невозможен (`wallet_insufficient`).
  async post(
    tx: Prisma.TransactionClient,
    input: PostEntryInput,
  ): Promise<PostEntryResult> {
    if (input.amount === 0n) {
      throw new Error('wallet_zero_amount');
    }
    const replay = await this.findReplay(tx, input);
    if (replay) return { entry: replay, created: false };

    // Строка кошелька: создать при отсутствии, затем заблокировать. Все записи
    // пользователя сериализуются на этой строке.
    await tx.$executeRaw`
      INSERT INTO wallets (id, "userId", currency, balance, version, "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${input.userId}, 'RUBY'::"WalletCurrency", 0, 0, now(), now())
      ON CONFLICT ("userId", currency) DO NOTHING`;
    const rows = await tx.$queryRaw<{ balance: bigint }[]>`
      SELECT balance FROM wallets
      WHERE "userId" = ${input.userId} AND currency = 'RUBY'::"WalletCurrency"
      FOR UPDATE`;
    const row = rows[0];
    if (!row) throw walletInconsistent();

    // Повторная проверка под блокировкой: параллельный повтор уже записал.
    const raced = await this.findReplay(tx, input);
    if (raced) return { entry: raced, created: false };

    const sum = await this.sumLedger(tx, input.userId);
    if (sum !== row.balance) {
      this.logger.error(
        `Кошелёк ${input.userId}: баланс ${row.balance} != сумма журнала ${sum}`,
      );
      throw walletInconsistent();
    }
    const balanceAfter = row.balance + input.amount;
    if (balanceAfter < 0n) throw walletInsufficient();

    const entry = await tx.walletLedgerEntry.create({
      data: {
        userId: input.userId,
        currency: 'RUBY',
        amount: input.amount,
        balanceAfter,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
        actorId: input.actorId ?? null,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        refundId: input.refundId ?? null,
      },
    });
    await tx.$executeRaw`
      UPDATE wallets
      SET balance = ${balanceAfter}, version = version + 1, "updatedAt" = now()
      WHERE "userId" = ${input.userId} AND currency = 'RUBY'::"WalletCurrency"`;
    return { entry, created: true };
  }

  private async findReplay(
    tx: Prisma.TransactionClient,
    input: PostEntryInput,
  ): Promise<WalletLedgerEntry | null> {
    const existing = await tx.walletLedgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existing) return null;
    if (
      existing.userId !== input.userId ||
      existing.amount !== input.amount ||
      existing.kind !== input.kind
    ) {
      throw walletIdempotencyConflict();
    }
    return existing;
  }

  async sumLedger(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<bigint> {
    const agg = await tx.walletLedgerEntry.aggregate({
      where: { userId, currency: 'RUBY' },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0n;
  }

  /// Сверка материализованного баланса с журналом. Баланс для показа берётся
  /// из журнала (источник истины).
  async reconcile(
    userId: string,
  ): Promise<{ ledger: bigint; materialized: bigint; consistent: boolean }> {
    const [ledger, wallet] = await Promise.all([
      this.sumLedger(this.prisma, userId),
      this.prisma.wallet.findUnique({
        where: { userId_currency: { userId, currency: 'RUBY' } },
        select: { balance: true },
      }),
    ]);
    const materialized = wallet?.balance ?? 0n;
    return { ledger, materialized, consistent: ledger === materialized };
  }

  async history(
    userId: string,
    page: number,
    limit: number,
  ): Promise<LedgerPage> {
    const where = { userId, currency: 'RUBY' as const };
    const [items, total] = await Promise.all([
      this.prisma.walletLedgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.walletLedgerEntry.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /// Зачислено/ещё не отозвано по заказу (для возврата, 0.9).
  async orderCreditSummary(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<OrderCreditSummary> {
    const rows = await tx.walletLedgerEntry.groupBy({
      by: ['kind'],
      where: { orderId },
      _sum: { amount: true },
    });
    const sum = (kind: WalletEntryKind) =>
      rows.find((r) => r.kind === kind)?._sum.amount ?? 0n;
    const credited = sum('PURCHASE');
    return {
      credited,
      net: credited + sum('REFUND_REVERSAL') + sum('REFUND_RESTORE'),
    };
  }

  /// Списание рубинов под возврат (REFUND_REVERSAL, отрицательная проводка).
  /// Размер задаёт вызывающий (`needed`, не больше остатка по заказу), баланса
  /// должно хватать (иначе `wallet_insufficient`). Повтор по тому же возврату,
  /// пока прежнее списание не откачено, ничего не пишет.
  async reverseForRefund(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      orderId: string;
      refundId: string;
      needed: bigint;
      actorId: string;
      reason: string;
    },
  ): Promise<PostEntryResult | null> {
    if (input.needed <= 0n) return null;
    const active = await this.activeReversals(tx, input.refundId);
    if (active.length > 0) return null;
    const prior = await tx.walletLedgerEntry.count({
      where: { refundId: input.refundId, kind: 'REFUND_REVERSAL' },
    });
    return this.post(tx, {
      userId: input.userId,
      amount: -input.needed,
      kind: 'REFUND_REVERSAL',
      idempotencyKey: `refund-reversal:${input.refundId}:${prior + 1}`,
      reason: input.reason,
      actorId: input.actorId,
      orderId: input.orderId,
      refundId: input.refundId,
    });
  }

  /// Возврат не состоялся (FAILED): вернуть ранее списанные рубины
  /// (REFUND_RESTORE, ключ по id списания — повтор безопасен).
  async restoreForRefund(
    tx: Prisma.TransactionClient,
    refundId: string,
    actorId: string | null,
  ): Promise<number> {
    const active = await this.activeReversals(tx, refundId);
    for (const reversal of active) {
      await this.post(tx, {
        userId: reversal.userId,
        amount: -reversal.amount,
        kind: 'REFUND_RESTORE',
        idempotencyKey: `refund-restore:${reversal.id}`,
        reason: 'refund_failed',
        actorId,
        orderId: reversal.orderId,
        refundId,
      });
    }
    return active.length;
  }

  /// Списания возврата без парного REFUND_RESTORE.
  private async activeReversals(
    tx: Prisma.TransactionClient,
    refundId: string,
  ): Promise<WalletLedgerEntry[]> {
    const reversals = await tx.walletLedgerEntry.findMany({
      where: { refundId, kind: 'REFUND_REVERSAL' },
    });
    if (reversals.length === 0) return [];
    const restores = await tx.walletLedgerEntry.findMany({
      where: {
        idempotencyKey: { in: reversals.map((r) => `refund-restore:${r.id}`) },
      },
      select: { idempotencyKey: true },
    });
    const restored = new Set(restores.map((r) => r.idempotencyKey));
    return reversals.filter((r) => !restored.has(`refund-restore:${r.id}`));
  }
}
