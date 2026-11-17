import {
  InMemoryMirrorStore,
  InMemorySource,
} from '../../../test/support/in-memory-punishments';
import {
  NEEDS_RECONCILE,
  PunishmentChangeEvent,
  PunishmentsSyncService,
  SOURCE_EMPTY,
} from './punishments-sync.service';
import { PunishmentsConfig } from './punishments.config';
import { PunishmentsRuntime } from './punishments.tokens';
import {
  NormalizedPunishment,
  SourceAuthFailed,
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
    },
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

  it('откат источника: курсор не сбрасывается, данные не теряются, сверка мягкая', async () => {
    const { service, source, store, advance } = setup();
    for (let i = 1; i <= 5; i++) source.set(mk(i));
    await service.runOnce();
    advance(2000);
    for (let i = 3; i <= 5; i++) source.remove('BAN', String(i));
    await service.runOnce();
    expect((await store.getState('test', 'BAN')).cursorId).toBe(5n);
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
