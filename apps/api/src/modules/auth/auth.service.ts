import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountType, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { BruteForceService } from './brute-force.service';
import { CaptchaService } from './captcha.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export interface RequestContext {
  ip: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 час

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly bruteForce: BruteForceService,
    private readonly captcha: CaptchaService,
    private readonly email: EmailService,
  ) {}

  private get bcryptRounds(): number {
    return this.config.get<number>('BCRYPT_ROUNDS', 12);
  }

  private hashRefreshToken(rawToken: string): string {
    return createHmac(
      'sha256',
      this.config.get<string>('JWT_REFRESH_SECRET', ''),
    )
      .update(rawToken)
      .digest('hex');
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return { id: user.id, email: user.email, username: user.username };
  }

  async register(dto: RegisterDto): Promise<{ user: AuthenticatedUser }> {
    const captchaOk = await this.captcha.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new ForbiddenException('Проверка captcha не пройдена');
    }

    const email = dto.email.toLowerCase();
    const defaultPosition = await this.prisma.position.findFirst({
      where: { isDefault: true },
    });
    if (!defaultPosition) {
      throw new ConflictException(
        'Не настроена позиция по умолчанию (isDefault) — выполните seed перед регистрацией',
      );
    }

    // Ник, совпадающий с alias входа другого аккаунта (ADR-0061), занят:
    // иначе вход по нему стал бы неоднозначным.
    const aliasTaken = await this.prisma.loginAlias.findUnique({
      where: { alias: dto.username.toLowerCase() },
    });
    if (aliasTaken) {
      throw new ConflictException('Email или username уже заняты');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    const tag = await this.generateUniqueTag(dto.username);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          username: dto.username,
          password: passwordHash,
          tag,
          positionId: defaultPosition.id,
        },
      });
      return { user: this.toAuthenticatedUser(user) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email или username уже заняты');
      }
      throw error;
    }
  }

  private async generateUniqueTag(username: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = randomBytes(2).toString('hex');
      const tag = `${username}#${suffix}`;
      const exists = await this.prisma.user.findUnique({ where: { tag } });
      if (!exists) {
        return tag;
      }
    }
    throw new ConflictException(
      'Не удалось сгенерировать уникальный тег, повторите запрос',
    );
  }

  async login(
    dto: LoginDto,
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    if (await this.bruteForce.isBlocked(context.ip)) {
      throw new HttpException(
        'Слишком много попыток входа. Повторите позже.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Turnstile на каждом входе (anti-bot); после серии неудач с IP — тот же
    // ответ `requiresCaptcha`, чтобы frontend обновил виджет.
    const captchaOk = await this.captcha.verify(dto.captchaToken, context.ip);
    if (!captchaOk) {
      throw new ForbiddenException({ requiresCaptcha: true });
    }

    const identifier = dto.emailOrUsername.toLowerCase();
    // Логин = username (ник). Если такого ника нет — точечный alias входа
    // (ADR-0061, например `younaxo` → `younaxo_`).
    const alias = await this.prisma.loginAlias.findUnique({
      where: { alias: identifier },
      select: { userId: true },
    });
    const user = await this.prisma.user.findFirst({
      // Глобально password исключён (PrismaService omit) — здесь он нужен для сверки.
      omit: { password: false },
      where: {
        OR: [
          { email: identifier },
          { username: { equals: dto.emailOrUsername } },
          ...(alias ? [{ id: alias.userId }] : []),
        ],
      },
    });

    // Системный аккаунт #0 (ADR-0006): вход по паролю запрещён независимо от hash.
    if (
      !user ||
      user.accountType === AccountType.SYSTEM ||
      !(await bcrypt.compare(dto.password, user.password))
    ) {
      await this.bruteForce.registerFailure(context.ip);
      throw new UnauthorizedException('Неверный email/логин или пароль');
    }

    if (user.isBanned) {
      throw new ForbiddenException({
        message: 'Аккаунт заблокирован',
        reason: user.banReason,
        bannedUntil: user.bannedUntil,
      });
    }

    await this.bruteForce.reset(context.ip);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: context.ip },
    });

    const tokens = await this.issueTokenPair(user.id, context);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  private async issueTokenPair(
    userId: string,
    context: RequestContext,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId });

    const rawRefreshToken = randomBytes(64).toString('hex');
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES',
      '30d',
    );
    const refreshTokenExpiresAt = new Date(
      Date.now() + parseDurationMs(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashRefreshToken(rawRefreshToken),
        userId,
        userAgent: context.userAgent,
        ipAddress: context.ip,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
    };
  }

  async refresh(
    rawRefreshToken: string | undefined,
    context: RequestContext,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException();
    }

    if (existing.revokedAt) {
      // Повторное использование отозванного токена — подозрение на кражу (см. 09-AUTHENTICATION.md).
      await this.revokeAllSessions(existing.userId);
      throw new UnauthorizedException();
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isBanned) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Аккаунт заблокирован');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokenPair(user.id, context);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new UnauthorizedException('Сессия не найдена');
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { password: false },
    });
    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Текущий пароль указан неверно');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash, mustChangePassword: false },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const captchaOk = await this.captcha.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new ForbiddenException('Проверка captcha не пройдена');
    }
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Молчим при неизвестном email — не раскрываем существование аккаунта.
      return;
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const resetUrl = `${this.config.get<string>('FRONTEND_URL')}/reset-password?token=${rawToken}`;
    await this.email.send({
      to: user.email,
      subject: 'Сброс пароля twomc.su',
      html: `<p>Для сброса пароля перейдите по ссылке (действительна 1 час): <a href="${resetUrl}">${resetUrl}</a></p>`,
      text: `Для сброса пароля перейдите по ссылке (действительна 1 час): ${resetUrl}`,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const captchaOk = await this.captcha.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new ForbiddenException('Проверка captcha не пройдена');
    }

    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Ссылка недействительна или устарела');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: passwordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Сброс пароля — признак возможной компрометации аккаунта: обрываем все сессии.
    await this.revokeAllSessions(resetToken.userId);
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: {
          include: { role: true },
          orderBy: { role: { priority: 'desc' } },
        },
      },
    });
  }
}

/// Простой парсер длительностей вида "15m", "30d", "1h" в миллисекунды —
/// формат совпадает с тем, что принимает @nestjs/jwt (ms-подобная строка).
function parseDurationMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Некорректный формат длительности: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * unitMs[unit];
}
