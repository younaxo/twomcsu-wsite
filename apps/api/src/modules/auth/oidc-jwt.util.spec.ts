import { generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { IdTokenError, Jwk, verifyIdToken } from './oidc-jwt.util';

const ISSUER = 'https://oauth.telegram.org';
const AUDIENCE = '123456';

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(
  alg: 'RS256' | 'ES256' | 'EdDSA',
  privateKey: KeyObject,
  claims: Record<string, unknown>,
  kid = 'k1',
): string {
  const head = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`;
  const data = Buffer.from(head);
  const signature =
    alg === 'RS256'
      ? sign('sha256', data, privateKey)
      : alg === 'ES256'
        ? sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' })
        : sign(null, data, privateKey);
  return `${head}.${signature.toString('base64url')}`;
}

const now = Math.floor(Date.now() / 1000);
const baseClaims = {
  iss: ISSUER,
  aud: AUDIENCE,
  sub: 'abc',
  id: 987654321,
  iat: now,
  exp: now + 300,
  nonce: 'n-1',
};

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ed = generateKeyPairSync('ed25519');
const jwk = (key: KeyObject, alg: string, kid = 'k1'): Jwk => ({
  ...(key.export({ format: 'jwk' }) as Jwk),
  kid,
  alg,
});

const expected = { issuer: ISSUER, audience: AUDIENCE, nonce: 'n-1' };

describe('verifyIdToken', () => {
  it.each([
    ['RS256', rsa],
    ['ES256', ec],
    ['EdDSA', ed],
  ] as const)('принимает корректный %s', (alg, pair) => {
    const token = makeToken(alg, pair.privateKey, baseClaims);
    const claims = verifyIdToken(token, [jwk(pair.publicKey, alg)], expected);
    expect(claims.id).toBe(987654321);
  });

  it('отклоняет подделанные claims и чужой ключ', () => {
    const token = makeToken('RS256', rsa.privateKey, baseClaims);
    const [head, , sig] = token.split('.');
    const forged = `${head}.${b64({ ...baseClaims, id: 1 })}.${sig}`;
    expect(() =>
      verifyIdToken(forged, [jwk(rsa.publicKey, 'RS256')], expected),
    ).toThrow(IdTokenError);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() =>
      verifyIdToken(token, [jwk(other.publicKey, 'RS256')], expected),
    ).toThrow('bad_signature');
    expect(() =>
      verifyIdToken(token, [jwk(rsa.publicKey, 'RS256', 'other')], expected),
    ).toThrow('unknown_key');
  });

  it('проверяет iss, aud, exp и nonce', () => {
    const keys = [jwk(rsa.publicKey, 'RS256')];
    const check = (claims: Record<string, unknown>) =>
      verifyIdToken(
        makeToken('RS256', rsa.privateKey, { ...baseClaims, ...claims }),
        keys,
        expected,
      );
    expect(() => check({ iss: 'https://evil.example' })).toThrow('bad_issuer');
    expect(() => check({ aud: '999' })).toThrow('bad_audience');
    expect(() => check({ exp: now - 600 })).toThrow('expired');
    expect(() => check({ nonce: 'replayed' })).toThrow('bad_nonce');
    expect(check({ aud: ['999', AUDIENCE] }).sub).toBe('abc');
  });

  it('не принимает alg=none и HS256', () => {
    const keys = [jwk(rsa.publicKey, 'RS256')];
    for (const alg of ['none', 'HS256']) {
      const token = `${b64({ alg, kid: 'k1' })}.${b64(baseClaims)}.`;
      expect(() => verifyIdToken(token, keys, expected)).toThrow(
        'unsupported_alg',
      );
    }
  });
});
