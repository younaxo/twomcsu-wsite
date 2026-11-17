import { resolveCapabilities } from './bridge-capabilities';

describe('resolveCapabilities (2.4)', () => {
  it.each([null, undefined, {}, [], 'x', 5, true, ['player-events']])(
    'NULL, пусто и не-объект = только punishments: %p',
    (raw) => {
      expect([...resolveCapabilities(raw)]).toEqual(['punishments']);
    },
  );

  it('неизвестные ключи игнорируются и права не расширяют', () => {
    expect([...resolveCapabilities({ admin: true, 'god-mode': true })]).toEqual(
      ['punishments'],
    );
  });

  it('известный ключ только при значении true', () => {
    const caps = resolveCapabilities({
      punishments: true,
      'player-events': 'true',
      'punishments-authoritative': 1,
    });
    expect([...caps]).toEqual(['punishments']);
  });

  it('player-events и authoritative включаются явным true', () => {
    const caps = resolveCapabilities({
      punishments: true,
      'punishments-authoritative': true,
      'player-events': true,
      unknown: true,
    });
    expect(caps.has('punishments')).toBe(true);
    expect(caps.has('punishments-authoritative')).toBe(true);
    expect(caps.has('player-events')).toBe(true);
    expect(caps.size).toBe(3);
  });

  it('punishments: false отключает наказания', () => {
    expect(resolveCapabilities({ punishments: false }).size).toBe(0);
  });

  it('объект с известными ключами без punishments - без наказаний (минимум прав)', () => {
    const caps = resolveCapabilities({ 'player-events': true });
    expect(caps.has('punishments')).toBe(false);
    expect(caps.has('player-events')).toBe(true);
  });
});
