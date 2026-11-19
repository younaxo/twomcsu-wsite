import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DRAW_CONFIRM_PHRASE,
  SNAPSHOT_HASH_PATTERN,
} from './giveaway.constants';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import { GiveawayDataService, GiveawayMode } from './giveaway-data.service';
import {
  DRAW_ALGORITHM,
  DrawPrize,
  SnapshotEntry,
  canonicalSnapshot,
  drawOrder,
  newSeed,
  nextCandidateIndex,
  placesFor,
  snapshotHashOf,
} from './giveaway-draw';
import { badRequest, conflict, notFound } from './giveaway-errors';
import { GiveawayPrizesService } from './giveaway-prizes.service';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { GiveawayStreamService } from './giveaway-stream.service';

export const DEMO_PRIZES: DrawPrize[] = [
  { name: 'Тестовый приз', quantity: 3, imageFile: null },
];

interface WinnerRow {
  id: string;
  place: number;
  orderIndex: number;
  ticket: string;
  playerUuid: string;
  playerName: string;
  prizeName: string;
  prizeImage: string | null;
  status: string;
  disqualifyReason: string | null;
  replacesWinnerId: string | null;
  createdAt: Date;
}

function parseSnapshot(json: string): SnapshotEntry[] {
  return (JSON.parse(json) as { tickets: SnapshotEntry[] }).tickets;
}

/// Заморозка снимка, расчёт, эфир и дисквалификация (ADR-G003 п. 3-4).
/// Все переходы статуса - условные UPDATE в транзакции; «Рассчитать»
/// выполняется ровно один раз (статус + UNIQUE(context) в БД).
@Injectable()
export class GiveawayDrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: GiveawayDataService,
    private readonly prizes: GiveawayPrizesService,
    private readonly settings: GiveawaySettingsService,
    private readonly audit: GiveawayAdminAuditService,
    private readonly stream: GiveawayStreamService,
  ) {}

  private async prizesFor(mode: GiveawayMode): Promise<DrawPrize[]> {
    const rows = await this.prizes.ordered();
    const list = rows.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      imageFile: p.imageFile,
    }));
    if (list.length > 0) return list;
    if (mode === 'test') return DEMO_PRIZES;
    throw conflict('no_prizes');
  }

  async freeze(
    mode: GiveawayMode,
    actor: string,
    now: Date = new Date(),
  ): Promise<ReturnType<GiveawayDrawService['state']>> {
    const existing = await this.prisma.giveawayDraw.findUnique({
      where: { context: mode },
    });
    if (existing !== null) return this.state(mode, now);
    if (mode === 'live') {
      const s = await this.settings.get();
      if (now.getTime() <= s.cutoffAt.getTime()) {
        throw conflict('cutoff_not_reached');
      }
    }
    const entries = await this.data.allTickets(mode);
    if (entries.length === 0) throw conflict('no_tickets');
    const json = canonicalSnapshot(entries);
    const hash = snapshotHashOf(json);
    try {
      await this.prisma.giveawayDraw.create({
        data: {
          context: mode,
          status: 'frozen',
          snapshotJson: json,
          snapshotHash: hash,
          ticketCount: entries.length,
          frozenAt: now,
          frozenBy: actor,
        },
      });
    } catch (err) {
      if ((err as { code?: unknown }).code !== 'P2002') throw err;
      return this.state(mode, now);
    }
    await this.audit.record({
      actor,
      action: 'draw_freeze',
      objectType: 'draw',
      mode,
      detail: `tickets=${entries.length} hash=${hash}`,
    });
    return this.state(mode, now);
  }

  async calculate(
    mode: GiveawayMode,
    snapshotHash: string,
    confirm: string,
    actor: string,
    now: Date = new Date(),
  ) {
    if (
      confirm !== DRAW_CONFIRM_PHRASE ||
      !SNAPSHOT_HASH_PATTERN.test(snapshotHash)
    ) {
      throw badRequest('invalid_body');
    }
    const prizes = await this.prizesFor(mode);
    await this.prisma.$transaction(async (tx) => {
      const draw = await tx.giveawayDraw.findUnique({
        where: { context: mode },
      });
      if (draw === null) throw conflict('not_frozen');
      if (draw.status !== 'frozen') throw conflict('already_calculated');
      if (draw.snapshotHash !== snapshotHash) {
        throw conflict('snapshot_mismatch');
      }
      if (snapshotHashOf(draw.snapshotJson) !== draw.snapshotHash) {
        throw conflict('snapshot_corrupt');
      }
      const entries = parseSnapshot(draw.snapshotJson);
      const seed = newSeed();
      const order = drawOrder(entries, seed, draw.snapshotHash);
      const places = placesFor(prizes);
      const claimed = await tx.giveawayDraw.updateMany({
        where: { id: draw.id, status: 'frozen' },
        data: {
          status: 'calculated',
          seedHex: seed.toString('hex'),
          algorithm: DRAW_ALGORITHM,
          orderJson: JSON.stringify(order.map((e) => e.ticket)),
          prizesJson: JSON.stringify(prizes),
          calculatedAt: now,
          calculatedBy: actor,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw conflict('already_calculated');
      const n = Math.min(places.length, order.length);
      await tx.giveawayWinner.createMany({
        data: Array.from({ length: n }, (_, k) => ({
          drawId: draw.id,
          place: places[k].place,
          orderIndex: k,
          ticket: order[k].ticket,
          playerUuid: order[k].playerUuid,
          playerName: order[k].playerName,
          prizeName: places[k].prizeName,
          prizeImage: places[k].prizeImage,
          status: 'active',
        })),
      });
    });
    await this.audit.record({
      actor,
      action: 'draw_calculate',
      objectType: 'draw',
      mode,
      detail: `hash=${snapshotHash}`,
    });
    return this.state(mode, now);
  }

  async broadcast(mode: GiveawayMode, actor: string, now: Date = new Date()) {
    const draw = await this.prisma.giveawayDraw.findUnique({
      where: { context: mode },
    });
    if (draw === null || draw.status === 'frozen') {
      throw conflict('not_calculated');
    }
    const claimed = await this.prisma.giveawayDraw.updateMany({
      where: { id: draw.id, status: 'calculated' },
      data: {
        status: 'broadcast',
        broadcastAt: now,
        broadcastBy: actor,
        revision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) throw conflict('already_broadcast');
    await this.audit.record({
      actor,
      action: 'draw_broadcast',
      objectType: 'draw',
      mode,
    });
    const state = await this.state(mode, now);
    await this.stream.publish(mode, 'results', {
      revision: state.revision,
      state: 'results',
    });
    return state;
  }

  async disqualify(
    mode: GiveawayMode,
    winnerId: string,
    reason: string,
    actor: string,
    now: Date = new Date(),
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM giveaway_draws WHERE context = ${mode} FOR UPDATE`;
      const draw = await tx.giveawayDraw.findUnique({
        where: { context: mode },
      });
      if (
        draw === null ||
        draw.status === 'frozen' ||
        draw.orderJson === null
      ) {
        throw conflict('not_calculated');
      }
      const winner = await tx.giveawayWinner.findFirst({
        where: { id: winnerId, drawId: draw.id },
      });
      if (winner === null) throw notFound();
      if (winner.status !== 'active') throw conflict('winner_not_active');
      const marked = await tx.giveawayWinner.updateMany({
        where: { id: winner.id, status: 'active' },
        data: {
          status: 'disqualified',
          disqualifiedAt: now,
          disqualifiedBy: actor,
          disqualifyReason: reason,
        },
      });
      if (marked.count !== 1) throw conflict('winner_not_active');
      const usedRows = await tx.giveawayWinner.findMany({
        where: { drawId: draw.id },
        select: { orderIndex: true },
      });
      const order = JSON.parse(draw.orderJson) as string[];
      const idx = nextCandidateIndex(
        order.length,
        new Set(usedRows.map((r) => r.orderIndex)),
      );
      let replacementId: string | null = null;
      if (idx !== null) {
        const entry = parseSnapshot(draw.snapshotJson).find(
          (e) => e.ticket === order[idx],
        );
        if (entry === undefined) throw conflict('snapshot_corrupt');
        const created = await tx.giveawayWinner.create({
          data: {
            drawId: draw.id,
            place: winner.place,
            orderIndex: idx,
            ticket: entry.ticket,
            playerUuid: entry.playerUuid,
            playerName: entry.playerName,
            prizeName: winner.prizeName,
            prizeImage: winner.prizeImage,
            status: 'active',
            replacesWinnerId: winner.id,
          },
        });
        replacementId = created.id;
      }
      await tx.giveawayDraw.update({
        where: { id: draw.id },
        data: { revision: { increment: 1 } },
      });
      return {
        replacementId,
        broadcast: draw.status === 'broadcast',
        place: winner.place,
        ticket: winner.ticket,
      };
    });
    await this.audit.record({
      actor,
      action: 'winner_disqualify',
      objectType: 'winner',
      objectId: winnerId,
      mode,
      detail: `place=${result.place} ticket=${result.ticket} reason=${reason}`,
    });
    const draw = await this.state(mode, now);
    if (result.broadcast) {
      await this.stream.publish(mode, 'results', {
        revision: draw.revision,
        state: 'results',
      });
    }
    return {
      replacement:
        draw.winners.find((w) => w.id === result.replacementId) ?? null,
      draw,
    };
  }

  /// Состояние для админа (ADR-G003 п. 6.1).
  async state(mode: GiveawayMode, now: Date = new Date()) {
    const draw = await this.prisma.giveawayDraw.findUnique({
      where: { context: mode },
      include: { winners: true },
    });
    const test = mode === 'test';
    if (draw === null) {
      let canFreeze = test;
      if (!test) {
        const s = await this.settings.get();
        canFreeze = now.getTime() > s.cutoffAt.getTime();
      }
      return {
        mode,
        test,
        status: 'none' as const,
        canFreeze,
        snapshotHash: null as string | null,
        ticketCount: null as number | null,
        frozenAt: null as string | null,
        algorithm: null as string | null,
        seed: null as string | null,
        calculatedAt: null as string | null,
        broadcastAt: null as string | null,
        revision: 0,
        order: [] as { ticket: string; playerName: string }[],
        prizes: [] as DrawPrize[],
        winners: [] as ReturnType<GiveawayDrawService['adminWinner']>[],
      };
    }
    const entries = parseSnapshot(draw.snapshotJson);
    const byTicket = new Map(entries.map((e) => [e.ticket, e]));
    const winners = [...(draw.winners as WinnerRow[])].sort(
      (a, b) =>
        a.place - b.place || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const minutes = await this.data.totalMinutes(
      mode,
      winners.map((w) => w.playerUuid),
    );
    return {
      mode,
      test,
      status: draw.status as 'frozen' | 'calculated' | 'broadcast',
      canFreeze: false,
      snapshotHash: draw.snapshotHash as string | null,
      ticketCount: draw.ticketCount as number | null,
      frozenAt: draw.frozenAt.toISOString() as string | null,
      algorithm: draw.algorithm,
      seed: draw.seedHex,
      calculatedAt: draw.calculatedAt?.toISOString() ?? null,
      broadcastAt: draw.broadcastAt?.toISOString() ?? null,
      revision: draw.revision,
      order:
        draw.orderJson === null
          ? []
          : (JSON.parse(draw.orderJson) as string[]).map((t) => ({
              ticket: t,
              playerName: byTicket.get(t)?.playerName ?? '',
            })),
      prizes:
        draw.prizesJson === null
          ? []
          : (JSON.parse(draw.prizesJson) as DrawPrize[]),
      winners: winners.map((w) =>
        this.adminWinner(w, minutes.get(w.playerUuid) ?? 0),
      ),
    };
  }

  private adminWinner(w: WinnerRow, totalMinutes: number) {
    return {
      id: w.id,
      place: w.place,
      orderIndex: w.orderIndex,
      ticket: w.ticket,
      playerName: w.playerName,
      playerUuid: w.playerUuid,
      prizeName: w.prizeName,
      imageFile: w.prizeImage,
      status: w.status as 'active' | 'disqualified',
      disqualifyReason: w.disqualifyReason,
      replacesWinnerId: w.replacesWinnerId,
      totalMinutes,
    };
  }

  /// Публичные итоги (ADR-G003 п. 6.2): до эфира расчёт не виден.
  async publicResults(mode: GiveawayMode) {
    const draw = await this.prisma.giveawayDraw.findUnique({
      where: { context: mode },
      include: { winners: true },
    });
    const test = mode === 'test';
    if (draw === null) {
      return {
        test,
        state: 'idle' as const,
        snapshotHash: null,
        ticketCount: null,
        revision: 0,
      };
    }
    if (draw.status !== 'broadcast' || draw.orderJson === null) {
      return {
        test,
        state: 'frozen' as const,
        snapshotHash: draw.snapshotHash,
        ticketCount: draw.ticketCount,
        revision: 1,
      };
    }
    const byTicket = new Map(
      parseSnapshot(draw.snapshotJson).map((e) => [e.ticket, e]),
    );
    const rows = [...(draw.winners as WinnerRow[])].sort(
      (a, b) =>
        a.place - b.place || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return {
      test,
      state: 'results' as const,
      snapshotHash: draw.snapshotHash,
      ticketCount: draw.ticketCount,
      revision: draw.revision,
      algorithm: draw.algorithm,
      seed: draw.seedHex,
      broadcastAt: draw.broadcastAt?.toISOString() ?? null,
      order: (JSON.parse(draw.orderJson) as string[]).map((t) => ({
        ticket: t,
        playerName: byTicket.get(t)?.playerName ?? '',
      })),
      winners: rows
        .filter((w) => w.status === 'active')
        .map((w) => ({
          place: w.place,
          ticket: w.ticket,
          playerName: w.playerName,
          prizeName: w.prizeName,
          imageFile: w.prizeImage,
        })),
      disqualified: rows
        .filter((w) => w.status === 'disqualified')
        .map((w) => ({
          place: w.place,
          ticket: w.ticket,
          playerName: w.playerName,
          prizeName: w.prizeName,
        })),
    };
  }
}
