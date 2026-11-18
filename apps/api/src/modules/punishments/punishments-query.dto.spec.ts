import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  HidePunishmentIssuerDto,
  MyPunishmentsQueryDto,
  PublicPunishmentsQueryDto,
  StaffPunishmentsQueryDto,
  toStrictBoolean,
  toUniqueArray,
} from './punishments-query.dto';

/// Тест-план п.11, 12, 13: те же опции, что у глобального ValidationPipe
/// (whitelist, forbidNonWhitelisted, transform).
function run<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): { dto: T; errors: string[] } {
  const dto = plainToInstance(cls, plain);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => e.property);
  return { dto, errors };
}

describe('PublicPunishmentsQueryDto', () => {
  it('пустой запрос валиден', () => {
    expect(run(PublicPunishmentsQueryDto, {}).errors).toEqual([]);
  });

  it('принимает kind BAN/MUTE, status active/ended, order, limit 1-50', () => {
    expect(
      run(PublicPunishmentsQueryDto, {
        kind: 'BAN',
        status: 'ended',
        order: 'asc',
        limit: '50',
        name: 'Abc',
      }).errors,
    ).toEqual([]);
  });

  it.each([
    ['kind', { kind: 'WARN' }],
    ['kind', { kind: 'KICK' }],
    ['status', { status: 'ACTIVE' }],
    ['order', { order: 'up' }],
    ['limit', { limit: '0' }],
    ['limit', { limit: '51' }],
    ['limit', { limit: 'abc' }],
    ['limit', { limit: '1.5' }],
    ['name', { name: 'ab' }],
    ['name', { name: 'a'.repeat(17) }],
    ['name', { name: 'ab%' }],
    ['name', { name: "ab'c" }],
    ['cursor', { cursor: 'x'.repeat(201) }],
    ['uuid', { uuid: 'x' }],
    ['ipBan', { ipBan: 'true' }],
  ])('отклоняет неверный параметр %s', (prop, plain) => {
    expect(run(PublicPunishmentsQueryDto, plain).errors).toContain(prop);
  });

  it('name допускает регистр, "_" и "." и границы 3 и 16', () => {
    for (const name of ['AbC', 'a_b', 'a.b', 'A'.repeat(16)]) {
      expect(run(PublicPunishmentsQueryDto, { name }).errors).toEqual([]);
    }
  });
});

describe('MyPunishmentsQueryDto', () => {
  it('одиночный и повторяющийся kind приводятся к массиву без дублей', () => {
    expect(run(MyPunishmentsQueryDto, { kind: 'BAN' }).dto.kind).toEqual([
      'BAN',
    ]);
    expect(
      run(MyPunishmentsQueryDto, { kind: ['BAN', 'WARN', 'BAN'] }).dto.kind,
    ).toEqual(['BAN', 'WARN']);
  });

  it('неизвестный вид и неизвестный параметр - ошибка', () => {
    expect(run(MyPunishmentsQueryDto, { kind: 'X' }).errors).toContain('kind');
    expect(run(MyPunishmentsQueryDto, { subjectUuid: 'x' }).errors).toContain(
      'subjectUuid',
    );
  });
});

describe('StaffPunishmentsQueryDto', () => {
  it('kind и status приводятся к массиву', () => {
    const { dto, errors } = run(StaffPunishmentsQueryDto, {
      kind: 'MUTE',
      status: ['ACTIVE', 'DELETED_AT_SOURCE'],
    });
    expect(errors).toEqual([]);
    expect(dto.kind).toEqual(['MUTE']);
    expect(dto.status).toEqual(['ACTIVE', 'DELETED_AT_SOURCE']);
  });

  it.each(['silent', 'ipBan', 'hidden'])(
    'булев %s принимает только true/false',
    (key) => {
      const ok = run(StaffPunishmentsQueryDto, { [key]: 'true' });
      expect(ok.errors).toEqual([]);
      expect((ok.dto as Record<string, unknown>)[key]).toBe(true);
      const off = run(StaffPunishmentsQueryDto, { [key]: 'false' });
      expect((off.dto as Record<string, unknown>)[key]).toBe(false);
      for (const bad of ['1', 'yes', 'TRUE', '', 'True']) {
        expect(run(StaffPunishmentsQueryDto, { [key]: bad }).errors).toContain(
          key,
        );
      }
    },
  );

  it('форматы subjectUuid, nameExact, from, to, limit', () => {
    expect(
      run(StaffPunishmentsQueryDto, {
        subjectUuid: '123e4567-e89b-12d3-a456-426614174000',
        nameExact: 'A',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00.123Z',
        limit: '100',
      }).errors,
    ).toEqual([]);
    for (const [k, v] of [
      ['subjectUuid', '123e4567e89b12d3a456426614174000'],
      ['nameExact', ''],
      ['nameExact', 'a'.repeat(17)],
      ['from', '2026-01-01'],
      ['from', '2026-01-01T00:00:00+03:00'],
      ['to', '2026-01-01 00:00:00Z'],
      ['limit', '101'],
    ] as const) {
      expect(run(StaffPunishmentsQueryDto, { [k]: v }).errors).toContain(k);
    }
  });
});

describe('HidePunishmentIssuerDto', () => {
  it('reason: 1-200 символов одной строки, пробелы по краям обрезаются', () => {
    const ok = run(HidePunishmentIssuerDto, { reason: '  причина  ' });
    expect(ok.errors).toEqual([]);
    expect(ok.dto.reason).toBe('причина');
    expect(
      run(HidePunishmentIssuerDto, { reason: 'a'.repeat(200) }).errors,
    ).toEqual([]);
  });

  it.each([
    ['пусто', ''],
    ['только пробелы', '   '],
    ['201 символ', 'a'.repeat(201)],
    ['перевод строки', 'a\nb'],
    ['возврат каретки', 'a\rb'],
    ['не строка', 5],
  ])('reason: %s - ошибка', (_n, reason) => {
    expect(run(HidePunishmentIssuerDto, { reason }).errors).toContain('reason');
  });

  it('нет reason - ошибка', () => {
    expect(run(HidePunishmentIssuerDto, {}).errors).toContain('reason');
  });
});

describe('помощники преобразования', () => {
  it('toUniqueArray и toStrictBoolean', () => {
    expect(toUniqueArray(undefined)).toBeUndefined();
    expect(toUniqueArray('a')).toEqual(['a']);
    expect(toUniqueArray(['a', 'a', 'b'])).toEqual(['a', 'b']);
    expect(toStrictBoolean('true')).toBe(true);
    expect(toStrictBoolean('false')).toBe(false);
    expect(toStrictBoolean('1')).toBe('1');
  });
});
