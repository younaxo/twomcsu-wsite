import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SnapshotEntry } from './giveaway-draw';
import { GiveawaySettingsService } from './giveaway-settings.service';

export type GiveawayMode = 'live' | 'test';

export interface PlayerProfile {
  playerUuid: string;
  playerName: string | null;
  ticket: string | null;
  totalMinutes: number;
  thresholdMinutes: number;
  days: { day: string; minutes: number }[];
  test: boolean;
}

/// Чтение данных по контексту (ADR-G003 п. 1). Живой режим читает ТОЛЬКО
/// реальные таблицы, тестовый - ТОЛЬКО `giveaway_test_*`; перекрёстных
/// запросов нет. Записи реальных таблиц здесь не выполняются.
@Injectable()
export class GiveawayDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GiveawaySettingsService,
  ) {}

  async tickets(mode: GiveawayMode, q: string, page: number, pageSize: number) {
    const term = q.trim();
    const skip = (page - 1) * pageSize;
    if (mode === 'live') {
      const where =
        term === ''
          ? {}
          : {
              OR: [
                { ticket: { contains: term.toUpperCase() } },
                {
                  playerName: { contains: term, mode: 'insensitive' as const },
                },
              ],
            };
      const [total, rows] = await Promise.all([
        this.prisma.giveawayTicket.count({ where }),
        this.prisma.giveawayTicket.findMany({
          where,
          orderBy: { issuedAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);
      return this.page(rows, page, pageSize, total);
    }
    const where =
      term === ''
        ? {}
        : {
            OR: [
              { ticket: { contains: term.toUpperCase() } },
              { playerName: { contains: term, mode: 'insensitive' as const } },
            ],
          };
    const [total, rows] = await Promise.all([
      this.prisma.giveawayTestTicket.count({ where }),
      this.prisma.giveawayTestTicket.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    return this.page(rows, page, pageSize, total);
  }

  private page(
    rows: {
      ticket: string;
      playerName: string;
      playerUuid: string;
      issuedAt: Date;
    }[],
    page: number,
    pageSize: number,
    total: number,
  ) {
    return {
      items: rows.map((r) => ({
        ticket: r.ticket,
        playerName: r.playerName,
        playerUuid: r.playerUuid,
        issuedAt: r.issuedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  /// Все билеты контекста для снимка.
  async allTickets(mode: GiveawayMode): Promise<SnapshotEntry[]> {
    const rows =
      mode === 'live'
        ? await this.prisma.giveawayTicket.findMany({
            orderBy: { ticket: 'asc' },
          })
        : await this.prisma.giveawayTestTicket.findMany({
            orderBy: { ticket: 'asc' },
          });
    return rows.map((r) => ({
      ticket: r.ticket,
      playerUuid: r.playerUuid,
      playerName: r.playerName,
    }));
  }

  /// Суммарные минуты по UUID: живой режим - корзины приёмника в окне
  /// розыгрыша с разрешённых серверов, тестовый - тестовые начисления.
  async totalMinutes(
    mode: GiveawayMode,
    uuids: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (uuids.length === 0) return out;
    if (mode === 'live') {
      const s = await this.settings.get();
      const groups = await this.prisma.giveawayMinute.groupBy({
        by: ['playerUuid'],
        where: {
          playerUuid: { in: uuids },
          serverSlug: { in: s.allowedServers },
          minute: { gte: s.startAt, lte: s.cutoffAt },
        },
        _count: { _all: true },
      });
      for (const g of groups) out.set(g.playerUuid, g._count._all);
      return out;
    }
    const groups = await this.prisma.giveawayTestTimeGrant.groupBy({
      by: ['playerUuid'],
      where: { playerUuid: { in: uuids } },
      _sum: { minutes: true },
    });
    for (const g of groups) out.set(g.playerUuid, g._sum.minutes ?? 0);
    return out;
  }

  async profile(mode: GiveawayMode, uuid: string): Promise<PlayerProfile> {
    const s = await this.settings.get();
    if (mode === 'live') {
      const [ticket, player, total, days] = await Promise.all([
        this.prisma.giveawayTicket.findUnique({ where: { playerUuid: uuid } }),
        this.prisma.giveawayPlayer.findUnique({ where: { playerUuid: uuid } }),
        this.totalMinutes('live', [uuid]),
        this.prisma.$queryRaw<{ day: string; minutes: number }[]>`
          SELECT to_char(("minute" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS minutes
          FROM giveaway_minutes
          WHERE "playerUuid" = ${uuid}
            AND "serverSlug" = ANY(${s.allowedServers}::text[])
            AND "minute" >= ${s.startAt} AND "minute" <= ${s.cutoffAt}
          GROUP BY 1 ORDER BY 1`,
      ]);
      return {
        playerUuid: uuid,
        playerName: ticket?.playerName ?? player?.lastName ?? null,
        ticket: ticket?.ticket ?? null,
        totalMinutes: total.get(uuid) ?? 0,
        thresholdMinutes: s.thresholdMinutes,
        days: days.map((d) => ({ day: d.day, minutes: Number(d.minutes) })),
        test: false,
      };
    }
    const [ticket, grants] = await Promise.all([
      this.prisma.giveawayTestTicket.findUnique({
        where: { playerUuid: uuid },
      }),
      this.prisma.giveawayTestTimeGrant.findMany({
        where: { playerUuid: uuid },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const byDay = new Map<string, number>();
    let total = 0;
    for (const g of grants) {
      byDay.set(g.day, (byDay.get(g.day) ?? 0) + g.minutes);
      total += g.minutes;
    }
    return {
      playerUuid: uuid,
      playerName:
        ticket?.playerName ?? grants[grants.length - 1]?.playerName ?? null,
      ticket: ticket?.ticket ?? null,
      totalMinutes: total,
      thresholdMinutes: s.thresholdMinutes,
      days: [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, minutes]) => ({ day, minutes })),
      test: true,
    };
  }
}
