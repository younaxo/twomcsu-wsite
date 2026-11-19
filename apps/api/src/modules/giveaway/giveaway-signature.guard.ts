import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  deriveServerKey,
  parseKeyId,
  verifySignature,
} from './giveaway-crypto';
import {
  forbidden,
  payloadTooLarge,
  tooManyRequests,
  unauthorized,
  unavailable,
} from './giveaway-errors';
import { GiveawayRedisService } from './giveaway-redis.service';
import { GiveawaySettingsService } from './giveaway-settings.service';
import {
  GIVEAWAY_CONFIG,
  GiveawayConfig,
  isGiveawayOperational,
} from './giveaway.config';
import {
  GIVEAWAY_ROUTES,
  GIVEAWAY_SIGN_PATH,
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  KEY_ID_PATTERN,
  MAX_BODY_BYTES,
  NONCE_PATTERN,
  SERVER_ID_PATTERN,
  SIGNATURE_PATTERN,
  TIMESTAMP_PATTERN,
} from './giveaway.constants';
import { GiveawayRequest } from './giveaway.types';

function header(req: GiveawayRequest, name: string): string | null {
  const v = req.headers[name];
  return typeof v === 'string' ? v : null;
}

/// Проверка подписи (порядок важен): 503 без флага/секрета -> формат до
/// Redis и БД -> версия ключа -> окно времени -> подпись (timing-safe) ->
/// нонс (только после валидной подписи) -> сервер в списке разрешённых (403)
/// -> лимит запросов на сервер (429). В лог идут только код причины и
/// `key-id`: без подписи, тела, нонса, ключа и IP.
@Injectable()
export class GiveawaySignatureGuard implements CanActivate {
  private readonly logger = new Logger(GiveawaySignatureGuard.name);

  constructor(
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
    private readonly settings: GiveawaySettingsService,
    private readonly redis: GiveawayRedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<GiveawayRequest>();
    const res = http.getResponse<Response>();

    if (
      !isGiveawayOperational(this.config) ||
      this.config.masterSecret === null
    ) {
      throw unavailable();
    }
    const master = this.config.masterSecret;

    const bad = this.checkFormat(req);
    if (bad !== null) {
      this.logger.warn(`giveaway auth: ${bad}`);
      throw unauthorized();
    }
    const keyId = header(req, HEADER_KEY_ID) as string;
    const timestamp = header(req, HEADER_TIMESTAMP) as string;
    const nonce = header(req, HEADER_NONCE) as string;
    const signature = header(req, HEADER_SIGNATURE) as string;
    const parsed = parseKeyId(keyId);
    if (parsed === null || !SERVER_ID_PATTERN.test(parsed.serverId)) {
      this.logger.warn('giveaway auth: key_id_format');
      throw unauthorized();
    }

    try {
      const body = req.rawBody ?? Buffer.alloc(0);
      if (
        body.length > MAX_BODY_BYTES ||
        Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES
      ) {
        throw payloadTooLarge();
      }
      if (!this.versionAccepted(parsed.version)) {
        this.logger.warn(`giveaway auth: key_version key=${keyId}`);
        throw unauthorized();
      }
      const skewMs = Math.abs(Date.now() - Number(timestamp) * 1000);
      if (skewMs > this.config.timestampWindowS * 1000) {
        this.logger.warn(`giveaway auth: time_window key=${keyId}`);
        throw unauthorized();
      }
      const key = deriveServerKey(master, parsed.serverId, parsed.version);
      const ok = verifySignature(
        key,
        {
          keyId,
          timestamp,
          nonce,
          method: req.method,
          // Подписывается публичный путь независимо от срезания `/api`.
          path: GIVEAWAY_SIGN_PATH,
          body,
        },
        signature,
      );
      if (!ok) {
        this.logger.warn(`giveaway auth: bad_signature key=${keyId}`);
        throw unauthorized();
      }
      // TTL нонса >= 2 окон времени.
      const nonceTtl = this.config.timestampWindowS * 2 + 60;
      if (!(await this.redis.claimNonce(keyId, nonce, nonceTtl))) {
        this.logger.warn(`giveaway auth: nonce_replay key=${keyId}`);
        throw unauthorized();
      }
      if (!(await this.settings.isServerAllowed(parsed.serverId))) {
        this.logger.warn(`giveaway auth: server_not_allowed key=${keyId}`);
        throw forbidden();
      }
      const retry = await this.redis.requestRetryAfter(parsed.serverId);
      if (retry > 0) {
        this.logger.warn(`giveaway rate limit: requests key=${keyId}`);
        throw tooManyRequests(res, retry);
      }
      req.giveaway = {
        keyId,
        serverId: parsed.serverId,
        version: parsed.version,
      };
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`giveaway auth: dependency_unavailable key=${keyId}`);
      throw unavailable(res, 5);
    }
  }

  private versionAccepted(version: number): boolean {
    const cur = this.config.keyVersion;
    return (
      version === cur ||
      (this.config.acceptPreviousKey && cur > 1 && version === cur - 1)
    );
  }

  private checkFormat(req: GiveawayRequest): string | null {
    const url = req.originalUrl;
    if (url.includes('?')) return 'query';
    if (!GIVEAWAY_ROUTES.includes(url) || req.method !== 'POST') return 'route';
    if (req.headers['content-encoding'] !== undefined)
      return 'content_encoding';
    const keyId = header(req, HEADER_KEY_ID);
    if (keyId === null || !KEY_ID_PATTERN.test(keyId)) return 'key_id_format';
    const ts = header(req, HEADER_TIMESTAMP);
    if (ts === null || !TIMESTAMP_PATTERN.test(ts)) return 'timestamp_format';
    const sig = header(req, HEADER_SIGNATURE);
    if (sig === null || !SIGNATURE_PATTERN.test(sig)) return 'signature_format';
    const nonce = header(req, HEADER_NONCE);
    if (nonce === null || !NONCE_PATTERN.test(nonce)) return 'nonce_format';
    const ct = (header(req, 'content-type') ?? '').toLowerCase();
    if (!ct.startsWith('application/json')) return 'content_type';
    if (req.rawBody === undefined) return 'no_body';
    return null;
  }
}
