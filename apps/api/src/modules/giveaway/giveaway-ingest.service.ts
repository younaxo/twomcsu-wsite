import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OCCURRED_MAX_AGE_MS,
  OCCURRED_MAX_FUTURE_MS,
} from './giveaway.constants';
import { GiveawayEvent } from './giveaway-schema';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { floorToMinute } from './giveaway-time';

export interface IngestResult {
  accepted: number;
  rejected: { eventId: string; reason: 'too_old' | 'in_future' }[];
}

/// Приём событий: идемпотентность по (сервер, eventId) для join/quit и по
/// (игрок, минута) для heartbeat. Время вычисляется только из событий,
/// принятых от разрешённого сервера (ключ -> serverId), а не из тела.
@Injectable()
export class GiveawayIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GiveawaySettingsService,
  ) {}

  async ingest(
    serverId: string,
    events: GiveawayEvent[],
    now: Date = new Date(),
  ): Promise<IngestResult> {
    const nowMs = now.getTime();
    const rejected: IngestResult['rejected'] = [];
    const ok: GiveawayEvent[] = [];
    for (const e of events) {
      const t = e.occurredAt.getTime();
      if (t > nowMs + OCCURRED_MAX_FUTURE_MS) {
        rejected.push({ eventId: e.eventId, reason: 'in_future' });
      } else if (t < nowMs - OCCURRED_MAX_AGE_MS) {
        rejected.push({ eventId: e.eventId, reason: 'too_old' });
      } else {
        ok.push(e);
      }
    }
    if (ok.length === 0) return { accepted: 0, rejected };

    const sessions = ok
      .filter((e) => e.type !== 'heartbeat')
      .map((e) => ({
        serverSlug: serverId,
        eventId: e.eventId,
        type: e.type,
        playerUuid: e.playerUuid,
        occurredAt: e.occurredAt,
      }));
    const minuteMap = new Map<string, { playerUuid: string; minute: Date }>();
    for (const e of ok) {
      if (e.type === 'heartbeat' && e.active === true) {
        const minute = floorToMinute(e.occurredAt);
        minuteMap.set(`${e.playerUuid}|${minute.getTime()}`, {
          playerUuid: e.playerUuid,
          minute,
        });
      }
    }
    // Последнее по occurredAt событие игрока задаёт ник.
    const latest = new Map<string, GiveawayEvent>();
    const earliest = new Map<string, Date>();
    for (const e of ok) {
      const l = latest.get(e.playerUuid);
      if (l === undefined || e.occurredAt > l.occurredAt) {
        latest.set(e.playerUuid, e);
      }
      const f = earliest.get(e.playerUuid);
      if (f === undefined || e.occurredAt < f) {
        earliest.set(e.playerUuid, e.occurredAt);
      }
    }

    const ops = [];
    for (const [uuid, e] of latest) {
      ops.push(
        this.prisma.giveawayPlayer.createMany({
          data: [
            {
              playerUuid: uuid,
              lastName: e.playerName,
              firstSeenAt: earliest.get(uuid) as Date,
              lastSeenAt: e.occurredAt,
            },
          ],
          skipDuplicates: true,
        }),
        this.prisma.giveawayPlayer.updateMany({
          where: { playerUuid: uuid, lastSeenAt: { lt: e.occurredAt } },
          data: { lastName: e.playerName, lastSeenAt: e.occurredAt },
        }),
        this.prisma.giveawayPlayer.updateMany({
          where: {
            playerUuid: uuid,
            firstSeenAt: { gt: earliest.get(uuid) as Date },
          },
          data: { firstSeenAt: earliest.get(uuid) as Date },
        }),
      );
    }
    if (sessions.length > 0) {
      ops.push(
        this.prisma.giveawaySessionEvent.createMany({
          data: sessions,
          skipDuplicates: true,
        }),
      );
    }
    if (minuteMap.size > 0) {
      ops.push(
        this.prisma.giveawayMinute.createMany({
          data: [...minuteMap.values()].map((m) => ({
            ...m,
            serverSlug: serverId,
          })),
          skipDuplicates: true,
        }),
      );
    }
    await this.prisma.$transaction(ops);
    return { accepted: ok.length, rejected };
  }

  /// Итог игрока: число минут-корзин в окне [startAt, cutoffAt].
  async getProgress(playerUuid: string) {
    const s = await this.settings.get();
    const minutes = await this.prisma.giveawayMinute.count({
      where: {
        playerUuid: playerUuid.toLowerCase(),
        minute: { gte: s.startAt, lte: s.cutoffAt },
      },
    });
    return {
      ...this.settings.describe(s),
      minutes,
      remainingMinutes: Math.max(0, s.thresholdMinutes - minutes),
      reached: minutes >= s.thresholdMinutes,
    };
  }
}
