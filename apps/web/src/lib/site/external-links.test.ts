import { maskNickname } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { classifyLink, describeExternalUrl, isTrustedUrl } from './external-links';

const ORIGIN = 'https://twomc.su';

describe('external-links', () => {
  it('внутренние, доверенные и служебные ссылки не требуют подтверждения', () => {
    expect(classifyLink('/shop', ORIGIN)).toBe('internal');
    expect(classifyLink('#quick-start', ORIGIN)).toBe('internal');
    expect(classifyLink('?page=2', ORIGIN)).toBe('internal');
    expect(classifyLink('https://twomc.su/rules', ORIGIN)).toBe('internal');
    expect(classifyLink('https://cdn-files.twomc.su/x.png', ORIGIN)).toBe('trusted');
    expect(classifyLink('https://status.twomc.su', ORIGIN)).toBe('trusted');
    expect(classifyLink('mailto:support@twomc.su', ORIGIN)).toBe('special');
    expect(classifyLink('tel:+70000000000', ORIGIN)).toBe('special');
    expect(isTrustedUrl('http://localhost:3000/admin', 'http://localhost:3000')).toBe(true);
  });

  it('сторонние сайты — external, javascript:/data: — blocked', () => {
    expect(classifyLink('https://reallyworld.ru/mojang.pdf', ORIGIN)).toBe('external');
    expect(classifyLink('https://t.me/twomcsu_support', ORIGIN)).toBe('external');
    expect(classifyLink('//evil.example/x', ORIGIN)).toBe('external');
    expect(classifyLink('https://twomc.su.evil.example/', ORIGIN)).toBe('external');
    expect(classifyLink('javascript:alert(1)', ORIGIN)).toBe('blocked');
    expect(classifyLink('data:text/html,hi', ORIGIN)).toBe('blocked');
    expect(classifyLink('http://[bad', ORIGIN)).toBe('blocked');
    expect(isTrustedUrl('https://discord.gg/x', ORIGIN)).toBe(false);
  });

  it('describeExternalUrl показывает hostname и компактный URL', () => {
    const long = `https://example.com/${'a'.repeat(200)}`;
    const info = describeExternalUrl(long);
    expect(info.hostname).toBe('example.com');
    expect(info.display.length).toBeLessThanOrEqual(96);
    expect(info.display.endsWith('…')).toBe(true);
  });

  it('maskNickname — единый privacy-алгоритм публичных лент', () => {
    expect(maskNickname('younaxo_')).toBe('yo***o_');
    expect(maskNickname('Lavender42')).toBe('La***42');
    expect(maskNickname('abcd')).toBe('a***');
    expect(maskNickname('')).toBe('***');
    expect(maskNickname(null)).toBe('***');
  });
});
