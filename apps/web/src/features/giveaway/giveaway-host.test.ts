import { describe, expect, it } from 'vitest';
import { giveawayHostRoute } from './giveaway-only';

const admin = 'admin.giveaway.twomc.su';

describe('хост админки', () => {
  it('без GIVEAWAY_ONLY основной сайт не затрагивается ни на каком хосте', () => {
    for (const host of [admin, 'twomc.su', 'localhost:3000']) {
      for (const path of ['/', '/news', '/giveaway/admin', '/admin']) {
        expect(
          giveawayHostRoute(path, host, false, { adminHost: admin }),
          `${host}${path}`,
        ).toBeNull();
      }
    }
  });
  it('хост админки: / -> rewrite на админку, чужие пути -> /', () => {
    const o = { adminHost: admin, production: true };
    expect(giveawayHostRoute('/', admin, true, o)).toEqual({
      kind: 'rewrite',
      path: '/giveaway/admin',
    });
    expect(giveawayHostRoute('/news', admin, true, o)).toEqual({ kind: 'redirect', path: '/' });
    expect(giveawayHostRoute('/giveaway', `${admin}:443`, true, o)).toBeNull();
  });
  it('другие хосты: админка закрыта редиректом на /giveaway, остальное как раньше', () => {
    const o = { adminHost: admin, production: true };
    expect(giveawayHostRoute('/giveaway/admin', 'giveaway.twomc.su', true, o)).toEqual({
      kind: 'redirect',
      path: '/giveaway',
    });
    expect(giveawayHostRoute('/giveaway/admin', 'localhost:3000', true, o)).toEqual({
      kind: 'redirect',
      path: '/giveaway',
    });
    expect(giveawayHostRoute('/giveaway', 'giveaway.twomc.su', true, o)).toBeNull();
    expect(giveawayHostRoute('/', 'giveaway.twomc.su', true, o)).toBeNull();
  });
  it('локально вне production админка доступна на localhost', () => {
    expect(
      giveawayHostRoute('/giveaway/admin', 'localhost:3000', true, {
        adminHost: admin,
        production: false,
      }),
    ).toBeNull();
  });
});
