import { createPublicKey, verify, type JsonWebKey } from 'crypto';

/// Проверка подписанного OIDC `id_token` (JWS compact) по JWKS провайдера —
/// встроенным `node:crypto`, без сторонних JWT-библиотек. Поддерживаются
/// алгоритмы, которые Telegram позволяет выбрать в BotFather: RS256 (по
/// умолчанию), ES256, EdDSA (Ed25519). `none` и HS* не принимаются никогда.

export interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

export interface IdTokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  [claim: string]: unknown;
}

export class IdTokenError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const SUPPORTED_ALGS = new Set(['RS256', 'ES256', 'EdDSA']);
const CLOCK_SKEW_S = 60;

function decodeSegment<T>(segment: string | undefined): T {
  if (!segment) throw new IdTokenError('malformed');
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new IdTokenError('malformed');
  }
}

/// Только разбор заголовка — чтобы выбрать ключ по `kid`.
export function readIdTokenHeader(token: string): {
  alg?: string;
  kid?: string;
} {
  return decodeSegment(token.split('.')[0]);
}

export function verifySignature(token: string, jwk: Jwk): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) throw new IdTokenError('malformed');
  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ];
  const header = decodeSegment<{ alg?: string }>(headerB64);
  if (!header.alg || !SUPPORTED_ALGS.has(header.alg)) {
    throw new IdTokenError('unsupported_alg');
  }
  if (jwk.alg && jwk.alg !== header.alg) {
    throw new IdTokenError('alg_mismatch');
  }
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const data = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(signatureB64, 'base64url');
  switch (header.alg) {
    case 'RS256':
      return verify('sha256', data, key, signature);
    case 'ES256':
      return verify(
        'sha256',
        data,
        { key, dsaEncoding: 'ieee-p1363' },
        signature,
      );
    default:
      return verify(null, data, key, signature);
  }
}

/// Подпись + обязательные claims. `expectedNonce` — если провайдер вернул
/// `nonce`, он обязан совпасть с тем, что мы отправили в запросе авторизации.
export function verifyIdToken(
  token: string,
  keys: Jwk[],
  expected: { issuer: string; audience: string; nonce?: string; now?: number },
): IdTokenClaims {
  const header = readIdTokenHeader(token);
  const candidates = header.kid
    ? keys.filter((key) => key.kid === header.kid)
    : keys;
  if (candidates.length === 0) throw new IdTokenError('unknown_key');
  if (!candidates.some((key) => verifySignature(token, key))) {
    throw new IdTokenError('bad_signature');
  }
  const claims = decodeSegment<IdTokenClaims>(token.split('.')[1]);
  const now = expected.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== expected.issuer) throw new IdTokenError('bad_issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.map(String).includes(expected.audience)) {
    throw new IdTokenError('bad_audience');
  }
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) {
    throw new IdTokenError('expired');
  }
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > now) {
    throw new IdTokenError('issued_in_future');
  }
  if (claims.nonce !== undefined && claims.nonce !== expected.nonce) {
    throw new IdTokenError('bad_nonce');
  }
  return claims;
}
