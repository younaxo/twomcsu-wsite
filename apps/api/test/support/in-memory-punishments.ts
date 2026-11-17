/// Только для тестов: источник и хранилище зеркала в памяти.
import {
  EMPTY_SYNC_STATE,
  MirrorChange,
  PunishmentMirrorStore,
  SyncStatePatch,
  SyncStateSnapshot,
} from '../../src/modules/punishments/punishment-mirror.store';
import {
  NormalizedPunishment,
  PunishmentKind,
  PunishmentSource,
  SourceHealth,
} from '../../src/modules/punishments/punishment.types';

export class InMemorySource implements PunishmentSource {
  readonly id = 'test' as const;
  rows = new Map<PunishmentKind, Map<string, NormalizedPunishment>>();
  serverTimeMs = 0;
  failWith: Error | null = null;
  fetchBatchCalls: Array<{ kind: PunishmentKind; afterId: bigint }> = [];

  set(row: NormalizedPunishment): void {
    let m = this.rows.get(row.kind);
    if (!m) {
      m = new Map();
      this.rows.set(row.kind, m);
    }
    m.set(row.sourceId, row);
  }
  remove(kind: PunishmentKind, id: string): void {
    this.rows.get(kind)?.delete(id);
  }
  clear(): void {
    this.rows.clear();
  }
  private sorted(kind: PunishmentKind): NormalizedPunishment[] {
    return [...(this.rows.get(kind)?.values() ?? [])].sort((a, b) =>
      BigInt(a.sourceId) < BigInt(b.sourceId) ? -1 : 1,
    );
  }
  private check(): void {
    if (this.failWith) throw this.failWith;
  }
  async health(): Promise<SourceHealth> {
    this.check();
    return { ok: true, serverTimeMs: this.serverTimeMs };
  }
  async fetchBatch(
    kind: PunishmentKind,
    afterId: bigint,
    limit: number,
  ): Promise<NormalizedPunishment[]> {
    this.check();
    this.fetchBatchCalls.push({ kind, afterId });
    return this.sorted(kind)
      .filter((r) => BigInt(r.sourceId) > afterId)
      .slice(0, limit);
  }
  async fetchByIds(
    kind: PunishmentKind,
    ids: bigint[],
  ): Promise<{ found: NormalizedPunishment[]; missing: bigint[] }> {
    this.check();
    const m = this.rows.get(kind);
    const found: NormalizedPunishment[] = [];
    const missing: bigint[] = [];
    for (const id of ids) {
      const r = m?.get(id.toString());
      if (r) found.push(r);
      else missing.push(id);
    }
    return { found, missing };
  }
  async maxId(kind: PunishmentKind): Promise<bigint> {
    this.check();
    const s = this.sorted(kind);
    return s.length ? BigInt(s[s.length - 1].sourceId) : 0n;
  }
  async resolveNames(): Promise<Map<string, string>> {
    return new Map();
  }
  async close(): Promise<void> {}
}

interface MirrorRow {
  row: NormalizedPunishment;
  status: NormalizedPunishment['status'] | 'DELETED_AT_SOURCE';
  rev: number;
}

export class InMemoryMirrorStore implements PunishmentMirrorStore {
  mirror = new Map<string, MirrorRow>();
  states = new Map<string, SyncStateSnapshot>();
  writes = 0;

  private key(kind: PunishmentKind, id: string | bigint): string {
    return `${kind}:${id.toString()}`;
  }
  async getState(
    source: string,
    kind: PunishmentKind,
  ): Promise<SyncStateSnapshot> {
    return { ...(this.states.get(`${source}:${kind}`) ?? EMPTY_SYNC_STATE) };
  }
  async patchState(
    source: string,
    kind: PunishmentKind,
    patch: SyncStatePatch,
  ): Promise<void> {
    const cur = await this.getState(source, kind);
    this.states.set(`${source}:${kind}`, { ...cur, ...patch });
  }
  async applyBatch(
    source: string,
    kind: PunishmentKind,
    rows: NormalizedPunishment[],
    cursorId: bigint | null,
  ): Promise<MirrorChange[]> {
    const changes: MirrorChange[] = [];
    for (const row of rows) {
      const k = this.key(kind, row.sourceId);
      const cur = this.mirror.get(k);
      if (
        cur &&
        cur.row.rowHash === row.rowHash &&
        cur.status !== 'DELETED_AT_SOURCE'
      ) {
        continue;
      }
      this.writes += 1;
      const rev = cur ? cur.rev + 1 : 1;
      this.mirror.set(k, { row, status: row.status, rev });
      changes.push({
        kind,
        sourceId: row.sourceId,
        inserted: !cur,
        rev,
        status: row.status,
      });
    }
    if (cursorId !== null) {
      const cur = await this.getState(source, kind);
      if (cursorId > cur.cursorId) {
        this.states.set(`${source}:${kind}`, { ...cur, cursorId });
      }
    }
    return changes;
  }
  private ids(kind: PunishmentKind, pred: (m: MirrorRow) => boolean): bigint[] {
    return [...this.mirror.entries()]
      .filter(([k, m]) => k.startsWith(`${kind}:`) && pred(m))
      .map(([k]) => BigInt(k.split(':')[1]))
      .sort((a, b) => (a < b ? -1 : 1));
  }
  async listActiveIds(
    _source: string,
    kind: PunishmentKind,
    afterId: bigint,
    limit: number,
  ): Promise<bigint[]> {
    return this.ids(kind, (m) => m.status === 'ACTIVE')
      .filter((i) => i > afterId)
      .slice(0, limit);
  }
  async listMirroredIds(
    _source: string,
    kind: PunishmentKind,
    afterId: bigint,
    upToId: bigint | null,
  ): Promise<bigint[]> {
    return this.ids(kind, (m) => m.status !== 'DELETED_AT_SOURCE').filter(
      (i) => i > afterId && (upToId === null || i <= upToId),
    );
  }
  async markDeletedAtSource(
    _source: string,
    kind: PunishmentKind,
    ids: bigint[],
  ): Promise<MirrorChange[]> {
    const out: MirrorChange[] = [];
    for (const id of ids) {
      const m = this.mirror.get(this.key(kind, id));
      if (!m || m.status === 'DELETED_AT_SOURCE') continue;
      m.status = 'DELETED_AT_SOURCE';
      m.rev += 1;
      out.push({
        kind,
        sourceId: id.toString(),
        inserted: false,
        rev: m.rev,
        status: 'DELETED_AT_SOURCE',
      });
    }
    return out;
  }
  async expireDue(_source: string, now: Date): Promise<MirrorChange[]> {
    const out: MirrorChange[] = [];
    for (const m of this.mirror.values()) {
      if (
        m.status === 'ACTIVE' &&
        m.row.until &&
        m.row.until.getTime() <= now.getTime()
      ) {
        m.status = 'EXPIRED';
        m.rev += 1;
        out.push({
          kind: m.row.kind,
          sourceId: m.row.sourceId,
          inserted: false,
          rev: m.rev,
          status: 'EXPIRED',
        });
      }
    }
    return out;
  }
}
