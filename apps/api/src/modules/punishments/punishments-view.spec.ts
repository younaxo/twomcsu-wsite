import {
  MirrorRow,
  PUBLIC_REF_RE,
  REF_RE,
  REASON_LABELS,
  EMPTY_REASON_MAP,
  canonicalJson,
  categorizeReason,
  normalizePhrase,
  parseReasonMap,
  parseRef,
  publicExecutor,
  scopeView,
  toMyPunishment,
  toPublicPunishment,
  toStaffPunishment,
  viewStatus,
  weakEtag,
} from './punishments-view';
import { PUNISHMENT_REASON_KEYS } from './api/punishments-api.types';

/// Тест-план п.1, 2, 4, 5, 6, 10, 23, 27, 29: слой представления.
const NOW = Date.parse('2026-11-17T12:00:00Z');
const SERVERS = [{ slug: 'survival', name: 'Выживание' }];

function row(over: Partial<MirrorRow> = {}): MirrorRow {
  return {
    id: 'cl1',
    source: 'litebans',
    sourceScope: 'default',
    kind: 'BAN',
    sourceId: BigInt(42),
    subjectUuid: '123e4567-e89b-42d3-a456-426614174000',
    subjectName: 'Steve',
    ipBan: false,
    reason: 'Читы: killaura',
    executorUuid: '223e4567-e89b-42d3-a456-426614174000',
    executorName: 'ModOne',
    executorIsConsole: false,
    removedByUuid: null,
    removedByName: null,
    removedByIsConsole: false,
    removedReason: 'секретная причина снятия',
    removedAt: null,
    startedAt: new Date('2026-11-01T00:00:00Z'),
    until: null,
    status: 'ACTIVE',
    serverScope: '*',
    serverOrigin: 'origin-secret',
    silent: false,
    template: 7,
    rowHash: 'h',
    rev: 3,
    isHidden: false,
    hiddenById: null,
    hiddenReason: null,
    issuerHidden: false,
    issuerHiddenById: null,
    issuerHiddenAt: null,
    issuerHiddenReason: null,
    firstSeenAt: new Date('2026-11-01T00:00:00Z'),
    lastSeenAt: new Date('2026-11-02T00:00:00Z'),
    lastChangedAt: new Date('2026-11-02T00:00:00Z'),
    deletedAtSource: null,
    ...over,
  } as MirrorRow;
}

const ctx = { nowMs: NOW, servers: SERVERS, reasonMap: EMPTY_REASON_MAP };

describe('toPublicPunishment: форма (п.1)', () => {
  it('точный набор ключей, без uuid/ipBan/silent/template/origin/removedReason', () => {
    const item = toPublicPunishment(row(), ctx);
    expect(item).not.toBeNull();
    expect(Object.keys(item!).sort()).toEqual(
      [
        'executor',
        'kind',
        'permanent',
        'reason',
        'ref',
        'removedAt',
        'scope',
        'startedAt',
        'status',
        'subjectName',
        'until',
      ].sort(),
    );
    const text = JSON.stringify(item);
    for (const secret of [
      '123e4567',
      '223e4567',
      'origin-secret',
      'секретная причина снятия',
      'killaura',
      'ipBan',
      'silent',
      'template',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(item!.ref).toBe('ban-42');
    expect(item!.permanent).toBe(true);
  });

  it('причина - только элемент закрытого словаря', () => {
    const item = toPublicPunishment(row(), ctx)!;
    expect(item.reason).toEqual({ key: 'rules', label: 'Нарушение правил' });
  });

  it('removedAt только у REMOVED', () => {
    const removed = toPublicPunishment(
      row({ status: 'REMOVED', removedAt: new Date('2026-11-05T00:00:00Z') }),
      ctx,
    )!;
    expect(removed.removedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(removed.status).toBe('REMOVED');
    const active = toPublicPunishment(
      row({ removedAt: new Date('2026-11-05T00:00:00Z') }),
      ctx,
    )!;
    expect(active.removedAt).toBeNull();
  });
});

describe('toPublicPunishment: предикат на уровне маппера', () => {
  it.each([
    ['WARN', { kind: 'WARN' as const }],
    ['KICK', { kind: 'KICK' as const }],
    ['без ника', { subjectName: null }],
    ['ник длиннее 16', { subjectName: 'A'.repeat(17) }],
    ['ник с маркером', { subjectName: 'ab[скрыто]' }],
    ['ник с пробелом', { subjectName: 'a b' }],
    ['DELETED_AT_SOURCE', { status: 'DELETED_AT_SOURCE' as const }],
  ])('%s не публикуется', (_n, over) => {
    expect(toPublicPunishment(row(over), ctx)).toBeNull();
  });

  it('ref вне формата 2.3 (19 цифр) не публикуется', () => {
    expect(
      toPublicPunishment(row({ sourceId: BigInt('1234567890123456789') }), ctx),
    ).toBeNull();
  });
});

describe('причина (п.2, п.29, Q59)', () => {
  const corpus = [
    'Ч[скрыто]ты',
    'чит[скрыто]',
    '[скрыто]',
    'Читы [скрыто] killaura',
    'cheats',
    'ЧИТЫ',
    '',
    null,
  ];

  it('корпус обходов очистки: всегда ключ словаря', () => {
    for (const reason of corpus) {
      for (const template of [null, 0, 7, 255]) {
        const key = categorizeReason(reason, template, EMPTY_REASON_MAP);
        expect(PUNISHMENT_REASON_KEYS).toContain(key);
        expect(key).toBe('rules');
        const item = toPublicPunishment(row({ reason, template }), ctx)!;
        expect(item.reason.key).toBe('rules');
        expect(item.reason.label).toBe(REASON_LABELS.rules);
      }
    }
  });

  it('пока карта пуста или выключена, «Читы» и «Spam» дают rules', () => {
    expect(categorizeReason('Читы', null, EMPTY_REASON_MAP)).toBe('rules');
    expect(categorizeReason('Spam', null, EMPTY_REASON_MAP)).toBe('rules');
    const disabled = parseReasonMap(
      JSON.stringify({ phrases: { читы: 'cheats' } }),
      false,
    );
    expect(categorizeReason('Читы', null, disabled)).toBe('rules');
  });

  const map = parseReasonMap(
    JSON.stringify({
      templates: { '3': 'abuse' },
      phrases: { Читы: 'cheats', 'Spam!': 'spam' },
    }),
    true,
  );

  it('включённая карта меняет результат только для точных совпадений', () => {
    expect(categorizeReason('читы', null, map)).toBe('cheats');
    expect(categorizeReason('  ЧИТЫ.  ', null, map)).toBe('cheats');
    expect(categorizeReason('spam', null, map)).toBe('spam');
    expect(categorizeReason('любая', 3, map)).toBe('abuse');
    // подстрока и ключевое слово не считаются
    expect(categorizeReason('читы и ещё', null, map)).toBe('rules');
    expect(categorizeReason('killaura читы', null, map)).toBe('rules');
    expect(categorizeReason('x', 4, map)).toBe('rules');
  });

  it('маскированная причина - rules даже при совпадении шаблона', () => {
    expect(categorizeReason('читы [скрыто]', 3, map)).toBe('rules');
    expect(categorizeReason('[скрыто]', 3, map)).toBe('rules');
  });

  it('форма ответа не меняется при включении карты', () => {
    const off = toPublicPunishment(row({ reason: 'Читы' }), ctx)!;
    const on = toPublicPunishment(row({ reason: 'Читы' }), {
      ...ctx,
      reasonMap: map,
    })!;
    expect(Object.keys(on).sort()).toEqual(Object.keys(off).sort());
    expect(on.reason).toEqual({ key: 'cheats', label: 'Читы' });
  });

  it.each([
    ['не JSON', 'oops'],
    ['массив', '[]'],
    ['неверный ключ', JSON.stringify({ templates: { '1': 'zzz' } })],
    ['неверный id', JSON.stringify({ templates: { x: 'cheats' } })],
    ['пустая фраза', JSON.stringify({ phrases: { '  ': 'cheats' } })],
    [
      'длинная фраза',
      JSON.stringify({ phrases: { ['a'.repeat(65)]: 'cheats' } }),
    ],
  ])('битая карта (%s) отбрасывается целиком', (_n, raw) => {
    const parsed = parseReasonMap(raw, true);
    expect(parsed.templates.size + parsed.phrases.size).toBe(0);
    expect(categorizeReason('Читы', 1, parsed)).toBe('rules');
  });

  it('карта больше 200 записей отбрасывается', () => {
    const phrases: Record<string, string> = {};
    for (let i = 0; i < 201; i += 1) phrases[`p${i}`] = 'spam';
    const parsed = parseReasonMap(JSON.stringify({ phrases }), true);
    expect(parsed.phrases.size).toBe(0);
  });

  it('normalizePhrase: NFKC, регистр, пробелы, завершающие знаки', () => {
    expect(normalizePhrase('  ＣＨＥＡＴ   Ｍｏｄ!! ')).toBe('cheat mod');
  });
});

describe('publicExecutor (п.23, Q63 п.3)', () => {
  it('имя, консоль, null', () => {
    expect(publicExecutor(row())).toEqual({ name: 'ModOne' });
    expect(publicExecutor(row({ executorIsConsole: true }))).toEqual({
      console: true,
    });
    expect(publicExecutor(row({ executorName: null }))).toBeNull();
  });

  it('executor ровно с одним полем и без uuid', () => {
    const exec = publicExecutor(row())!;
    expect(Object.keys(exec)).toEqual(['name']);
    const cons = publicExecutor(row({ executorIsConsole: true }))!;
    expect(Object.keys(cons)).toEqual(['console']);
  });

  it.each([
    ['пробел', 'Mod One'],
    ['длиннее 16', 'M'.repeat(17)],
    ['маркер', 'Mod[скрыто]'],
    ['спецсимвол', 'Mod<script>'],
    ['пусто', ''],
    ['дефис', 'Mod-1'],
  ])('имя вне формата (%s) даёт null', (_n, executorName) => {
    expect(publicExecutor(row({ executorName }))).toBeNull();
  });

  it('issuerHidden скрывает и имя, и консоль', () => {
    expect(publicExecutor(row({ issuerHidden: true }))).toBeNull();
    expect(
      publicExecutor(row({ issuerHidden: true, executorIsConsole: true })),
    ).toBeNull();
    expect(
      toPublicPunishment(row({ issuerHidden: true }), ctx)!.executor,
    ).toBeNull();
    expect(
      toMyPunishment(row({ issuerHidden: true }), ctx)!.executor,
    ).toBeNull();
  });

  it('персонал видит реального выдавшего даже при issuerHidden', () => {
    const staff = toStaffPunishment(row({ issuerHidden: true }), NOW);
    expect(staff.executor).toEqual({
      console: false,
      uuid: '223e4567-e89b-42d3-a456-426614174000',
      name: 'ModOne',
    });
    expect(staff.issuerHidden).toBe(true);
  });
});

describe('scopeView (п.27, Q63 п.4)', () => {
  it('глобально, сервер сайта по slug и name, неактивный/неизвестный', () => {
    expect(scopeView('*', SERVERS)).toEqual({ kind: 'global' });
    expect(scopeView(' * ', SERVERS)).toEqual({ kind: 'global' });
    expect(scopeView('SURVIVAL', SERVERS)).toEqual({
      kind: 'server',
      name: 'Выживание',
    });
    expect(scopeView('выживание', SERVERS)).toEqual({
      kind: 'server',
      name: 'Выживание',
    });
    expect(scopeView('skyblock-1', SERVERS)).toEqual({
      kind: 'server',
      name: 'skyblock-1',
    });
  });

  it.each([
    ['null', null],
    ['маркер', 'sky[скрыто]'],
    ['вне формата', 'sky block'],
    ['длиннее 32', 'a'.repeat(33)],
    ['пусто', '   '],
  ])('%s даёт unknown', (_n, value) => {
    expect(scopeView(value, SERVERS)).toEqual({ kind: 'unknown' });
  });

  it('serverOrigin не попадает в публичные и «мои» ответы, scope присутствует', () => {
    const pub = toPublicPunishment(row(), ctx)!;
    const mine = toMyPunishment(row(), ctx)!;
    expect(pub.scope).toEqual({ kind: 'global' });
    expect(mine.scope).toEqual({ kind: 'global' });
    expect(JSON.stringify([pub, mine])).not.toContain('origin-secret');
    expect(Object.keys(pub)).not.toContain('serverOrigin');
  });
});

describe('viewStatus (п.10)', () => {
  it('ACTIVE с истёкшим until - EXPIRED', () => {
    expect(
      viewStatus(
        { kind: 'BAN', status: 'ACTIVE', until: new Date(NOW - 1000) },
        NOW,
      ),
    ).toBe('EXPIRED');
    expect(
      viewStatus(
        { kind: 'BAN', status: 'ACTIVE', until: new Date(NOW + 1000) },
        NOW,
      ),
    ).toBe('ACTIVE');
    expect(
      viewStatus({ kind: 'BAN', status: 'ACTIVE', until: null }, NOW),
    ).toBe('ACTIVE');
    expect(
      viewStatus({ kind: 'BAN', status: 'REMOVED', until: null }, NOW),
    ).toBe('REMOVED');
  });

  it('публичная запись с истёкшим сроком отдаётся как EXPIRED', () => {
    const item = toPublicPunishment(row({ until: new Date(NOW - 1000) }), ctx)!;
    expect(item.status).toBe('EXPIRED');
    expect(item.permanent).toBe(false);
  });
});

describe('me (п.6)', () => {
  it('WARN и KICK видны, DELETED_AT_SOURCE скрыт, removedReason отсутствует', () => {
    expect(toMyPunishment(row({ kind: 'WARN' }), ctx)).not.toBeNull();
    expect(toMyPunishment(row({ kind: 'KICK' }), ctx)).not.toBeNull();
    expect(
      toMyPunishment(row({ status: 'DELETED_AT_SOURCE' }), ctx),
    ).toBeNull();
    const mine = toMyPunishment(row(), ctx)!;
    expect(Object.keys(mine)).not.toContain('removedReason');
    expect(JSON.stringify(mine)).not.toContain('секретная причина снятия');
    // Активный BAN без обжалований обжалуем (l1-02), WARN нет.
    expect(mine.appealable).toBe(true);
    expect(mine.appeals).toEqual([]);
    expect(toMyPunishment(row({ kind: 'WARN' }), ctx)!.appealable).toBe(false);
  });

  it('обжалуемость: открытое обжалование блокирует, закрытое нет, не-ACTIVE нет', () => {
    const appeal = (status: string) => ({
      reportNumber: 'R-1',
      status: status as 'PENDING',
      createdAt: '2026-11-01T00:00:00.000Z',
      resolvedAt: null,
      verdict: null,
    });
    for (const open of ['PENDING', 'IN_REVIEW', 'WAITING_RESPONSE']) {
      expect(toMyPunishment(row(), ctx, [appeal(open)])!.appealable).toBe(
        false,
      );
    }
    for (const closed of ['RESOLVED', 'REJECTED', 'CLOSED']) {
      expect(toMyPunishment(row(), ctx, [appeal(closed)])!.appealable).toBe(
        true,
      );
    }
    expect(toMyPunishment(row({ status: 'REMOVED' }), ctx)!.appealable).toBe(
      false,
    );
    expect(toMyPunishment(row({ kind: 'MUTE' }), ctx)!.appealable).toBe(true);
  });

  it('причина своя, маскированная помечается', () => {
    expect(toMyPunishment(row({ reason: 'ok' }), ctx)!.reasonMasked).toBe(
      false,
    );
    expect(
      toMyPunishment(row({ reason: 'a [скрыто] b' }), ctx)!.reasonMasked,
    ).toBe(true);
  });
});

describe('персонал (п.8): IP не отдаётся', () => {
  it('в карточке нет IP-полей и значений', () => {
    const staff = toStaffPunishment(row({ ipBan: true }), NOW);
    expect(staff.ipBan).toBe(true);
    const keys = Object.keys(staff).join(',').toLowerCase();
    expect(keys).not.toMatch(/\bip(address)?\b|,ip,|ipaddr/);
    // IPv4/IPv6 в значениях не появляются.
    expect(JSON.stringify(staff)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });
});

describe('ref (п.5)', () => {
  it.each([
    'ban-99999999999999999999',
    'ban-9223372036854775808x',
    'ban-0',
    'ban-01',
    'ban-1 ',
    ' ban-1',
    'ban-1\n',
    'ban--1',
    'ban-1.5',
    'BAN-1',
    'warn-1',
    'kick-1',
    'ban',
    '',
    'ban-1234567890123456789',
  ])('публичный ref %j отклоняется', (ref) => {
    expect(parseRef(ref, true)).toBeNull();
  });

  it('18 цифр допустимы, переполнения нет', () => {
    expect(parseRef('ban-999999999999999999', true)).toEqual({
      kind: 'BAN',
      sourceId: BigInt('999999999999999999'),
    });
    expect(PUBLIC_REF_RE.test('mute-1')).toBe(true);
  });

  it('служебный ref допускает warn и kick', () => {
    expect(parseRef('warn-5', false)).toEqual({
      kind: 'WARN',
      sourceId: BigInt(5),
    });
    expect(REF_RE.test('kick-7')).toBe(true);
    expect(parseRef('warn-5', true)).toBeNull();
  });
});

describe('ETag и canonicalJson (п.16)', () => {
  it('canonicalJson сортирует ключи и пропускает undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: undefined }] })).toBe(
      '{"a":[{"d":1}],"b":1}',
    );
  });

  it('generatedAt не влияет на ETag, данные влияют', () => {
    const base = {
      items: [{ a: 1 }],
      nextCursor: null,
      meta: { generatedAt: '2026-01-01T00:00:00Z', stale: false },
    };
    const later = {
      ...base,
      meta: { generatedAt: '2026-01-01T00:00:09Z', stale: false },
    };
    expect(weakEtag(base)).toBe(weakEtag(later));
    expect(weakEtag(base)).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(weakEtag({ ...base, items: [{ a: 2 }] })).not.toBe(weakEtag(base));
    expect(weakEtag({ ...base, meta: { ...base.meta, stale: true } })).not.toBe(
      weakEtag(base),
    );
  });

  it('ETag меняется после скрытия выдавшего (п.36)', () => {
    const body = (r: MirrorRow) => ({
      item: toPublicPunishment(r, ctx)!,
      meta: { generatedAt: 'x', stale: false },
    });
    expect(weakEtag(body(row()))).not.toBe(
      weakEtag(body(row({ issuerHidden: true }))),
    );
  });
});
