/// Только для тестов: реализация порта `InventoryAssemblyStore` в памяти.
/// Повторяет семантику скриптов Lua (`redis-inventory-assembly.store.ts`) шаг
/// в шаг (П4.1–П4.7, П6) на структурах в памяти с TTL по переданным часам.
/// Каждая операция атомарна по построению (один синхронный проход). Что
/// НЕ проверяется: сам текст Lua и настоящая атомарность в Redis.
import { compareEpoch } from '../../src/modules/inventory/inventory-freshness';
import type {
  AssemblyMark,
  FinishInput,
  FinishResult,
  InventoryAssemblyStore,
  OfferInput,
  OfferResult,
  ProbeResult,
} from '../../src/modules/inventory/inventory-assembly.store';
import type { AssemblyConfig } from '../../src/modules/inventory/inventory-assembly.config';

interface Asm {
  exp: number;
  parts: number;
  group: string;
  epoch: string;
  rev: number;
  cap: number;
  online: boolean;
  uh: string;
  userId: string;
  first: number;
  bytes: number;
  p: Map<number, { json: string; hash: string; sg: string }>;
}

interface ServerState {
  asms: Map<string, Asm>;
  svc: Map<string, number>;
  done: Map<string, number>;
  evt: Map<string, number>;
  mark: Map<string, { kind: AssemblyMark; exp: number }>;
  lock: Map<string, { token: string; exp: number }>;
  rl: Map<string, { count: number; exp: number }>;
}

export class InMemoryAssemblyStore implements InventoryAssemblyStore {
  /// Счётчик обращений: проверки до Redis должны оставлять нули.
  readonly calls = { probe: 0, offer: 0, finish: 0, configGet: 0 };
  /// Redis недоступен: любая операция бросает.
  down = false;
  /// Значения для `CONFIG GET`; `configError` — команда запрещена.
  policy: string | null = 'noeviction';
  maxMemory: string | null = String(512 * 1024 * 1024);
  configError = false;

  /// `clock` — часы модели (мс): TTL ключей считаются по ним, как Redis по
  /// своим; тест двигает их вместе с `now`, который передаёт сборщику.
  constructor(private readonly clock: () => number) {}

  private readonly servers = new Map<string, ServerState>();
  private readonly global = new Map<string, { bytes: number; ts: number }>();

  private state(serverId: string): ServerState {
    let s = this.servers.get(serverId);
    if (!s) {
      s = {
        asms: new Map(),
        svc: new Map(),
        done: new Map(),
        evt: new Map(),
        mark: new Map(),
        lock: new Map(),
        rl: new Map(),
      };
      this.servers.set(serverId, s);
    }
    return s;
  }

  private guard(): void {
    if (this.down) throw new Error('redis down');
  }

  // --- вспомогательные операции модели -------------------------------------

  /// TTL ключей: просроченное исчезает (ключ живёт, пока now < exp).
  private expire(s: ServerState, now: number): void {
    for (const [id, a] of s.asms) if (a.exp <= now) s.asms.delete(id);
    for (const m of [s.done, s.evt]) {
      for (const [k, exp] of m) if (exp <= now) m.delete(k);
    }
    for (const [k, v] of s.mark) if (v.exp <= now) s.mark.delete(k);
    for (const [k, v] of s.lock) if (v.exp <= now) s.lock.delete(k);
    for (const [k, v] of s.rl) if (v.exp <= now) s.rl.delete(k);
  }

  private bufferBytes(s: ServerState): number {
    let sum = 0;
    for (const a of s.asms.values()) sum += a.bytes;
    return sum;
  }

  private svcBytes(s: ServerState, c: AssemblyConfig): number {
    return s.svc.size * c.serviceBytesPerSnapshot;
  }

  private cleanup(s: ServerState, now: number, c: AssemblyConfig): void {
    for (const [id, exp] of s.svc) if (exp <= now) s.svc.delete(id);
    for (const [sid, g] of this.global) {
      if (g.ts <= now - c.ttlSvcMs - c.globalEntryExtraMs) {
        this.global.delete(sid);
      }
    }
  }

  private recompute(
    serverId: string,
    s: ServerState,
    now: number,
    c: AssemblyConfig,
  ): void {
    this.global.set(serverId, {
      bytes: this.bufferBytes(s) + this.svcBytes(s, c),
      ts: now,
    });
  }

  private setMark(
    s: ServerState,
    id: string,
    kind: AssemblyMark,
    now: number,
    c: AssemblyConfig,
  ): void {
    s.mark.set(id, { kind, exp: now + c.ttlSvcMs });
    s.svc.set(id, now + c.ttlSvcMs);
  }

  private isComplete(a: Asm, expected: readonly string[]): boolean {
    const have = new Set<string>();
    for (let k = 1; k <= a.parts; k += 1) {
      const part = a.p.get(k);
      if (!part) continue;
      if (!expected.includes(part.sg) || have.has(part.sg)) return false;
      have.add(part.sg);
    }
    return have.size === expected.length;
  }

  // --- порт ---------------------------------------------------------------

  probe(
    serverId: string,
    snapshotId: string,
    eventId: string,
  ): Promise<ProbeResult> {
    this.calls.probe += 1;
    this.guard();
    const s = this.state(serverId);
    const now = this.clock();
    this.expire(s, now);
    return Promise.resolve({
      done: s.done.has(snapshotId),
      evt: s.evt.has(eventId),
      mark: s.mark.get(snapshotId)?.kind ?? null,
      live: s.asms.has(snapshotId),
    });
  }

  offer(input: OfferInput): Promise<OfferResult> {
    this.calls.offer += 1;
    this.guard();
    const c = input.config;
    const now = input.nowMs;
    const s = this.state(input.serverId);
    this.expire(s, now);
    this.cleanup(s, now, c);
    const result = this.offerInner(input, s, now);
    this.recompute(input.serverId, s, now, c);
    return Promise.resolve(result);
  }

  private offerInner(
    input: OfferInput,
    s: ServerState,
    now: number,
  ): OfferResult {
    const c = input.config;
    const id = input.snapshotId;
    const { part, header } = input;

    // П4.2
    if (s.done.has(id)) return { kind: 'duplicate' };
    if (s.evt.has(input.eventId)) return { kind: 'duplicate' };
    const mk = s.mark.get(id);
    if (mk) {
      if (mk.kind === 'poison') {
        return {
          kind: 'rejected',
          code: 'snapshot_mismatch',
          reason: 'poisoned',
        };
      }
      if (mk.kind === 'evicted') {
        return { kind: 'rejected', code: 'resync_required', reason: 'evicted' };
      }
      return { kind: 'stale' };
    }

    // П4.3
    if (!s.asms.has(id)) {
      if (input.probedLive) return { kind: 'reprobe' };
      const refusal = this.create(input, s, now);
      if (refusal) return refusal;
    }
    const asm = s.asms.get(id) as Asm;

    // П4.4
    if (
      asm.parts !== header.parts ||
      asm.group !== header.group ||
      asm.epoch !== header.epoch ||
      asm.rev !== header.rev ||
      asm.cap !== header.capturedAtMs ||
      asm.online !== header.playerOnline ||
      asm.uh !== header.uuidHash
    ) {
      this.setMark(s, id, 'poison', now, c);
      this.drop(s, id);
      return { kind: 'rejected', code: 'snapshot_mismatch', reason: 'header' };
    }

    // П4.5
    const existing = asm.p.get(part.n);
    if (existing) {
      if (existing.hash !== part.hash) {
        this.setMark(s, id, 'poison', now, c);
        this.drop(s, id);
        return { kind: 'rejected', code: 'conflict', reason: 'part_differs' };
      }
      if (!this.isComplete(asm, input.expectedGroups)) {
        return { kind: 'duplicate' };
      }
    } else {
      for (const other of asm.p.values()) {
        if (other.sg === part.slotGroup) {
          this.setMark(s, id, 'poison', now, c);
          this.drop(s, id);
          return {
            kind: 'rejected',
            code: 'conflict',
            reason: 'slot_group_repeat',
          };
        }
      }
      if (asm.bytes - c.assemblyOverheadBytes + part.bytes > c.maxAssembledBytes) {
        this.drop(s, id);
        return {
          kind: 'rejected',
          code: 'invalid_data',
          reason: 'assembly_too_large',
        };
      }
      asm.p.set(part.n, {
        json: part.slotsJson,
        hash: part.hash,
        sg: part.slotGroup,
      });
      asm.bytes += part.bytes;
      // П4.6
      if (!this.isComplete(asm, input.expectedGroups)) {
        s.evt.set(input.eventId, now + c.ttlSvcMs);
        s.svc.set(id, now + c.ttlSvcMs);
        return { kind: 'buffered' };
      }
    }

    // П4.7
    if (s.lock.has(id)) return { kind: 'lock_busy' };
    s.lock.set(id, { token: input.token, exp: now + c.lockTtlMs });
    const parts = [...asm.p.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([n, p]) => ({ part: n, slotGroup: p.sg, slotsJson: p.json }));
    return { kind: 'complete', userId: asm.userId, parts };
  }

  private create(
    input: OfferInput,
    s: ServerState,
    now: number,
  ): OfferResult | null {
    const c = input.config;
    const userId = input.userId;
    if (!userId) {
      return { kind: 'rejected', code: 'invalid_data', reason: 'no_user' };
    }
    const refuse = (reason: string): OfferResult => ({
      kind: 'rejected',
      code: 'resync_required',
      reason,
    });
    if ((s.rl.get(userId)?.count ?? 0) >= c.snapshotsPerMinute) {
      return refuse('rate');
    }
    if (s.asms.size >= c.maxAssembliesPerServer) {
      return refuse('ceiling_assemblies');
    }
    const buf = this.bufferBytes(s);
    const newBytes = input.part.bytes + c.assemblyOverheadBytes;
    if (buf + newBytes > c.maxBufferBytesPerServer) {
      return refuse('ceiling_buffer');
    }
    const svcB = this.svcBytes(s, c);
    if (svcB + c.serviceBytesPerSnapshot > c.maxServiceBytesPerServer) {
      return refuse('ceiling_service');
    }
    let n = this.global.size;
    if (!this.global.has(input.serverId)) {
      if (n >= c.maxServers) return refuse('ceiling_servers');
      n += 1;
    }
    const share = Math.min(c.maxServerBytes, Math.floor(c.maxGlobalBytes / n));
    if (buf + svcB + newBytes + c.serviceBytesPerSnapshot > share) {
      return refuse('ceiling_server');
    }
    let total = 0;
    for (const g of this.global.values()) total += g.bytes;
    const mine = this.global.get(input.serverId)?.bytes ?? 0;
    total =
      total - mine + buf + svcB + newBytes + c.serviceBytesPerSnapshot;
    if (total > c.maxGlobalBytes) return refuse('ceiling_global');

    // Вытеснение самой старой по firstSeenAt: только после всех проверок.
    const own = () =>
      [...s.asms.entries()]
        .filter(([, a]) => a.userId === userId && a.group === input.header.group)
        .sort((x, y) => x[1].first - y[1].first);
    while (own().length >= c.assembliesPerPlayerGroup) {
      const oldest = own()[0][0];
      this.setMark(s, oldest, 'evicted', now, c);
      this.drop(s, oldest);
    }

    s.asms.set(input.snapshotId, {
      exp: now + c.assemblyTimeoutMs,
      parts: input.header.parts,
      group: input.header.group,
      epoch: input.header.epoch,
      rev: input.header.rev,
      cap: input.header.capturedAtMs,
      online: input.header.playerOnline,
      uh: input.header.uuidHash,
      userId,
      first: now,
      bytes: c.assemblyOverheadBytes,
      p: new Map(),
    });
    s.svc.set(input.snapshotId, now + c.ttlSvcMs);
    const rl = s.rl.get(userId);
    if (rl) rl.count += 1;
    else s.rl.set(userId, { count: 1, exp: now + 60_000 });
    return null;
  }

  private drop(s: ServerState, id: string): void {
    s.asms.delete(id);
  }

  finish(input: FinishInput): Promise<FinishResult> {
    this.calls.finish += 1;
    this.guard();
    const c = input.config;
    const now = input.nowMs;
    const s = this.state(input.serverId);
    this.expire(s, now);
    this.cleanup(s, now, c);
    const result = this.finishInner(input, s, now);
    this.recompute(input.serverId, s, now, c);
    return Promise.resolve(result);
  }

  private finishInner(
    input: FinishInput,
    s: ServerState,
    now: number,
  ): FinishResult {
    const c = input.config;
    const id = input.snapshotId;
    if (s.lock.get(id)?.token !== input.token) {
      return { ok: false, reason: 'lock_lost' };
    }
    s.lock.delete(id);
    if (input.outcome === 'retry') return { ok: true };
    if (input.outcome === 'discard') {
      this.drop(s, id);
      return { ok: true };
    }
    if (input.outcome === 'applied') s.done.set(id, now + c.ttlSvcMs);
    else s.mark.set(id, { kind: 'stale', exp: now + c.ttlSvcMs });
    s.evt.set(input.eventId, now + c.ttlSvcMs);
    s.svc.set(id, now + c.ttlSvcMs);
    this.drop(s, id);
    if (input.outcome === 'applied') {
      // Сброс неполных сборок игрока и группы с меньшей свежестью.
      for (const [otherId, a] of [...s.asms.entries()]) {
        if (
          otherId === id ||
          a.userId !== input.userId ||
          a.group !== input.group
        ) {
          continue;
        }
        const cmp = compareEpoch(a.epoch, input.epoch);
        if (cmp < 0 || (cmp === 0 && a.rev < input.rev)) {
          this.setMark(s, otherId, 'superseded', now, c);
          this.drop(s, otherId);
        }
      }
    }
    return { ok: true };
  }

  configGet(name: 'maxmemory-policy' | 'maxmemory'): Promise<string | null> {
    this.calls.configGet += 1;
    this.guard();
    if (this.configError) return Promise.reject(new Error('CONFIG denied'));
    return Promise.resolve(name === 'maxmemory' ? this.maxMemory : this.policy);
  }

  // --- наблюдение для тестов -----------------------------------------------

  assemblyCount(serverId: string): number {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return s.asms.size;
  }

  bufferBytesOf(serverId: string): number {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return this.bufferBytes(s);
  }

  hasDone(serverId: string, snapshotId: string): boolean {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return s.done.has(snapshotId);
  }

  hasEvt(serverId: string, eventId: string): boolean {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return s.evt.has(eventId);
  }

  hasLock(serverId: string, snapshotId: string): boolean {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return s.lock.has(snapshotId);
  }

  markOf(serverId: string, snapshotId: string): string | null {
    const s = this.state(serverId);
    this.expire(s, this.clock());
    return s.mark.get(snapshotId)?.kind ?? null;
  }

  /// Остаток TTL метки `done` (мс) или null.
  doneTtl(serverId: string, snapshotId: string): number | null {
    const s = this.state(serverId);
    const exp = s.done.get(snapshotId);
    return exp === undefined ? null : exp - this.clock();
  }

  /// Сбросить захват: имитация истечения TTL 30 с без хода часов.
  forgetLock(serverId: string, snapshotId: string): void {
    this.state(serverId).lock.delete(snapshotId);
  }

  /// Захватить `lock` другим токеном (имитация «чужого» захвата).
  stealLock(serverId: string, snapshotId: string, token: string, exp: number) {
    this.state(serverId).lock.set(snapshotId, { token, exp });
  }

  svcCount(serverId: string): number {
    const s = this.state(serverId);
    const now = this.clock();
    for (const [id, exp] of s.svc) if (exp <= now) s.svc.delete(id);
    return s.svc.size;
  }

  globalEntries(): number {
    return this.global.size;
  }

  /// Эмуляция записи сервера в `g` (для проверок справедливой доли).
  seedGlobal(serverId: string, bytes: number, ts: number): void {
    this.global.set(serverId, { bytes, ts });
  }
}
