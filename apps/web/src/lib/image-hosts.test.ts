import { describe, expect, it } from 'vitest';
import { buildRemotePatterns, STATIC_REMOTE_PATTERNS } from '../../image-hosts.mjs';

describe('buildRemotePatterns (next/image)', () => {
  it('без env — только постоянные хосты', () => {
    expect(buildRemotePatterns({})).toEqual(STATIC_REMOTE_PATTERNS);
  });

  it('стенд: CDN и API на одном хосте — разрешены только пути загрузок', () => {
    const patterns = buildRemotePatterns({
      NEXT_PUBLIC_SITE_URL: 'https://stand.example',
      NEXT_PUBLIC_API_URL: 'https://stand.example/api',
      NEXT_PUBLIC_CDN_BASE_URL: 'https://stand.example/api/uploads',
    });
    const stand = patterns.filter((p) => p.hostname === 'stand.example');
    expect(stand.map((p) => p.pathname).sort()).toEqual(['/api/uploads/**', '/uploads/**']);
    expect(stand.every((p) => p.protocol === 'https' && p.port === '')).toBe(true);
    // Ни одного хоста без ограничения пути, кроме постоянных.
    expect(patterns.filter((p) => p.pathname === undefined).map((p) => p.hostname)).toEqual(
      STATIC_REMOTE_PATTERNS.map((p) => p.hostname),
    );
  });

  it('dev: http и порт API сохраняются', () => {
    const patterns = buildRemotePatterns({ NEXT_PUBLIC_API_URL: 'http://localhost:4000' });
    expect(patterns).toContainEqual({
      protocol: 'http',
      hostname: 'localhost',
      port: '4000',
      pathname: '/uploads/**',
    });
  });

  it('CDN из CDN_BASE_URL, мусор и чужие схемы игнорируются', () => {
    const patterns = buildRemotePatterns({
      CDN_BASE_URL: 'https://cdn.example.org/',
      NEXT_PUBLIC_API_URL: 'not a url',
      NEXT_PUBLIC_SITE_URL: 'ftp://files.example',
    });
    expect(patterns).toContainEqual({
      protocol: 'https',
      hostname: 'cdn.example.org',
      port: '',
      pathname: '/**',
    });
    expect(patterns.some((p) => p.hostname === 'files.example')).toBe(false);
    expect(patterns).toHaveLength(STATIC_REMOTE_PATTERNS.length + 1);
  });
});
