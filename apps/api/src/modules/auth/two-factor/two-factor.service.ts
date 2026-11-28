import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { NotificationType, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PermissionService } from '../../roles/permission.service';
import { generateBackupCodes, normalizeBackupCode } from './backup-codes';
import { SecretBox } from './secret-box';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

/// Двухфакторная аутентификация TOTP (ADR-0109).
///
/// - Настройка: `setup` кладёт зашифрованный «ожидающий» секрет, `enable`
///   подтверждает его первым кодом и выдаёт резервные коды (один раз).
/// - Вход: после пароля (или внешнего аккаунта) — одноразовый челлендж в Redis
///   (5 мин, ≤ 5 попыток), код TOTP или резервный код.
/// - Без `TWO_FACTOR_ENCRYPTION_KEY` функция недоступна (503). 2FA персонала
///   обязательна всегда (Q22, ADR-0169): без ключа вне production (явные
///   NODE_ENV=development/test) требование не применяется — выполнить его
///   нельзя; в production без ключа действия персонала отклоняются (fail-closed,
///   ADR-0156/ADR-0164).

export const TWO_FACTOR_ISSUER = 'twomc.su';
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_MAX_ATTEMPTS = 5;

export interface TwoFactorStatus {
  available: boolean;
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

export type TwoFactorMethod = 'totp' | 'backup';

/// Откуда пришёл запрос (для аудита): IP уже нормализован с учётом trust proxy.
export interface TwoFactorAuditContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly box: SecretBox | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {
    const key = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', '') ?? '';
    this.box = key.length >= 32 ? new SecretBox(key) : null;
    if (!this.box) {
      this.logger.warn(
        'TWO_FACTOR_ENCRYPTION_KEY не задан — двухфакторная аутентификация недоступна',
      );
    }
  }

  get available(): boolean {
    return this.box !== null;
  }

  private requireBox(): SecretBox {
    if (!this.box) {
      throw new ServiceUnavailableException({
        code: 'two_factor_unavailable',
        message: 'Двухфакторная аутентификация пока не настроена на сервере',
      });
    }
    return this.box;
  }

  /// Запись в журнал аудита о событии 2FA своего аккаунта (актёр = цель).
  /// Без секретов и кодов: только факт, причина и способ. severity critical —
  /// если выключение у персонала (роль с правами или superuser). Запись в
  /// транзакции (`tx`) строгая: нет аудита — нет действия.
  private async auditEvent(
    userId: string,
    action: string,
    context: TwoFactorAuditContext | undefined,
    options: {
      changes?: Record<string, string | number | boolean>;
      severity?: 'info' | 'warning' | 'critical';
      criticalForStaff?: boolean;
      tx?: Prisma.TransactionClient;
    } = {},
  ): Promise<void> {
    let severity = options.severity ?? 'info';
    let staff = false;
    if (options.criticalForStaff) {
      try {
        const effective =
          await this.permissions.getEffectivePermissions(userId);
        staff = effective.superuser || effective.permissions.length > 0;
      } catch {
        staff = false;
      }
      if (staff) severity = 'critical';
    }
    await this.audit.log({
      actorId: userId,
      action,
      targetType: 'user',
      targetId: userId,
      changes: { ...options.changes, ...(staff ? { staff: true } : {}) },
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      severity,
      tx: options.tx,
      strict: options.tx !== undefined,
    });
  }

  /// Уведомление владельцу аккаунта о выключении 2FA (без секретов). Сбой
  /// уведомления не ломает уже выполненное действие.
  private async notifyDisabled(userId: string): Promise<void> {
    try {
      await this.notifications.create({
        userId,
        type: NotificationType.SYSTEM,
        title: 'Двухфакторная аутентификация выключена',
        message:
          'Если это были не вы, смените пароль и сразу обратитесь в поддержку.',
        link: '/settings/security',
        bypassPreferences: true,
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось отправить уведомление о выключении 2FA: ${(error as Error).message}`,
      );
    }
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const [user, remaining] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
      }),
      this.prisma.twoFactorBackupCode.count({
        where: { userId, usedAt: null },
      }),
    ]);
    return {
      available: this.available,
      enabled: user.twoFactorEnabled,
      enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
      backupCodesRemaining: user.twoFactorEnabled ? remaining : 0,
    };
  }

  /// Шаг 1: новый секрет (ожидает подтверждения). Повторный вызов заменяет
  /// прежний ожидающий секрет — QR из старой попытки перестаёт работать.
  async setup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const box = this.requireBox();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, twoFactorEnabled: true },
    });
    if (user.twoFactorEnabled) {
      throw new ConflictException('Двухфакторная аутентификация уже включена');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecret: box.encrypt(secret) },
    });
    return {
      secret,
      otpauthUri: otpauthUri(TWO_FACTOR_ISSUER, user.username, secret),
    };
  }

  /// Шаг 2: первый код из приложения включает 2FA и выдаёт резервные коды.
  async enable(
    userId: string,
    code: string,
    context?: TwoFactorAuditContext,
  ): Promise<{ backupCodes: string[] }> {
    const box = this.requireBox();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorPendingSecret: false },
    });
    if (user.twoFactorEnabled) {
      throw new ConflictException('Двухфакторная аутентификация уже включена');
    }
    if (!user.twoFactorPendingSecret) {
      throw new BadRequestException('Сначала начните настройку заново');
    }
    const secret = box.decrypt(user.twoFactorPendingSecret);
    const step = verifyTotp(secret, code, Date.now());
    if (step === null) {
      throw new BadRequestException(
        'Код не подошёл. Проверьте время на телефоне и введите новый код.',
      );
    }
    const backupCodes = generateBackupCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: box.encrypt(secret),
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: new Date(),
          twoFactorLastStep: step,
        },
      });
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
      await tx.twoFactorBackupCode.createMany({
        data: backupCodes.map((value) => ({
          userId,
          codeHash: box.hash(normalizeBackupCode(value)!),
        })),
      });
      await this.auditEvent(userId, '2fa.enable', context, {
        changes: { backupCodesIssued: backupCodes.length },
        tx,
      });
    });
    return { backupCodes };
  }

  /// Отключение: пароль + действующий код (TOTP или резервный).
  async disable(
    userId: string,
    password: string,
    code: string,
    context?: TwoFactorAuditContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { password: false },
    });
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Двухфакторная аутентификация не включена');
    }
    if (!(await bcrypt.compare(password, user.password))) {
      await this.auditEvent(userId, '2fa.disable.failed', context, {
        changes: { reason: 'wrong_password' },
        severity: 'warning',
      });
      throw new UnauthorizedException('Неверный пароль');
    }
    const method = await this.verify(userId, code);
    if (!method) {
      await this.auditEvent(userId, '2fa.disable.failed', context, {
        changes: { reason: 'wrong_code' },
        severity: 'warning',
      });
      throw new UnauthorizedException('Неверный код');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: null,
          twoFactorLastStep: null,
        },
      });
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
      await this.auditEvent(userId, '2fa.disable', context, {
        changes: { method },
        criticalForStaff: true,
        tx,
      });
    });
    await this.notifyDisabled(userId);
  }

  /// Новый набор резервных кодов (старые перестают действовать). Только по
  /// коду из приложения — резервным кодом новый набор не получить.
  async regenerateBackupCodes(
    userId: string,
    code: string,
    context?: TwoFactorAuditContext,
  ): Promise<{ backupCodes: string[] }> {
    const box = this.requireBox();
    if (!(await this.verify(userId, code, { allowBackup: false }))) {
      await this.auditEvent(
        userId,
        '2fa.backup_codes.regenerate.failed',
        context,
        { changes: { reason: 'wrong_code' }, severity: 'warning' },
      );
      throw new UnauthorizedException('Неверный код');
    }
    const backupCodes = generateBackupCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
      await tx.twoFactorBackupCode.createMany({
        data: backupCodes.map((value) => ({
          userId,
          codeHash: box.hash(normalizeBackupCode(value)!),
        })),
      });
      await this.auditEvent(userId, '2fa.backup_codes.regenerate', context, {
        changes: { backupCodesIssued: backupCodes.length },
        tx,
      });
    });
    return { backupCodes };
  }

  /// Проверка кода: 6 цифр — TOTP (шаг не раньше уже принятого), иначе —
  /// резервный код (помечается использованным). Возвращает способ или null.
  async verify(
    userId: string,
    code: string,
    options: { allowBackup?: boolean } = {},
  ): Promise<TwoFactorMethod | null> {
    const box = this.requireBox();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { twoFactorSecret: false },
    });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) return null;
    const trimmed = code.trim();
    if (/^\d[\d\s]*$/.test(trimmed)) {
      const step = verifyTotp(
        box.decrypt(user.twoFactorSecret),
        trimmed,
        Date.now(),
        user.twoFactorLastStep,
      );
      if (step === null) return null;
      // Условие на шаг — защита от гонки двух одновременных входов одним кодом.
      const updated = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [
            { twoFactorLastStep: null },
            { twoFactorLastStep: { lt: step } },
          ],
        },
        data: { twoFactorLastStep: step },
      });
      return updated.count === 1 ? 'totp' : null;
    }
    if (options.allowBackup === false) return null;
    const normalized = normalizeBackupCode(trimmed);
    if (!normalized) return null;
    const used = await this.prisma.twoFactorBackupCode.updateMany({
      where: { userId, codeHash: box.hash(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1 ? 'backup' : null;
  }

  // --- Второй шаг входа ---------------------------------------------------

  private challengeKey(id: string): string {
    // В Redis — только хеш: дамп Redis не даёт готовых челленджей.
    return `2fa:challenge:${createHash('sha256').update(id).digest('hex')}`;
  }

  async createChallenge(userId: string): Promise<string> {
    const id = randomBytes(32).toString('base64url');
    await this.redis.client.set(
      this.challengeKey(id),
      JSON.stringify({ userId, attempts: 0 }),
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return id;
  }

  /// Проверяет код для челленджа. Успех — userId (челлендж удаляется), иначе
  /// 401; после 5 неудач челлендж сгорает — нужно войти заново.
  async completeChallenge(
    id: string | undefined,
    code: string,
    context?: TwoFactorAuditContext,
  ): Promise<{ userId: string; method: TwoFactorMethod }> {
    const expired = new UnauthorizedException({
      code: 'two_factor_expired',
      message: 'Время на ввод кода истекло. Войдите ещё раз.',
    });
    if (!id) throw expired;
    const key = this.challengeKey(id);
    const raw = await this.redis.client.get(key);
    if (!raw) throw expired;
    const challenge = JSON.parse(raw) as { userId: string; attempts: number };
    const method = await this.verify(challenge.userId, code);
    if (method) {
      await this.redis.client.del(key);
      if (method === 'backup') {
        await this.auditEvent(
          challenge.userId,
          '2fa.backup_code.used',
          context,
          {
            changes: { stage: 'login' },
            severity: 'warning',
          },
        );
      }
      return { userId: challenge.userId, method };
    }
    const attempts = challenge.attempts + 1;
    if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
      await this.redis.client.del(key);
      throw new UnauthorizedException({
        code: 'two_factor_locked',
        message: 'Слишком много неверных кодов. Войдите ещё раз.',
      });
    }
    await this.redis.client.set(
      key,
      JSON.stringify({ ...challenge, attempts }),
      'KEEPTTL',
    );
    throw new UnauthorizedException({
      code: 'two_factor_invalid',
      message: 'Неверный код',
      attemptsLeft: CHALLENGE_MAX_ATTEMPTS - attempts,
    });
  }
}
