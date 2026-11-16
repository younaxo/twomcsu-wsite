import { normalizeIp, rateLimitKey, resolveTrustProxy } from './trust-proxy';

describe('resolveTrustProxy', () => {
  it.each([undefined, null, '', '   '])('пусто (%p) — выключено', (raw) => {
    expect(resolveTrustProxy(raw)).toBe(false);
  });

  it('число hop-ов', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy(' 2 ')).toBe(2);
  });

  it('именованные диапазоны', () => {
    expect(resolveTrustProxy('loopback')).toEqual(['loopback']);
    expect(resolveTrustProxy('Loopback, uniquelocal')).toEqual([
      'loopback',
      'uniquelocal',
    ]);
  });

  it('CIDR и IP списком', () => {
    expect(resolveTrustProxy('10.0.0.0/8, 172.16.0.0/12,::1')).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
      '::1',
    ]);
    expect(resolveTrustProxy('fd00::/16')).toEqual(['fd00::/16']);
    expect(resolveTrustProxy('10.0.0.0/8')).toEqual(['10.0.0.0/8']);
  });

  it.each([
    'true',
    'false',
    '*',
    '-1',
    '0',
    '11',
    'garbage',
    '10.0.0.0/33',
    '10.0.0.0/8/1',
    '999.1.1.1',
    'loopback,,',
    'loopback,*',
    '1.5',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.0/7',
    'fd00::/15',
    '10.0.0.1,0.0.0.0/0',
  ])('отвергает %p', (raw) => {
    expect(() => resolveTrustProxy(raw)).toThrow(/TRUST_PROXY/);
  });
});

describe('normalizeIp', () => {
  it('IPv4-mapped → IPv4', () => {
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIp('::FFFF:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIp('::ffff:102:304')).toBe('1.2.3.4');
  });

  it('обычные адреса не меняются', () => {
    expect(normalizeIp('1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizeIp('::1')).toBe('::1');
  });

  it('мусор, не-IP и длинная строка → unknown', () => {
    expect(normalizeIp('garbage')).toBe('unknown');
    expect(normalizeIp('999.1.1.1')).toBe('unknown');
    expect(normalizeIp('::ffff:garbage')).toBe('unknown');
    expect(normalizeIp('::ffff:999.1.1.1')).toBe('unknown');
    expect(normalizeIp('1'.repeat(500))).toBe('unknown');
    expect(normalizeIp(`::${'1'.repeat(100)}`)).toBe('unknown');
  });

  it('zone id срезается', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80::1');
    expect(normalizeIp('FE80::1%25eth0')).toBe('fe80::1');
    expect(normalizeIp('%eth0')).toBe('unknown');
  });

  it('пусто → unknown', () => {
    expect(normalizeIp(undefined)).toBe('unknown');
    expect(normalizeIp('')).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('IPv4 и mapped IPv6 дают IPv4', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  it('сжатая, полная и смешанная формы одной /64 дают один ключ', () => {
    const key = 'v6:2001:db8:0:1';
    expect(rateLimitKey('2001:db8:0:1::5')).toBe(key);
    expect(rateLimitKey('2001:0db8:0000:0001:0000:0000:0000:0005')).toBe(key);
    expect(rateLimitKey('2001:DB8:0:1:0:0:0:9')).toBe(key);
    expect(rateLimitKey('2001:db8:0:1:ffff:ffff:ffff:ffff')).toBe(key);
  });

  it('::1, :: и сжатие внутри первых 4 хекстетов', () => {
    expect(rateLimitKey('::1')).toBe('v6:0:0:0:0');
    expect(rateLimitKey('::')).toBe('v6:0:0:0:0');
    expect(rateLimitKey('2001:db8::')).toBe('v6:2001:db8:0:0');
    expect(rateLimitKey('2001::1:2:3:4:5')).toBe('v6:2001:0:0:1');
  });

  it('zone id срезается', () => {
    expect(rateLimitKey('fe80::1%eth0')).toBe(rateLimitKey('fe80::2'));
    expect(rateLimitKey('fe80::1%eth0')).toBe('v6:fe80:0:0:0');
  });

  it('встроенный IPv4-хвост не ломает разбор', () => {
    expect(rateLimitKey('64:ff9b::1.2.3.4')).toBe('v6:64:ff9b:0:0');
  });

  it('разные /64 дают разные ключи, разные IPv4 — разные', () => {
    expect(rateLimitKey('2001:db8:0:1::1')).not.toBe(
      rateLimitKey('2001:db8:0:2::1'),
    );
    expect(rateLimitKey('2001:db8:1:1::1')).not.toBe(
      rateLimitKey('2001:db8:0:1::1'),
    );
    expect(rateLimitKey('1.2.3.4')).not.toBe(rateLimitKey('1.2.3.5'));
  });

  it('пусто/undefined — unknown', () => {
    expect(rateLimitKey(undefined)).toBe('unknown');
    expect(rateLimitKey(null)).toBe('unknown');
    expect(rateLimitKey('  ')).toBe('unknown');
  });

  it('мусор не бросает, ключи разные и ограниченной длины', () => {
    const junk = [
      'abc',
      'not-an-ip',
      '1.2.3',
      '2001:db8:::1',
      'g::1',
      'x'.repeat(500),
    ];
    const keys = junk.map((j) => rateLimitKey(j));
    for (const k of keys) {
      expect(k).toMatch(/^raw:[0-9a-f]{16}$/);
    }
    expect(new Set(keys).size).toBe(junk.length);
    expect(rateLimitKey('ABC')).toBe(rateLimitKey('abc'));
  });
});
