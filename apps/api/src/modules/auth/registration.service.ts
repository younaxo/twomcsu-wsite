import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, RequestContext } from './auth.service';
import { CaptchaService } from './captcha.service';
import {
  RegisterCompleteDto,
  RegisterResendDto,
  RegisterStartDto,
  RegisterVerifyDto,
} from './dto/registration.dto';

const OTP_TTL_MS = 10 * 60_000;
const COMPLETION_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_STARTS_PER_EMAIL_HOUR = 5;

/// `yo***@example.com` — e-mail для экрана подтверждения.
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}***@${domain}`;
}

function tooMany(code: string, message: string, retryAt?: Date): HttpException {
  return new HttpException(
    { code, message, ...(retryAt ? { retryAt: retryAt.toISOString() } : {}) },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/// Регистрация с подтверждением почты (ADR-0070).
///
/// start: проверка данных, согласий, Turnstile и реферального кода → письмо с
/// 6-значным кодом (в БД только HMAC). verify: не больше 5 попыток, TTL
/// 10 минут → одноразовый токен завершения. complete: только с этим токеном
/// создаётся аккаунт (пароль приходит здесь и сразу хешируется), пишутся
/// согласия, выдаётся сессия. Пароль нигде не хранится до создания аккаунта.
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly captcha: CaptchaService,
    private readonly auth: AuthService,
  ) {}

  private hash(scope: string, value: string): string {
    return createHmac(
      'sha256',
      this.config.get<string>('JWT_REFRESH_SECRET', ''),
    )
      .update(`${scope}:${value}`)
      .digest('hex');
  }

  private same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  private generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /// Отправка кода. Ошибка SMTP: в production — 503 `mail_failed` (запрос
  /// подтверждения удаляется), в development — предупреждение и код в логе
  /// разработки, чтобы поток можно было пройти локально.
  private async sendCode(
    email: string,
    code: string,
    verificationId: string,
  ): Promise<void> {
    try {
      await this.deliverCode(email, code);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 120) : 'unknown';
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error(`Письмо с кодом не отправлено: ${reason}`);
        await this.prisma.emailVerification.deleteMany({
          where: { id: verificationId, verifiedAt: null },
        });
        throw new ServiceUnavailableException({
          code: 'mail_failed',
          message: 'Не удалось отправить письмо с кодом. Попробуйте позже.',
        });
      }
      this.logger.warn(
        `SMTP недоступен (${reason}). DEV: код для ${maskEmail(email)} — ${code}`,
      );
    }
  }

  private async deliverCode(email: string, code: string): Promise<void> {
    const minutes = OTP_TTL_MS / 60_000;
    await this.email.send({
      to: email,
      subject: `${code} — код подтверждения twomc.su`,
      text: `Ваш код подтверждения: ${code}\n\nКод действует ${minutes} минут. Если вы не регистрировались на twomc.su, просто проигнорируйте это письмо.`,
      html: `<p>Ваш код подтверждения для регистрации на <b>twomc.su</b>:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
<p>Код действует ${minutes} минут. Если вы не регистрировались на twomc.su, просто проигнорируйте это письмо.</p>`,
    });
  }

  private publicState(record: {
    id: string;
    email: string;
    lastSentAt: Date;
    expiresAt: Date;
    sendCount: number;
  }) {
    return {
      verificationId: record.id,
      maskedEmail: maskEmail(record.email),
      expiresAt: record.expiresAt.toISOString(),
      resendAvailableAt: new Date(
        record.lastSentAt.getTime() + RESEND_COOLDOWN_MS,
      ).toISOString(),
      resendsLeft: Math.max(0, MAX_SENDS - record.sendCount),
    };
  }

  async start(dto: RegisterStartDto, context: RequestContext) {
    const captchaOk = await this.captcha.verify(dto.captchaToken, context.ip);
    if (!captchaOk) {
      throw new ForbiddenException({
        code: 'captcha_failed',
        requiresCaptcha: true,
      });
    }
    const settings = await this.prisma.siteSettings.findFirst({
      select: { registrationEnabled: true },
    });
    if (settings && !settings.registrationEnabled) {
      throw new ForbiddenException({
        code: 'registration_closed',
        message: 'Регистрация временно закрыта',
      });
    }

    const email = dto.email.toLowerCase();
    await this.auth.assertIdentityAvailable(email, dto.username);

    let referrerId: string | null = null;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode },
        select: { id: true, accountType: true, isBanned: true },
      });
      if (!referrer || referrer.accountType === 'SYSTEM' || referrer.isBanned) {
        throw new BadRequestException({
          code: 'referral_invalid',
          message: 'Реферальный код не найден',
        });
      }
      referrerId = referrer.id;
    }

    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const recent = await this.prisma.emailVerification.count({
      where: { email, createdAt: { gte: hourAgo } },
    });
    if (recent >= MAX_STARTS_PER_EMAIL_HOUR) {
      throw tooMany(
        'otp_rate_limited',
        'Слишком много запросов кода на этот e-mail. Попробуйте позже.',
      );
    }

    const code = this.generateCode();
    const record = await this.prisma.emailVerification.create({
      data: {
        email,
        username: dto.username,
        referrerId,
        codeHash: 'pending',
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        ip: context.ip,
      },
    });
    const updated = await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: { codeHash: this.hash(`otp:${record.id}`, code) },
    });
    await this.sendCode(email, code, updated.id);
    return this.publicState(updated);
  }

  private async getActive(verificationId: string) {
    const record = await this.prisma.emailVerification.findUnique({
      where: { id: verificationId },
    });
    if (!record || record.consumedAt) {
      throw new NotFoundException({
        code: 'otp_not_found',
        message: 'Запрос подтверждения не найден',
      });
    }
    return record;
  }

  async resend(dto: RegisterResendDto) {
    const record = await this.getActive(dto.verificationId);
    if (record.verifiedAt) {
      throw new BadRequestException({
        code: 'already_verified',
        message: 'Почта уже подтверждена',
      });
    }
    const availableAt = new Date(
      record.lastSentAt.getTime() + RESEND_COOLDOWN_MS,
    );
    if (availableAt > new Date()) {
      throw tooMany(
        'otp_cooldown',
        'Повторно отправить код можно чуть позже',
        availableAt,
      );
    }
    if (record.sendCount >= MAX_SENDS) {
      throw tooMany(
        'otp_send_limit',
        'Лимит отправок исчерпан — начните регистрацию заново',
      );
    }
    const code = this.generateCode();
    const updated = await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: {
        codeHash: this.hash(`otp:${record.id}`, code),
        attempts: 0,
        sendCount: { increment: 1 },
        lastSentAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.sendCode(record.email, code, record.id);
    return this.publicState(updated);
  }

  async verify(dto: RegisterVerifyDto) {
    const record = await this.getActive(dto.verificationId);
    if (record.verifiedAt) {
      throw new BadRequestException({
        code: 'already_verified',
        message: 'Почта уже подтверждена',
      });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      throw tooMany(
        'otp_attempts',
        'Слишком много неверных попыток — запросите новый код',
      );
    }
    if (record.expiresAt <= new Date()) {
      throw new BadRequestException({
        code: 'otp_expired',
        message: 'Срок действия кода истёк — запросите новый',
      });
    }
    // Попытка учитывается до сравнения (защита от параллельного перебора).
    const counted = await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    if (!this.same(record.codeHash, this.hash(`otp:${record.id}`, dto.code))) {
      const left = Math.max(0, MAX_ATTEMPTS - counted.attempts);
      throw new BadRequestException({
        code: left > 0 ? 'otp_invalid' : 'otp_attempts',
        message:
          left > 0
            ? `Неверный код. Осталось попыток: ${left}`
            : 'Попытки исчерпаны — запросите новый код',
        attemptsLeft: left,
      });
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: {
        verifiedAt: new Date(),
        completionTokenHash: this.hash(`complete:${record.id}`, token),
        completionExpiresAt: new Date(Date.now() + COMPLETION_TTL_MS),
      },
    });
    return { completionToken: token, email: maskEmail(record.email) };
  }

  async complete(dto: RegisterCompleteDto, context: RequestContext) {
    const record = await this.getActive(dto.verificationId);
    const tokenOk =
      !!record.verifiedAt &&
      !!record.completionTokenHash &&
      !!record.completionExpiresAt &&
      record.completionExpiresAt > new Date() &&
      this.same(
        record.completionTokenHash,
        this.hash(`complete:${record.id}`, dto.completionToken),
      );
    if (!tokenOk) {
      throw new ForbiddenException({
        code: 'completion_invalid',
        message: 'Подтверждение почты устарело — пройдите его заново',
      });
    }
    // Одноразовость: помечаем использованным до создания аккаунта.
    const claimed = await this.prisma.emailVerification.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ForbiddenException({
        code: 'completion_invalid',
        message: 'Подтверждение уже использовано',
      });
    }

    await this.auth.assertIdentityAvailable(record.email, record.username);
    const user = await this.auth.createAccount({
      email: record.email,
      username: record.username,
      password: dto.password,
      referrerId: record.referrerId,
      emailVerified: true,
    });
    const version = this.config.get<string>('LEGAL_DOCS_VERSION', 'draft');
    await this.prisma.legalConsent.createMany({
      data: [
        { userId: user.id, document: 'terms', version, ip: context.ip },
        { userId: user.id, document: 'personal_data', version, ip: context.ip },
      ],
    });
    return this.auth.issueSessionForUser(user.id, context);
  }
}
