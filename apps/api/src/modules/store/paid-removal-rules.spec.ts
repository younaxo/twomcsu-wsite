import { MinecraftPunishmentKind, ProductType } from '@prisma/client';
import {
  PAID_REMOVAL_EMPTY_RULES,
  parsePaidRemovalRules,
  reasonAllowed,
  removalKindOf,
  rulesAllowKind,
} from './paid-removal-rules';

describe('paid-removal-rules (0.12b)', () => {
  it.each([null, undefined, '', 'не json', '[]', '"x"', 'null', '123'])(
    'мусор %p — пустые правила',
    (raw) => {
      expect(parsePaidRemovalRules(raw as never)).toEqual(
        PAID_REMOVAL_EMPTY_RULES,
      );
    },
  );

  it('пустые правила не разрешают ни один вид (fail closed)', () => {
    for (const kind of [
      MinecraftPunishmentKind.BAN,
      MinecraftPunishmentKind.MUTE,
    ]) {
      expect(rulesAllowKind(PAID_REMOVAL_EMPTY_RULES, kind)).toBe(false);
    }
  });

  it('enabled и kind без списка причин — всё равно запрещено', () => {
    const rules = parsePaidRemovalRules(
      JSON.stringify({
        enabled: true,
        unbanEnabled: true,
        unmuteEnabled: true,
      }),
    );
    expect(rulesAllowKind(rules, MinecraftPunishmentKind.BAN)).toBe(false);
  });

  it('булевы флаги только явным true (строка "true" не годится)', () => {
    const rules = parsePaidRemovalRules(
      JSON.stringify({
        enabled: 'true',
        unbanEnabled: 1,
        allowedReasons: ['spam'],
      }),
    );
    expect(rules.enabled).toBe(false);
    expect(rules.unbanEnabled).toBe(false);
  });

  it('полная конфигурация разбирается и нормализуется', () => {
    const rules = parsePaidRemovalRules(
      JSON.stringify({
        version: 3,
        enabled: true,
        unbanEnabled: true,
        unmuteEnabled: false,
        allowedReasons: [' Spam ', '', 5, 'Флуд'],
        deniedReasons: ['cheat'],
        maxPerNick: 2,
        periodDays: 7,
        minAgeHours: 1.9,
        actorUserId: ' sys1 ',
      }),
    );
    expect(rules).toMatchObject({
      version: '3',
      allowedReasons: ['spam', 'флуд'],
      deniedReasons: ['cheat'],
      maxPerNick: 2,
      periodDays: 7,
      minAgeHours: 1,
      actorUserId: 'sys1',
    });
    expect(rulesAllowKind(rules, MinecraftPunishmentKind.BAN)).toBe(true);
    expect(rulesAllowKind(rules, MinecraftPunishmentKind.MUTE)).toBe(false);
  });

  it('причина: запрещённая приоритетнее разрешённой; пустая — нет', () => {
    const rules = parsePaidRemovalRules(
      JSON.stringify({ allowedReasons: ['spam'], deniedReasons: ['cheat'] }),
    );
    expect(reasonAllowed(rules, 'Spam in chat')).toBe(true);
    expect(reasonAllowed(rules, 'spam + cheat')).toBe(false);
    expect(reasonAllowed(rules, 'grief')).toBe(false);
    expect(reasonAllowed(rules, null)).toBe(false);
    expect(reasonAllowed(rules, '')).toBe(false);
  });

  it('removalKindOf: UNBAN -> BAN, UNMUTE -> MUTE, остальные — null', () => {
    expect(removalKindOf(ProductType.UNBAN)).toBe(MinecraftPunishmentKind.BAN);
    expect(removalKindOf(ProductType.UNMUTE)).toBe(
      MinecraftPunishmentKind.MUTE,
    );
    expect(removalKindOf(ProductType.PRIVILEGE)).toBeNull();
  });
});
