import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/// Алфавит кодов без похожих символов (нет I, O, 0, 1): 32 символа.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 15;
export const CHALLENGE_LENGTH = 5;
/// Срок ссылки и 15-символьного кода после `/site-connect`.
export const CONNECT_TTL_MS = 10 * 60_000;
/// Срок 5-символьного кода для ввода в игре.
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const CHALLENGE_MAX_ATTEMPTS = 5;
const MAX_SESSIONS_PER_UUID_HOUR = 6;

export const MINECRAFT_UUID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
export const MINECRAFT_NAME = /^[A-Za-z0-9_]{3,16}$/;

/// Криптостойкий код из CODE_ALPHABET без смещения (randomInt).
export function generateCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/// Нормализация ввода: верхний регистр, без пробелов и дефисов.
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/// UUID в каноническом виде с дефисами, в нижнем регистре.
export function normalizeUuid(raw: string): string {
  const hex = raw.replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type ChallengeResult =
  | { status: 'confirmed'; message: string }
  | { status: 'invalid'; message: string; attemptsLeft: number }
  | { status: 'expired' | 'attempts' | 'not_found'; message: string };

/// Привязка Minecraft-аккаунта при регистрации (ADR-0072).
///
/// 1. Игрок вводит `/site-connect` → плагин (подпись HMAC) создаёт сеанс и
///    получает одноразовую ссылку.
/// 2. Ссылка показывает 15-символьный код (в БД только HMAC, TTL 10 минут).
/// 3. Код вводится в регистрации → сайт выдаёт 5-символьный код (TTL 5 минут,
///    5 попыток) — ник сеанса обязан совпадать с ником регистрации.
/// 4. Игрок вводит `/site-connect <код>` → плагин подтверждает → аккаунт
///    создаётся вместе с привязкой UUID (один UUID — один пользователь).
/// Полные коды не пишутся в логи.
@Injectable()
export class MinecraftLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /// Шаг Minecraft обязателен, только когда интеграция с плагином настроена:
  /// без плагина подтвердить код в игре невозможно, и регистрация не должна
  /// блокироваться навсегда.
  required(): boolean {
    return !!this.config.get<string>('MINECRAFT_PLUGIN_SECRET');
  }

  hash(scope: string, value: string): string {
    return createHmac(
      'sha256',
      this.config.get<string>('JWT_REFRESH_SECRET', ''),
    )
      .update(`minecraft:${scope}:${value}`)
      .digest('hex');
  }

  same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  private frontendUrl(path: string): string {
    return `${this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')}${path}`;
  }

  // --- 1. Плагин: /site-connect -------------------------------------------

  async createConnectSession(input: { uuid: string; name: string }) {
    const uuid = normalizeUuid(input.uuid);
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const recent = await this.prisma.minecraftConnectSession.count({
      where: { uuid, createdAt: { gte: hourAgo } },
    });
    if (recent >= MAX_SESSIONS_PER_UUID_HOUR) {
      throw new HttpException(
        {
          code: 'rate_limited',
          message: 'Слишком часто. Попробуйте через час.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + CONNECT_TTL_MS);
    await this.prisma.minecraftConnectSession.create({
      data: {
        uuid,
        name: input.name,
        linkTokenHash: this.hash('link', token),
        expiresAt,
      },
    });
    return {
      url: this.frontendUrl(`/site-connect/${token}`),
      expiresAt: expiresAt.toISOString(),
    };
  }

  // --- 2. Сайт: открытие ссылки → 15-символьный код ---------------------------

  async openLink(token: string) {
    const session = await this.prisma.minecraftConnectSession.findUnique({
      where: { linkTokenHash: this.hash('link', token) },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'link_invalid',
        message: 'Ссылка недействительна',
      });
    }
    if (session.usedAt) {
      throw new BadRequestException({
        code: 'link_used',
        message: 'Ссылка уже использована',
      });
    }
    if (session.expiresAt <= new Date()) {
      throw new BadRequestException({
        code: 'link_expired',
        message: 'Срок ссылки истёк — введите /site-connect ещё раз',
      });
    }
    // Каждое открытие выдаёт новый код (старый перестаёт действовать).
    const code = generateCode(LINK_CODE_LENGTH);
    await this.prisma.minecraftConnectSession.update({
      where: { id: session.id },
      data: { codeHash: this.hash('code', code), codeIssuedAt: new Date() },
    });
    return {
      code,
      name: session.name,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  // --- 3. Регистрация: 15-символьный код → сеанс ------------------------------

  /// Проверяет и «гасит» код (одноразово, атомарно). Ник сеанса обязан
  /// совпадать с ником регистрации; UUID не может принадлежать другому аккаунту.
  async claimCode(rawCode: string, expectedName: string) {
    const code = normalizeCode(rawCode);
    if (
      code.length !== LINK_CODE_LENGTH ||
      [...code].some((c) => !CODE_ALPHABET.includes(c))
    ) {
      throw new BadRequestException({
        code: 'mc_code_invalid',
        message: 'Неверный код привязки',
      });
    }
    const session = await this.prisma.minecraftConnectSession.findUnique({
      where: { codeHash: this.hash('code', code) },
    });
    if (!session) {
      throw new BadRequestException({
        code: 'mc_code_invalid',
        message: 'Неверный код привязки',
      });
    }
    if (session.usedAt) {
      throw new BadRequestException({
        code: 'mc_code_used',
        message: 'Этот код уже использован',
      });
    }
    if (session.expiresAt <= new Date()) {
      throw new BadRequestException({
        code: 'mc_code_expired',
        message: 'Срок кода истёк — введите /site-connect ещё раз',
      });
    }
    if (session.name.toLowerCase() !== expectedName.toLowerCase()) {
      throw new BadRequestException({
        code: 'mc_wrong_account',
        message: `Код получен для ника ${session.name}, а регистрируется ${expectedName}`,
      });
    }
    const taken = await this.prisma.minecraftAccount.findUnique({
      where: { uuid: session.uuid },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: 'minecraft_taken',
        message:
          'Этот Minecraft-аккаунт уже привязан к другому аккаунту twomc.su',
      });
    }
    const claimed = await this.prisma.minecraftConnectSession.updateMany({
      where: { id: session.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException({
        code: 'mc_code_used',
        message: 'Этот код уже использован',
      });
    }
    return { sessionId: session.id, uuid: session.uuid, name: session.name };
  }

  newChallenge() {
    const challenge = generateCode(CHALLENGE_LENGTH);
    return {
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    };
  }

  // --- 4. Плагин: /site-connect <код> --------------------------------------------

  async confirmChallenge(input: {
    uuid: string;
    code: string;
  }): Promise<ChallengeResult> {
    const uuid = normalizeUuid(input.uuid);
    const pending = await this.prisma.emailVerification.findFirst({
      where: {
        mcUuid: uuid,
        mcConfirmedAt: null,
        consumedAt: null,
        mcChallengeHash: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending || !pending.mcChallengeHash || !pending.mcChallengeExpiresAt) {
      return {
        status: 'not_found',
        message: 'Нет ожидающей привязки. Начните регистрацию на twomc.su.',
      };
    }
    if (pending.mcChallengeExpiresAt <= new Date()) {
      return {
        status: 'expired',
        message: 'Срок кода истёк — получите новый на сайте.',
      };
    }
    if (pending.mcChallengeAttempts >= CHALLENGE_MAX_ATTEMPTS) {
      return {
        status: 'attempts',
        message: 'Слишком много попыток — получите новый код на сайте.',
      };
    }
    // Попытка учитывается до сравнения (защита от параллельного перебора).
    const counted = await this.prisma.emailVerification.update({
      where: { id: pending.id },
      data: { mcChallengeAttempts: { increment: 1 } },
    });
    const code = normalizeCode(input.code);
    if (
      !this.same(
        pending.mcChallengeHash,
        this.hash(`challenge:${pending.id}`, code),
      )
    ) {
      const left = Math.max(
        0,
        CHALLENGE_MAX_ATTEMPTS - counted.mcChallengeAttempts,
      );
      return left > 0
        ? {
            status: 'invalid',
            message: `Неверный код. Осталось попыток: ${left}.`,
            attemptsLeft: left,
          }
        : {
            status: 'attempts',
            message: 'Слишком много попыток — получите новый код на сайте.',
          };
    }
    const confirmed = await this.prisma.emailVerification.updateMany({
      where: { id: pending.id, mcConfirmedAt: null },
      data: { mcConfirmedAt: new Date(), mcChallengeHash: null },
    });
    if (confirmed.count === 0) {
      return { status: 'not_found', message: 'Привязка уже подтверждена.' };
    }
    return {
      status: 'confirmed',
      message:
        'Аккаунт подтверждён! Вернитесь на сайт, чтобы завершить регистрацию.',
    };
  }
}
