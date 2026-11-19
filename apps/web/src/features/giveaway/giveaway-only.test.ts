import { describe, expect, it } from 'vitest';
import { giveawayOnlyRedirect, isGiveawayOnly } from './giveaway-only';

describe('GIVEAWAY_ONLY', () => {
  it('флаг читается из true/1, иначе выключен', () => {
    expect(isGiveawayOnly('true')).toBe(true);
    expect(isGiveawayOnly('1')).toBe(true);
    expect(isGiveawayOnly('false')).toBe(false);
    expect(isGiveawayOnly(undefined)).toBe(false);
  });
  it('без флага ничего не редиректит', () => {
    expect(giveawayOnlyRedirect('/news', false)).toBeNull();
    expect(giveawayOnlyRedirect('/', false)).toBeNull();
  });
  it('с флагом ведёт остальные маршруты на /giveaway', () => {
    expect(giveawayOnlyRedirect('/', true)).toBe('/giveaway');
    expect(giveawayOnlyRedirect('/news/1', true)).toBe('/giveaway');
    expect(giveawayOnlyRedirect('/admin', true)).toBe('/giveaway');
    expect(giveawayOnlyRedirect('/giveawayx', true)).toBe('/giveaway');
  });
  it('пропускает /giveaway, статику и служебные пути', () => {
    for (const path of [
      '/giveaway',
      '/giveaway/',
      '/api/giveaway/v1/public',
      '/_next/static/x.js',
      '/assets/brand/a.svg',
      '/favicon.ico',
      '/robots.txt',
      '/manifest.webmanifest',
    ]) {
      expect(giveawayOnlyRedirect(path, true), path).toBeNull();
    }
  });
});
