import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const PLUGIN_TIMESTAMP_HEADER = 'x-twomc-timestamp';
export const PLUGIN_SIGNATURE_HEADER = 'x-twomc-signature';
const MAX_SKEW_S = 60;

/// Каноническая строка для подписи запроса плагина (ADR-0072):
/// `${timestamp}\n${METHOD}\n${path}\n${key=value&…}` — поля тела по алфавиту,
/// значения строками. Так подпись не зависит от форматирования JSON.
export function canonicalPluginRequest(
  timestamp: string,
  method: string,
  path: string,
  body: Record<string, unknown>,
): string {
  const fields = Object.keys(body ?? {})
    .sort()
    .map((key) => `${key}=${String(body[key] ?? '')}`)
    .join('&');
  return `${timestamp}\n${method.toUpperCase()}\n${path}\n${fields}`;
}

export function signPluginRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: Record<string, unknown>,
): string {
  return createHmac('sha256', secret)
    .update(canonicalPluginRequest(timestamp, method, path, body))
    .digest('hex');
}

/// Server-to-server запросы Minecraft-плагина: HMAC-SHA256 общим секретом
/// `MINECRAFT_PLUGIN_SECRET` + метка времени (окно ±60 с против повторов).
/// Без секрета интеграция выключена (503).
@Injectable()
export class PluginSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('MINECRAFT_PLUGIN_SECRET', '');
    if (!secret) {
      throw new ServiceUnavailableException('minecraft_plugin_disabled');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const timestamp = String(req.get(PLUGIN_TIMESTAMP_HEADER) ?? '');
    const signature = String(req.get(PLUGIN_SIGNATURE_HEADER) ?? '');
    const ts = Number(timestamp);
    if (
      !/^\d{9,11}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_S
    ) {
      throw new UnauthorizedException('plugin_timestamp');
    }
    const expected = signPluginRequest(
      secret,
      timestamp,
      req.method,
      req.path,
      (req.body ?? {}) as Record<string, unknown>,
    );
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('plugin_signature');
    }
    return true;
  }
}
