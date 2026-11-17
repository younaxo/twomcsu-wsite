import { normalizeIp, resolveTrustProxy } from './trust-proxy';

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
