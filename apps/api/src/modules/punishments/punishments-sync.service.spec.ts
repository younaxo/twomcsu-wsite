import {
  InMemoryMirrorStore,
  InMemorySource,
} from '../../../test/support/in-memory-punishments';
import {
  CLOCK_SKEW,
  MASS_DELETE_SUSPECTED,
  NEEDS_RECONCILE,
  PunishmentChangeEvent,
  RECONCILE_APPROVED,
  PunishmentsSyncService,
  SOURCE_EMPTY,
} from './punishments-sync.service';
import { PunishmentsConfig } from './punishments.config';
import { PunishmentsRuntime } from './punishments.tokens';
import {
  NormalizedPunishment,
  SourceAuthFailed,
  SourceSchemaMismatch,
  SourceUnavailable,
} from './punishment.types';

const T0 = 1_800_000_000_000;

function mk(
  id: number,
  overrides: Partial<NormalizedPunishment> = {},
): NormalizedPunishment {
  return {
    kind: 'BAN',
    sourceId: String(id),
    subjectUuid: null,
    subjectName: `player${id}`,
    ipBan: false,
    reason: 'причина',
    executor: { console: true },
    startedAt: new Date(T0 - 100_000),
    until: null,
    status: 'ACTIVE',
    removal: null,
    scope: null,
    origin: null,
    silent: false,
    template: null,
    sourceActive: true,
    rowHash: `hash-${id}-v1`,
    ...overrides,
  };
}

function setup(configEnabled = true, withSource = true) {
  const source = new InMemorySource();
  source.serverTimeMs = T0;
  const store = new InMemoryMirrorStore();
  let now = T0;
  const runtime: PunishmentsRuntime = {
    now: () => now,
    sleep: async () => undefined,
    random: () => 0,
  };
  const config: PunishmentsConfig = {
    enabled: configEnabled,
    pollIntervalMs: 1500,
    batchSize: 2,
    activeCheckIntervalMs: 15_000,
    reconcileIntervalMs: 3_600_000,
    overlap: 1,
  };
  const service = new PunishmentsSyncService(
    withSource ? source : null,
    store,
    config,
    runtime,
  );
  const events: PunishmentChangeEvent[] = [];
  service.onChange((e) => events.push(e));
  return {
    source,
    store,
    service,
    events,
    advance: (ms: number) => {
      now += ms;
      // Часы источника идут синхронно с часами сайта (без расхождения).
      source.serverTimeMs += ms;
    },
    now: () => now,
  };
}

describe('PunishmentsSyncService: без источника', () => {
  it('без источника ничего не делает, статус «не настроено», не падает', async () => {
    const { service, store } = setup(true, false);
    await expect(service.runOnce()).resolves.toBeUndefined();
    const status = await service.getStatus();
    expect(service.isConfigured).toBe(false);
    expect(status).toMatchObject({
      state: 'not_configured',
      reason: 'no_source',
    });
    expect(store.states.size).toBe(0);
  });

  it('интеграция выключена флагом: источник не опрашивается', async () => {
    const { service, source } = setup(false, true);
    source.set(mk(1));
    await service.runOnce();
    expect(source.fetchBatchCalls).toHaveLength(0);
    expect((await service.getStatus()).reason).toBe('disabled');
  });
});

describe('PunishmentsSyncService: первичная загрузка и дедупликация', () => {
  it('грузит по водяному знаку пачками, события не рассылает', async () => {
    const { service, source, store, events } = setup();
    for (let i = 1; i <= 5; i++) source.set(mk(i));
    await service.runOnce();
    expect(store.mirror.size).toBe(5);
    const state = await store.getState('test', 'BAN');
    expect(state.cursorId).toBe(5n);
    expect(state.initialSyncDoneAt).not.toBeNull();
    expect(events).toHaveLength(0);
    expect((await service.getStatus()).state).toBe('ok');
  });

  it('повторный проход без изменений ничего не пишет (rowHash)', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 3; i++) source.set(mk(i));
    await service.runOnce();
    const writes = store.writes;
    advance(2000);
    await service.runOnce();
    expect(store.writes).toBe(writes);
  });

  it('изменённый rowHash даёт updated с растущим rev; новая строка — created', async () => {
    const { service, source, events, advance } = setup();
    for (let i = 1; i <= 3; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    source.set(mk(3, { rowHash: 'hash-3-v2', reason: 'другая' }));
    source.set(mk(4));
    await service.runOnce();
    expect(events.map((e) => [e.type, e.sourceId, e.rev])).toEqual([
      ['updated', '3', 2],
      ['created', '4', 1],
    ]);
    expect(events[0].ref).toBe('ban-3');
  });
});

describe('PunishmentsSyncService: сверка и восстановление', () => {
  it('исчезнувшая из источника активная строка помечается мягко (слой 2)', async () => {
    const { service, source, store, events, advance } = setup();
    for (let i = 1; i <= 3; i++) source.set(mk(i));
    await service.runOnce();
    advance(16_000);
    source.remove('BAN', '2');
    await service.runOnce();
    expect(events.map((e) => [e.type, e.sourceId])).toEqual([['deleted', '2']]);
    expect(store.mirror.get('BAN:2')?.status).toBe('DELETED_AT_SOURCE');
    expect(store.mirror.size).toBe(3);
  });

  it('откат источника: данные не теряются, сверка мягкая, курсор опускается после сверки', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 5; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    for (let i = 3; i <= 5; i++) source.remove('BAN', String(i));
    await service.runOnce();
    // После сверки курсор опущен до максимума источника (F1).
    expect((await store.getState('test', 'BAN')).cursorId).toBe(2n);
    expect(store.mirror.size).toBe(5);
    expect(store.mirror.get('BAN:4')?.status).toBe('DELETED_AT_SOURCE');
    expect(store.mirror.get('BAN:1')?.status).toBe('ACTIVE');
  });

  it('пустой источник при непустом зеркале: массовой пометки нет, код SOURCE_EMPTY', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 3; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    source.clear();
    await service.runOnce();
    expect([...store.mirror.values()].every((m) => m.status === 'ACTIVE')).toBe(
      true,
    );
    const state = await store.getState('test', 'BAN');
    expect(state.lastErrorCode).toBe(SOURCE_EMPTY);
    expect((await service.getStatus()).state).toBe('needs_reconcile');
    expect(NEEDS_RECONCILE).toBe('NEEDS_RECONCILE');
  });
});

describe('PunishmentsSyncService: истечение, сбои, лидерство', () => {
  it('ACTIVE с прошедшим until становится EXPIRED силами сайта (слой T)', async () => {
    const { service, source, store, events, advance } = setup();
    source.set(mk(1, { until: new Date(T0 + 5000) }));
    await service.runOnce();
    advance(10_000);
    await service.runOnce();
    expect(store.mirror.get('BAN:1')?.status).toBe('EXPIRED');
    expect(events.map((e) => e.type)).toContain('expired');
  });

  it('недоступный источник: пауза с повтором, статус degraded, затем восстановление', async () => {
    const { service, source, advance } = setup();
    source.set(mk(1));
    source.failWith = new SourceUnavailable();
    await service.runOnce();
    expect((await service.getStatus()).state).toBe('degraded');
    source.failWith = null;
    await service.runOnce(); // внутри паузы
    expect(source.fetchBatchCalls).toHaveLength(0);
    advance(2000);
    await service.runOnce();
    expect(source.fetchBatchCalls.length).toBeGreaterThan(0);
    expect((await service.getStatus()).state).toBe('ok');
  });

  it('отказ учётных данных не повторяется: опрос остановлен (halted)', async () => {
    const { service, source, advance } = setup();
    source.failWith = new SourceAuthFailed();
    await service.runOnce();
    expect((await service.getStatus()).state).toBe('halted');
    source.failWith = null;
    advance(60_000);
    await service.runOnce();
    expect(source.fetchBatchCalls).toHaveLength(0);
  });

  it('сбой не затирает NEEDS_RECONCILE, обычный код пишется и снимается', async () => {
    const { service, source, store, advance } = setup();
    source.set(mk(1));
    await service.runOnce();
    await store.patchState('test', 'BAN', { lastErrorCode: NEEDS_RECONCILE });
    source.failWith = new SourceUnavailable();
    advance(2000);
    await service.runOnce();
    const failed = await store.getState('test', 'BAN');
    expect(failed.lastErrorCode).toBe(NEEDS_RECONCILE);
    expect(failed.consecutiveFailures).toBe(1);
    expect((await store.getState('test', 'MUTE')).lastErrorCode).toBe(
      'SOURCE_UNAVAILABLE',
    );
    source.failWith = null;
    advance(60_000);
    await service.runOnce();
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBeNull();
  });

  it('сбой не затирает SOURCE_EMPTY', async () => {
    const { service, source, store, advance } = setup();
    source.set(mk(1));
    await service.runOnce();
    advance(2000);
    source.clear();
    await service.runOnce();
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBe(
      SOURCE_EMPTY,
    );
    source.failWith = new SourceUnavailable();
    advance(2000);
    await service.runOnce();
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBe(
      SOURCE_EMPTY,
    );
  });

  it('SourceSchemaMismatch останавливает только свою таблицу', async () => {
    const { service, source, store } = setup();
    source.set(mk(1));
    source.set(mk(1, { kind: 'MUTE', sourceId: '1' }));
    source.failBatchWith.set('BAN', new SourceSchemaMismatch());
    await service.runOnce();
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBe(
      'SOURCE_SCHEMA_MISMATCH',
    );
    expect((await service.getStatus()).state).toBe('halted');
    expect(store.mirror.has('MUTE:1')).toBe(true);
    expect(store.mirror.has('BAN:1')).toBe(false);
    source.fetchBatchCalls.length = 0;
    await service.runOnce();
    expect(source.fetchBatchCalls.some((c) => c.kind === 'BAN')).toBe(false);
  });

  it('невалидная строка источника не помечается DELETED_AT_SOURCE при сверке', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 3; i++) source.set(mk(i));
    await service.runOnce();
    source.invalidIds.add('2');
    advance(3_700_000);
    await service.runOnce();
    expect(store.mirror.get('BAN:2')?.status).toBe('ACTIVE');
    expect(store.mirror.get('BAN:3')?.status).toBe('ACTIVE');
  });

  it('потеря лидерства прерывает проход до записи', async () => {
    const { service, source, store } = setup();
    source.set(mk(1));
    await service.runOnce(async () => false);
    expect(store.mirror.size).toBe(0);
    expect(store.writes).toBe(0);
  });

  it('падение обработчика событий не ломает синхронизацию', async () => {
    const { service, source, store, advance } = setup();
    service.onChange(() => {
      throw new Error('boom');
    });
    source.set(mk(1));
    await service.runOnce();
    advance(2000);
    source.set(mk(2));
    await service.runOnce();
    expect(store.mirror.size).toBe(2);
  });
});

function reconcileCalls(source: InMemorySource): number {
  return source.fetchBatchCalls.filter(
    (c) => c.kind === 'BAN' && c.afterId === 0n,
  ).length;
}

function setupMany(count: number) {
  const ctx = setup();
  for (let i = 1; i <= count; i++) ctx.source.set(mk(i));
  return ctx;
}

describe('PunishmentsSyncService: откат источника без повторной сверки (F1)', () => {
  it('после сверки курсор опускается, следующие тики не запускают вторую сверку', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 5; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    for (let i = 3; i <= 5; i++) source.remove('BAN', String(i));
    await service.runOnce();
    const state = await store.getState('test', 'BAN');
    expect(state.cursorId).toBe(2n);
    expect(state.lastErrorCode).toBeNull();
    expect(store.mirror.get('BAN:4')?.status).toBe('DELETED_AT_SOURCE');
    const afterFirst = reconcileCalls(source);
    advance(1500);
    await service.runOnce();
    advance(1500);
    await service.runOnce();
    expect(reconcileCalls(source)).toBe(afterFirst);
  });

  it('после отката новые строки с id выше нового максимума снова читаются', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 5; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    for (let i = 3; i <= 5; i++) source.remove('BAN', String(i));
    await service.runOnce();
    advance(2000);
    source.set(mk(3, { subjectName: 'новый' }));
    await service.runOnce();
    expect(store.mirror.get('BAN:3')?.row.subjectName).toBe('новый');
  });
});

describe('PunishmentsSyncService: порог массовой пометки (F2)', () => {
  it('выше порога строки не помечаются, ставится тревога, сверка не повторяется', async () => {
    const { service, source, store, advance } = setupMany(20);
    await service.runOnce();
    advance(2000);
    for (let i = 6; i <= 20; i++) source.remove('BAN', String(i));
    await service.runOnce();
    expect([...store.mirror.values()].every((m) => m.status === 'ACTIVE')).toBe(
      true,
    );
    const state = await store.getState('test', 'BAN');
    expect(state.lastErrorCode).toBe(MASS_DELETE_SUSPECTED);
    // Откат: курсор опущен до максимума источника.
    expect(state.cursorId).toBe(5n);
    expect((await service.getStatus()).state).toBe('needs_reconcile');
    const afterFirst = reconcileCalls(source);
    advance(1500);
    await service.runOnce();
    expect(reconcileCalls(source)).toBe(afterFirst);
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBe(
      MASS_DELETE_SUSPECTED,
    );
  });

  it('до порога строки помечаются (5 из 20)', async () => {
    const { service, source, store, advance } = setupMany(20);
    await service.runOnce();
    advance(2000);
    for (let i = 16; i <= 20; i++) source.remove('BAN', String(i));
    await service.runOnce();
    const deleted = [...store.mirror.values()].filter(
      (m) => m.status === 'DELETED_AT_SOURCE',
    );
    expect(deleted).toHaveLength(5);
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBeNull();
  });

  it('явный флаг RECONCILE_APPROVED выполняет массовую пометку и снимается', async () => {
    const { service, source, store, advance } = setupMany(20);
    await service.runOnce();
    advance(2000);
    for (let i = 6; i <= 20; i++) source.remove('BAN', String(i));
    await service.runOnce();
    await store.patchState('test', 'BAN', {
      lastErrorCode: RECONCILE_APPROVED,
    });
    advance(1500);
    await service.runOnce();
    const deleted = [...store.mirror.values()].filter(
      (m) => m.status === 'DELETED_AT_SOURCE',
    );
    expect(deleted).toHaveLength(15);
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBeNull();
  });

  it('слой 2 (активные строки) тоже защищён порогом', async () => {
    const { service, source, store, advance } = setupMany(20);
    await service.runOnce();
    advance(16_000);
    for (let i = 6; i <= 20; i++) source.remove('BAN', String(i));
    await service.runOnce();
    expect(
      [...store.mirror.values()].some((m) => m.status === 'DELETED_AT_SOURCE'),
    ).toBe(false);
  });
});

describe('PunishmentsSyncService: расхождение часов (F3)', () => {
  it('расхождение больше допуска: тревога и пауза, EXPIRED нет; после исправления опрос возобновляется', async () => {
    const { service, source, store, advance } = setup();
    source.set(mk(1, { until: new Date(T0 + 30_000) }));
    await service.runOnce();
    source.fetchBatchCalls.length = 0;
    advance(61_000);
    source.serverTimeMs += 3_600_000; // источник на час впереди
    await service.runOnce();
    expect(source.fetchBatchCalls).toHaveLength(0);
    expect(store.mirror.get('BAN:1')?.status).toBe('ACTIVE');
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBe(
      CLOCK_SKEW,
    );
    expect((await service.getStatus()).state).toBe('degraded');
    // Часы исправлены: следующий же проход возобновляет работу.
    source.serverTimeMs -= 3_600_000;
    advance(1500);
    await service.runOnce();
    expect(source.fetchBatchCalls.length).toBeGreaterThan(0);
    expect((await store.getState('test', 'BAN')).lastErrorCode).toBeNull();
    expect(store.mirror.get('BAN:1')?.status).toBe('EXPIRED');
  });

  it('расхождение в пределах допуска (4 с) применяется как поправка', async () => {
    const { service, source, store, advance } = setup();
    source.set(mk(1, { until: new Date(T0 + 62_000) }));
    await service.runOnce();
    advance(61_000);
    source.serverTimeMs += 4_000;
    await service.runOnce();
    // until = T0+62 с; время источника T0+61 с+4 с: строка истекла.
    expect(store.mirror.get('BAN:1')?.status).toBe('EXPIRED');
  });

  it('ошибочно истёкшая строка (until в будущем) перепроверяется и возвращается в ACTIVE', async () => {
    const { service, source, store, events, advance } = setup();
    source.set(mk(1, { until: new Date(T0 + 3_600_000) }));
    await service.runOnce();
    const m = store.mirror.get('BAN:1');
    if (!m) throw new Error('нет строки');
    m.status = 'EXPIRED'; // имитация прошлого ошибочного истечения
    advance(16_000);
    await service.runOnce();
    expect(store.mirror.get('BAN:1')?.status).toBe('ACTIVE');
    expect(
      events.some((e) => e.type === 'updated' && e.status === 'ACTIVE'),
    ).toBe(true);
  });

  it('строка, которую источник не считает действующей, не возвращается', async () => {
    const { service, source, store, advance } = setup();
    source.set(mk(1, { until: new Date(T0 + 3_600_000) }));
    await service.runOnce();
    const m = store.mirror.get('BAN:1');
    if (!m) throw new Error('нет строки');
    m.status = 'EXPIRED';
    source.set(
      mk(1, {
        until: new Date(T0 + 3_600_000),
        status: 'REMOVED',
        rowHash: 'hash-1-v2',
      }),
    );
    advance(16_000);
    await service.runOnce();
    expect(store.mirror.get('BAN:1')?.status).not.toBe('ACTIVE');
  });
});

describe('PunishmentsSyncService: токен лидера перед записью (F6)', () => {
  it('отказ heartbeat непосредственно перед записью запрещает applyBatch', async () => {
    const { service, source, store } = setup();
    source.set(mk(1));
    let calls = 0;
    await service.runOnce(async () => {
      calls += 1;
      return calls < 2; // 1-й вызов (перед чтением) успешен, 2-й (перед записью) нет
    });
    expect(calls).toBe(2);
    expect(store.writes).toBe(0);
    expect(store.mirror.size).toBe(0);
  });

  it('отказ heartbeat перед пометкой удалений: пометки нет', async () => {
    const { service, source, store, advance } = setupMany(4);
    await service.runOnce();
    advance(16_000);
    source.remove('BAN', '2');
    let calls = 0;
    // Вызовы: (1) перед опросом, (2) перед чтением активных, (3) перед
    // записью найденных, (4) перед пометкой удалений — отказ.
    await service.runOnce(async () => {
      calls += 1;
      return calls < 4;
    });
    expect(calls).toBe(4);
    expect(store.mirror.get('BAN:2')?.status).toBe('ACTIVE');
    // Контроль: с действующим токеном та же пометка выполняется.
    advance(16_000);
    await service.runOnce(async () => true);
    expect(store.mirror.get('BAN:2')?.status).toBe('DELETED_AT_SOURCE');
  });
});

describe('PunishmentsSyncService: сверка не блокирует опрос других типов (F11)', () => {
  it('полная сверка BAN идёт после опроса остальных типов', async () => {
    const { service, source, advance } = setup();
    source.set(mk(5));
    source.set(mk(5, { kind: 'MUTE', sourceId: '5' }));
    await service.runOnce();
    advance(3_700_000);
    source.fetchBatchCalls.length = 0;
    await service.runOnce();
    const calls = source.fetchBatchCalls;
    const mutePoll = calls.findIndex(
      (c) => c.kind === 'MUTE' && c.afterId === 4n,
    );
    const banReconcile = calls.findIndex(
      (c) => c.kind === 'BAN' && c.afterId === 0n,
    );
    expect(mutePoll).toBeGreaterThanOrEqual(0);
    expect(banReconcile).toBeGreaterThan(mutePoll);
  });
});

describe('PunishmentsSyncService: устаревание независимо от состояния (F9)', () => {
  it('state ok, но давно нет успешного опроса: stale=true', async () => {
    const { service, source, advance } = setup();
    source.set(mk(1));
    await service.runOnce();
    expect(await service.getStatus()).toMatchObject({
      state: 'ok',
      stale: false,
    });
    advance(120_000);
    expect(await service.getStatus()).toMatchObject({
      state: 'ok',
      stale: true,
    });
  });
});
