/// Мок админ-API: ТОЛЬКО для разработки (NODE_ENV !== production и
/// NEXT_PUBLIC_GIVEAWAY_MOCK=1); в production-бандл не попадает (динамический import).
import { prizesConfig } from './prizes';
import {
  AdminApiError,
  CALCULATE_PHRASE,
  type AdminApi,
  type AdminAuditEntry,
  type AdminDraw,
  type AdminMode,
  type AdminSettings,
  type AdminTicket,
  type AdminWinner,
} from './admin-types';

const HASH = '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996';
const SEED = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const uuidOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface DrawState {
  status: AdminDraw['status'];
  winners: AdminWinner[];
  order: { ticket: string; playerName: string }[];
  revision: number;
}

export function createMockAdminApi(): AdminApi {
  const NAMES = ['Steve', 'Alex_77', 'Creeper', 'Notch_fan', 'Herobrine', 'Zombie', 'Ender', 'Wolf', 'Ghast', 'Piglin', 'Dolphin', 'Squid'];
  const liveTickets: AdminTicket[] = NAMES.map((playerName, i) => ({
    ticket: `K${400 + i * 7}`,
    playerName,
    playerUuid: uuidOf(i + 1),
    issuedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
  }));
  let testTickets: AdminTicket[] = [];
  const testMinutes = new Map<string, number>();
  const audit: AdminAuditEntry[] = [];
  const draws: Record<AdminMode, DrawState> = {
    live: { status: 'none', winners: [], order: [], revision: 0 },
    test: { status: 'none', winners: [], order: [], revision: 0 },
  };
  const settings: AdminSettings = {
    thresholdMinutes: 3000,
    startAtUtc: new Date(Date.now() - 86_400_000).toISOString(),
    cutoffAtUtc: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    startAtMsk: '',
    cutoffAtMsk: '',
    started: true,
    drawFrozen: false,
  };
  let seq = 0;
  const log = (action: string, mode: AdminMode | null, detail: string | null = null) => {
    audit.unshift({
      id: String(++seq),
      at: new Date().toISOString(),
      actor: '100000000000000001',
      action,
      objectType: null,
      objectId: null,
      mode,
      detail,
    });
  };
  const ticketsOf = (mode: AdminMode) => (mode === 'test' ? testTickets : liveTickets);

  const view = (mode: AdminMode): AdminDraw => {
    const d = draws[mode];
    const base: AdminDraw = {
      mode,
      test: mode === 'test',
      status: d.status,
      canFreeze: d.status === 'none' && ticketsOf(mode).length > 0,
      snapshotHash: d.status === 'none' ? null : HASH,
      ticketCount: ticketsOf(mode).length,
      frozenAt: d.status === 'none' ? null : new Date().toISOString(),
      algorithm: 'twomc-giveaway-draw-v1',
      seed: d.status === 'calculated' || d.status === 'broadcast' ? SEED : null,
      calculatedAt: d.status === 'calculated' || d.status === 'broadcast' ? new Date().toISOString() : null,
      broadcastAt: d.status === 'broadcast' ? new Date().toISOString() : null,
      revision: d.revision,
    };
    if (d.status === 'calculated' || d.status === 'broadcast') {
      base.order = d.order;
      base.winners = d.winners;
      base.revealOrder = d.winners
        .filter((w) => w.status === 'active')
        .map((w) => w.place)
        .sort((a, b) => b - a);
    }
    return base;
  };

  return {
    async session() {
      await wait(100);
      return {
        discordId: '100000000000000001',
        discordName: 'mock-admin',
        csrfToken: 'mock-csrf',
        expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
        idleTimeoutS: 1800,
        testModeEnabled: true,
      };
    },
    async logout() {
      await wait(50);
    },
    async tickets({ mode, q, page, pageSize }) {
      await wait(80);
      const needle = q.trim().toLowerCase();
      const all = ticketsOf(mode).filter(
        (t) => !needle || t.ticket.toLowerCase().includes(needle) || t.playerName.toLowerCase().includes(needle),
      );
      return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
    },
    async player(uuid, mode) {
      await wait(80);
      const t = ticketsOf(mode).find((x) => x.playerUuid === uuid);
      const total = t && mode === 'test' ? (testMinutes.get(t.playerName) ?? 0) : 3120;
      return {
        playerUuid: uuid,
        playerName: t?.playerName ?? null,
        ticket: t?.ticket ?? null,
        totalMinutes: total,
        thresholdMinutes: settings.thresholdMinutes,
        days: [
          { day: '2026-11-20', minutes: 1200 },
          { day: '2026-11-21', minutes: total - 1200 },
        ],
        test: mode === 'test',
      };
    },
    async settings() {
      await wait(50);
      return { ...settings, drawFrozen: draws.live.status !== 'none' };
    },
    async patchSettings(body) {
      await wait(80);
      if (body.thresholdMinutes !== undefined && body.thresholdMinutes > settings.thresholdMinutes) {
        throw new AdminApiError(400, 'threshold_cannot_increase_after_start');
      }
      if (body.startAt !== undefined) throw new AdminApiError(400, 'start_cannot_change_after_start');
      if (body.thresholdMinutes !== undefined) settings.thresholdMinutes = body.thresholdMinutes;
      if (body.cutoffAt !== undefined) settings.cutoffAtUtc = body.cutoffAt;
      log('settings_update', null, Object.keys(body).join(','));
      return { ...settings };
    },
    async prizes() {
      await wait(50);
      return {
        items: prizesConfig.prizes.map((p) => ({
          id: `place-${p.place}`,
          name: p.title,
          quantity: 1,
          imageFile: p.image,
          priority: p.place,
          place: p.place,
          description: p.description,
        })),
      };
    },
    async draw(mode) {
      await wait(60);
      return view(mode);
    },
    async freeze(mode) {
      await wait(80);
      if (ticketsOf(mode).length === 0) throw new AdminApiError(409, 'no_tickets');
      draws[mode].status = 'frozen';
      draws[mode].revision += 1;
      log('draw_freeze', mode);
      return view(mode);
    },
    async calculate(mode, snapshotHash, confirm) {
      await wait(120);
      const d = draws[mode];
      if (confirm !== CALCULATE_PHRASE) throw new AdminApiError(400, 'invalid_body');
      if (d.status === 'none') throw new AdminApiError(409, 'not_frozen');
      if (d.status !== 'frozen') throw new AdminApiError(409, 'already_calculated');
      if (snapshotHash !== HASH) throw new AdminApiError(409, 'snapshot_mismatch');
      const tickets = ticketsOf(mode);
      d.order = tickets.map((t) => ({ ticket: t.ticket, playerName: t.playerName }));
      d.winners = prizesConfig.prizes.slice(0, Math.min(10, tickets.length)).map((p, i) => ({
        id: `w${mode}${i}`,
        place: p.place,
        orderIndex: i,
        ticket: tickets[i]!.ticket,
        playerName: tickets[i]!.playerName,
        playerUuid: tickets[i]!.playerUuid,
        prizeName: p.title,
        imageFile: p.image,
        status: 'active',
        disqualifyReason: null,
        replacesWinnerId: null,
        totalMinutes: 3120,
      }));
      d.status = 'calculated';
      d.revision += 1;
      log('draw_calculate', mode);
      return view(mode);
    },
    async broadcast(mode) {
      await wait(80);
      const d = draws[mode];
      if (d.status === 'broadcast') throw new AdminApiError(409, 'already_broadcast');
      if (d.status !== 'calculated') throw new AdminApiError(409, 'not_calculated');
      d.status = 'broadcast';
      d.revision += 1;
      log('draw_broadcast', mode);
      return view(mode);
    },
    async disqualify(mode, winnerId, reason) {
      await wait(80);
      const d = draws[mode];
      const w = d.winners.find((x) => x.id === winnerId);
      if (!w) throw new AdminApiError(404, 'not_found');
      if (w.status !== 'active') throw new AdminApiError(409, 'winner_not_active');
      w.status = 'disqualified';
      w.disqualifyReason = reason;
      const used = new Set(d.winners.map((x) => x.ticket));
      const next = ticketsOf(mode).find((t) => !used.has(t.ticket));
      let replacement: AdminWinner | null = null;
      if (next) {
        replacement = {
          ...w,
          id: `${w.id}r`,
          orderIndex: d.winners.length,
          ticket: next.ticket,
          playerName: next.playerName,
          playerUuid: next.playerUuid,
          status: 'active',
          disqualifyReason: null,
          replacesWinnerId: w.id,
        };
        d.winners.push(replacement);
      }
      d.revision += 1;
      log('winner_disqualify', mode, reason);
      return { replacement, draw: view(mode) };
    },
    async testTime({ playerName, minutes }) {
      await wait(60);
      const total = (testMinutes.get(playerName) ?? 0) + minutes;
      testMinutes.set(playerName, total);
      log('test_time', 'test', playerName);
      return { playerName, totalMinutes: total };
    },
    async testTickets(playerName) {
      await wait(60);
      const total = testMinutes.get(playerName) ?? 0;
      if (total < settings.thresholdMinutes) throw new AdminApiError(409, 'not_enough_time');
      let t = testTickets.find((x) => x.playerName === playerName);
      if (!t) {
        t = {
          ticket: `T${String(testTickets.length + 1).padStart(3, '0')}`,
          playerName,
          playerUuid: uuidOf(1000 + testTickets.length),
          issuedAt: new Date().toISOString(),
        };
        testTickets.push(t);
      }
      log('test_ticket', 'test', playerName);
      return { ticket: t.ticket, playerName, totalMinutes: total };
    },
    async testSeed(count) {
      await wait(60);
      for (let i = 0; i < count; i += 1) {
        const n = testTickets.length + 1;
        testTickets.push({
          ticket: `T${String(n).padStart(3, '0')}`,
          playerName: `Test${String(n).padStart(3, '0')}`,
          playerUuid: uuidOf(1000 + n),
          issuedAt: new Date().toISOString(),
        });
      }
      log('test_seed', 'test', String(count));
      return { created: count };
    },
    async testReset() {
      await wait(60);
      testTickets = [];
      testMinutes.clear();
      draws.test = { status: 'none', winners: [], order: [], revision: 0 };
      log('test_reset', 'test');
      return { reset: true };
    },
    async audit(page, pageSize) {
      await wait(60);
      return { items: audit.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: audit.length };
    },
  };
}
