import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { TwoFactorService } from '../auth/two-factor/two-factor.service';
import { INCR_EXPIRE_SCRIPT } from '../bridge/bridge-redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AdjustWalletDto } from './dto/wallet.dto';
import { walletAdjustDailyMax, walletAdjustMax } from './wallet-config';
import {
  walletBadRequest,
  walletForbidden,
  WalletError,
  walletTwoFactorLocked,
  walletUserNotFound,
} from './wallet-errors';
import { WalletLedgerService } from './wallet-ledger.service';
import { serializeEntry, serializePage } from './wallet-serialize';

/// Защита кода 2FA корректировки от перебора: не более N попыток за окно.
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_WINDOW_SECONDS = 15 * 60;
const failKey = (actorId: string) => `wallet:adjust:2fa-fail:${actorId}`;

const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 } as const;

/// Админ-API кошелька (0.15, ADR-0191): просмотр (право `wallet.view`) и ручная
/// корректировка (право `wallet.adjust`, свежая TOTP-2FA, причина, потолок,
/// строгий аудит в той же транзакции, нельзя уйти в минус). Права проверяет
/// контроллер. Всё за флагом WALLET_LEDGER_ENABLED.
@Injectable()
export class WalletAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ledger: WalletLedgerService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
    private readonly redis: RedisService,
  ) {}

  async view(userId: string, page: number, limit: number) {
    this.ledger.assertEnabled();
    await this.assertUser(userId);
    const [recon, history] = await Promise.all([
      this.ledger.reconcile(userId),
      this.ledger.history(userId, page, limit),
    ]);
    return {
      userId,
      currency: 'RUBY',
      scale: 0,
      balance: recon.ledger.toString(),
      consistent: recon.consistent,
      history: serializePage(history, true),
    };
  }

  async adjust(userId: string, dto: AdjustWalletDto, actorId: string) {
    this.ledger.assertEnabled();
    const reason = (dto.reason ?? '').trim();
    if (!reason) {
      throw walletBadRequest(
        WalletError.REASON_REQUIRED,
        'Причина корректировки обязательна',
      );
    }
    let amount: bigint;
    try {
      amount = BigInt(dto.amount);
    } catch {
      throw walletBadRequest(WalletError.AMOUNT_INVALID, 'Неверная сумма');
    }
    if (amount === 0n) {
      throw walletBadRequest(WalletError.AMOUNT_INVALID, 'Неверная сумма');
    }
    const max = BigInt(walletAdjustMax(this.config));
    if ((amount < 0n ? -amount : amount) > max) {
      throw walletBadRequest(
        WalletError.ADJUST_LIMIT,
        `Корректировка не более ${max} за раз`,
      );
    }
    // Свой кошелёк корректировать нельзя (разделение обязанностей).
    if (userId === actorId) {
      throw walletForbidden(
        WalletError.SELF_ADJUST_FORBIDDEN,
        'Нельзя корректировать собственный кошелёк',
      );
    }
    // Порядок: формат -> пользователь -> 2FA (код не сгорает из-за опечатки).
    await this.assertUser(userId);
    await this.assertFreshTwoFactor(actorId, dto.twoFactorCode);

    const key = dto.requestId
      ? `adjust:${actorId}:${dto.requestId}`
      : `adjust:${randomUUID()}`;
    const dailyMax = BigInt(walletAdjustDailyMax(this.config));
    const result = await this.prisma.$transaction(async (tx) => {
      // Корректировки одного актёра сериализуются (иначе параллельные запросы
      // к разным кошелькам обходят суточный лимит).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet-adjust:${actorId}`}))`;
      const posted = await this.ledger.post(tx, {
        userId,
        amount,
        kind: 'ADMIN_ADJUST',
        idempotencyKey: key,
        reason,
        actorId,
      });
      if (posted.created) {
        // Сумма модулей за 24 часа, включая эту проводку; превышение откатывает
        // транзакцию. Повтор по requestId (created=false) не считается.
        const rows = await tx.$queryRaw<{ total: bigint | null }[]>`
          SELECT COALESCE(SUM(ABS(amount)), 0)::bigint AS total
          FROM wallet_ledger_entries
          WHERE kind = 'ADMIN_ADJUST'::"WalletEntryKind" AND "actorId" = ${actorId}
            AND "createdAt" >= ${new Date(Date.now() - 24 * 60 * 60 * 1000)}`;
        if ((rows[0]?.total ?? 0n) > dailyMax) {
          throw walletBadRequest(
            WalletError.ADJUST_DAILY_LIMIT,
            `Суточный лимит корректировок ${dailyMax} рубинов исчерпан`,
          );
        }
        await this.audit.logInTx(tx, {
          actorId,
          action: 'wallet.adjusted',
          targetType: 'user',
          targetId: userId,
          severity: 'critical',
          changes: {
            entryId: posted.entry.id,
            amount: amount.toString(),
            balanceAfter: posted.entry.balanceAfter.toString(),
            reason,
          },
        });
      }
      return posted;
    }, TX_OPTIONS);
    return {
      entry: serializeEntry(result.entry, true),
      balance: result.entry.balanceAfter.toString(),
      replayed: !result.created,
    };
  }

  private async assertUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw walletUserNotFound();
  }

  /// Свежий код: только TOTP, резервные не подходят. INCR+EXPIRE атомарно
  /// (Lua) ДО проверки кода: параллельные запросы не обходят лимит.
  private async assertFreshTwoFactor(
    actorId: string,
    code: string | undefined,
  ): Promise<void> {
    if (!code || !code.trim()) {
      throw walletForbidden(
        WalletError.TWO_FACTOR_REQUIRED,
        'Нужен свежий код 2FA',
      );
    }
    const key = failKey(actorId);
    const attempts = Number(
      await this.redis.client.eval(
        INCR_EXPIRE_SCRIPT,
        1,
        key,
        '1',
        String(TWO_FACTOR_WINDOW_SECONDS),
        'first',
      ),
    );
    if (attempts > TWO_FACTOR_MAX_FAILURES) throw walletTwoFactorLocked();
    const method = await this.twoFactor.verify(actorId, code, {
      allowBackup: false,
    });
    if (method !== 'totp') {
      throw walletForbidden(WalletError.TWO_FACTOR_INVALID, 'Неверный код 2FA');
    }
    await this.redis.client.del(key);
  }
}
