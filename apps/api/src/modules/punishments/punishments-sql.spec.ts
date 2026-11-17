import { buildListQuery, escapeLike, filtersForHash } from './punishments-sql';

/// Тест-план п.13: поиск по нику экранируется и параметризуется.
const NOW = new Date('2026-11-17T12:00:00Z');

describe('escapeLike', () => {
  it('"_", "%" и "\\" буквально', () => {
    expect(escapeLike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('buildListQuery', () => {
  const base = {
    publicOnly: true,
    hideSilent: true,
    order: 'desc' as const,
    limit: 25,
    cursor: null,
    now: NOW,
  };

  it('значения не конкатенируются в SQL: ник, uuid и курсор идут параметрами', () => {
    const query = buildListQuery({
      ...base,
      publicOnly: false,
      filters: {
        namePrefix: "Ab'; DROP TABLE x;--",
        subjectUuid: '123E4567-E89B-12D3-A456-426614174000',
      },
      cursor: { t: 5, i: "i'd" },
    });
    expect(query.sql).not.toMatch(/DROP|Ab|123e|i'd/i);
    expect(query.values).toContain("ab'; drop table x;--%");
    expect(query.values).toContain('123e4567-e89b-12d3-a456-426614174000');
    expect(query.values).toContain("i'd");
  });

  it('префиксный поиск регистронезависим, спецсимволы экранированы', () => {
    const query = buildListQuery({ ...base, filters: { namePrefix: 'A_%b' } });
    expect(query.sql).toContain(`lower("subjectName") LIKE`);
    expect(query.sql).toContain(`ESCAPE`);
    expect(query.values).toContain('a\\_\\%b%');
  });

  it('LIMIT = limit + 1, сортировка по (startedAt, id) в заданном порядке', () => {
    const desc = buildListQuery({ ...base, filters: {} });
    expect(desc.sql).toMatch(/ORDER BY "startedAt" DESC, "id" DESC LIMIT/);
    expect(desc.values).toContain(26);
    const asc = buildListQuery({ ...base, order: 'asc', filters: {} });
    expect(asc.sql).toMatch(/ORDER BY "startedAt" ASC, "id" ASC/);
  });

  it('источник и область всегда ограничены', () => {
    const query = buildListQuery({ ...base, filters: {} });
    expect(query.sql).toContain(`"source" = 'litebans'`);
    expect(query.sql).toContain(`"sourceScope" = 'default'`);
  });

  it('публичный предикат: только BAN/MUTE, без IP-банов, скрытых и DELETED_AT_SOURCE', () => {
    const { sql } = buildListQuery({ ...base, filters: {} });
    expect(sql).toContain(`"kind" IN ('BAN', 'MUTE')`);
    expect(sql).toContain(`"ipBan" = false`);
    expect(sql).toContain(`"isHidden" = false`);
    expect(sql).toContain(`"status" <> 'DELETED_AT_SOURCE'`);
    expect(sql).toContain(`strpos("subjectName"`);
  });

  it('служебный запрос не накладывает публичный предикат', () => {
    const { sql } = buildListQuery({
      ...base,
      publicOnly: false,
      hideSilent: false,
      filters: {},
    });
    expect(sql).not.toContain(`"ipBan" = false`);
    expect(sql).not.toContain(`"isHidden" = false`);
  });
});

describe('filtersForHash', () => {
  it('нормализует регистр и порядок видов', () => {
    const a = filtersForHash({
      filters: { kinds: ['MUTE', 'BAN'], namePrefix: 'ABC' },
      hideSilent: true,
    });
    const b = filtersForHash({
      filters: { kinds: ['BAN', 'MUTE'], namePrefix: 'abc' },
      hideSilent: true,
    });
    expect(a).toEqual(b);
    expect(a).not.toEqual(
      filtersForHash({ filters: { kinds: ['BAN', 'MUTE'] }, hideSilent: true }),
    );
  });
});
