import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { rateLimitKey } from '../../config/trust-proxy';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCapabilities } from './bridge-capabilities';
import { deriveServerKey, parseKeyId, verifySignature } from './bridge-crypto';
import {
  payloadTooLarge,
  tooManyRequests,
  unauthorized,
  unavailable,
  unsupportedProtocol,
} from './bridge-errors';
import { BridgeRedisService } from './bridge-redis.service';
import {
  BRIDGE_CONFIG,
  BridgeConfig,
  isBridgeOperational,
} from './bridge.config';
import {
  ALLOWED_ROUTES,
  BRIDGE_PROTOCOL,
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_PROTOCOL,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  KEY_ID_PATTERN,
  NONCE_PATTERN,
  SIGNATURE_PATTERN,
  TIMESTAMP_PATTERN,
  isValidSlug,
} from './bridge.constants';
import { BridgeRequest } from './bridge.types';

function header(req: BridgeRequest, name: string): string | null {
  const v = req.headers[name];
  return typeof v === 'string' ? v : null;
}

/// Проверка подписи запроса сервера (2.3 контракта; порядок важен):
/// 503 без настройки -> формат до БД/Redis -> протокол -> размер -> ключ и
/// поколение -> время -> подпись -> нонс (только после валидной подписи).
/// Причина отказа в ответ не попадает; в лог идёт только код причины и
/// `key-id` (без подписи, тела, нонса, ключа и IP).
@Injectable()
export class BridgeSignatureGuard implements CanActivate {
  private readonly logger = new Logger(BridgeSignatureGuard.name);

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly prisma: PrismaService,
    private readonly redis: BridgeRedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<BridgeRequest>();
    const res = http.getResponse<Response>();

    // Fail-closed: без флага и секрета все пути отвечают 503 без деталей.
    if (
      !isBridgeOperational(this.config) ||
      this.config.masterSecret === null
    ) {
      throw unavailable();
    }
    const master = this.config.masterSecret;

    // Шаг 0: формат до любых обращений к Redis и БД.
    const reject = this.checkFormat(req);
    if (reject !== null) {
      this.logger.warn(`bridge auth: ${reject}`);
      throw unauthorized();
    }
    const keyId = header(req, HEADER_KEY_ID) as string;
    const timestamp = header(req, HEADER_TIMESTAMP) as string;
    const nonce = header(req, HEADER_NONCE) as string;
    const signature = header(req, HEADER_SIGNATURE) as string;
    const protocol = header(req, HEADER_PROTOCOL) as string;
    const parsed = parseKeyId(keyId);
    if (parsed === null || !isValidSlug(parsed.slug)) {
      this.logger.warn('bridge auth: key_id_format');
      throw unauthorized();
    }

    const ipKey = rateLimitKey(
      req.ip ??
        (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress,
    );

    try {
      // Грубый счётчик неудачных аутентификаций (после формата, до БД).
      const blockedFor = await this.redis.authFailureRetryAfter(ipKey);
      if (blockedFor > 0) throw tooManyRequests(res, blockedFor);

      // Шаг 1: протокол.
      if (Number(protocol) !== BRIDGE_PROTOCOL) throw unsupportedProtocol();

      // Шаг 2: размер тела (Content-Type проверен в формате).
      const body = req.rawBody ?? Buffer.alloc(0);
      if (
        body.length > this.config.maxBodyBytes ||
        Number(req.headers['content-length'] ?? 0) > this.config.maxBodyBytes
      ) {
        throw payloadTooLarge();
      }

      // Шаг 3: ключ и поколение.
      const server = await this.prisma.bridgeServer.findUnique({
        where: { slug: parsed.slug },
      });
      const nowMs = Date.now();
      if (server === null || server.status !== 'ACTIVE') {
        this.logger.warn(`bridge auth: unknown_or_revoked key=${keyId}`);
        throw unauthorized();
      }
      if (!this.generationAccepted(server, parsed.generation, nowMs)) {
        this.logger.warn(`bridge auth: generation key=${keyId}`);
        throw unauthorized();
      }

      // Шаг 4: окно времени.
      const skewMs = Math.abs(nowMs - Number(timestamp) * 1000);
      if (skewMs > this.config.timestampWindowS * 1000) {
        this.logger.warn(`bridge auth: time_window key=${keyId}`);
        throw unauthorized();
      }

      // Шаг 5: подпись над сырым телом, timingSafeEqual.
      const key = deriveServerKey(master, parsed.slug, parsed.generation);
      const ok = verifySignature(
        key,
        {
          keyId,
          timestamp,
          nonce,
          method: req.method,
          path: req.originalUrl,
          body,
        },
        signature,
      );
      if (!ok) {
        this.logger.warn(`bridge auth: bad_signature key=${keyId}`);
        throw unauthorized();
      }

      // Шаг 6: нонс пишется только после валидной подписи.
      if (!(await this.redis.claimNonce(keyId, nonce))) {
        this.logger.warn(`bridge auth: nonce_replay key=${keyId}`);
        throw unauthorized();
      }

      req.bridge = {
        keyId,
        slug: parsed.slug,
        generation: parsed.generation,
        server,
        capabilities: resolveCapabilities(server.capabilities),
      };
      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        if (err.getStatus() === 401) await this.noteFailure(ipKey);
        throw err;
      }
      // Redis или БД недоступны: fail-closed, без деталей.
      this.logger.error(`bridge auth: dependency_unavailable key=${keyId}`);
      throw unavailable(res, 5);
    }
  }

  /// Код причины отказа по формату или null.
  private checkFormat(req: BridgeRequest): string | null {
    // Путь и метод без нормализации: регистр, завершающий слэш, query.
    const url = req.originalUrl;
    if (url.includes('?')) return 'query';
    const method = ALLOWED_ROUTES.get(url);
    if (method === undefined || method !== req.method) return 'route';
    if (req.headers['content-encoding'] !== undefined) {
      return 'content_encoding';
    }
    const keyId = header(req, HEADER_KEY_ID);
    if (keyId === null || !KEY_ID_PATTERN.test(keyId)) return 'key_id_format';
    const ts = header(req, HEADER_TIMESTAMP);
    if (ts === null || !TIMESTAMP_PATTERN.test(ts)) return 'timestamp_format';
    const sig = header(req, HEADER_SIGNATURE);
    if (sig === null || !SIGNATURE_PATTERN.test(sig)) return 'signature_format';
    const nonce = header(req, HEADER_NONCE);
    if (nonce === null || !NONCE_PATTERN.test(nonce)) return 'nonce_format';
    const proto = header(req, HEADER_PROTOCOL);
    if (proto === null || !/^[0-9]{1,3}$/.test(proto)) {
      return 'protocol_format';
    }
    if (req.method === 'POST') {
      const ct = (header(req, 'content-type') ?? '').toLowerCase();
      if (!ct.startsWith('application/json')) return 'content_type';
      if (req.rawBody === undefined) return 'no_body';
    }
    return null;
  }

  /// Текущее поколение; предыдущее - только до `previousGenValidTill`;
  /// выше текущего - всегда отказ.
  private generationAccepted(
    server: { keyGeneration: number; previousGenValidTill: Date | null },
    generation: number,
    nowMs: number,
  ): boolean {
    if (generation === server.keyGeneration) return true;
    return (
      generation === server.keyGeneration - 1 &&
      server.previousGenValidTill !== null &&
      nowMs < server.previousGenValidTill.getTime()
    );
  }

  private async noteFailure(ipKey: string): Promise<void> {
    try {
      await this.redis.recordAuthFailure(ipKey);
    } catch {
      // Счётчик вспомогательный; основной отказ уже определён.
    }
  }
}
