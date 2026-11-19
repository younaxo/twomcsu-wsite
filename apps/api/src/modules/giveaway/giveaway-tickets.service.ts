import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  REDEEM_PER_SERVER_MIN,
  REDEEM_PER_UUID_MIN,
  TICKET_MAX_ATTEMPTS,
  TRACKING_TOKEN_PATTERN,
} from './giveaway.constants';
import {
  DUMMY_CODE,
  generateTicket,
  generateTrackingToken,
  normalizeCode,
} from './giveaway-codes';
import {
  GiveawayCodesService,
  GiveawayLimitError,
} from './giveaway-codes.service';
import { unavailable } from './giveaway-errors';
import { GiveawayRedisService } from './giveaway-redis.service';
import {
  GiveawaySettingsService,
  GiveawaySettingsValue,
} from './giveaway-settings.service';
import { formatMskShort } from './giveaway-time';
import { RedeemBody } from './giveaway-bodies';

export type RedeemResult =
  | { status: 'issued'; ticket: string; repeat?: true }
  | { status: 'not_started' }
  | { status: 'closed' }
  | {
      status: 'not_enough';
      minutes: number;
      remainingMinutes: number;
      thresholdMinutes: number;
    }
  | { status: 'invalid_code' };

export interface PlayerProgress {
  playerUuid: string;
  minutes: number;
  thresholdMinutes: number;
  remainingMinutes: number;
  percent: number;
  qualified: boolean;
  ticket: string | null;
}

/// Публичные данные страницы отслеживания: без UUID, IP и кода.
export interface TrackedTicket {
  ticket: string;
  playerName: string;
  played: { hours: number; minutes: number };
  status: 'running' | 'finished';
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/// Погашение кода игроком и выдача билета; прогресс для плагина (ADR-G002
/// п. 6-7). Порядок ветвей redeem зафиксирован ADR и тестами.
@Injectable()
export class GiveawayTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: GiveawayRedisService,
    private readonly settings: GiveawaySettingsService,
    private readonly codes: GiveawayCodesService,
  ) {}

  private async countMinutes(
    uuid: string,
    s: GiveawaySettingsValue,
  ): Promise<number> {
    return this.prisma.giveawayMinute.count({
      where: {
        playerUuid: uuid,
        serverSlug: { in: s.allowedServers },
        minute: { gte: s.startAt, lte: s.cutoffAt },
      },
    });
  }

  /// Привязка валидного непогашенного кода к уже выданному билету.
  private async bindCode(
    hash: string,
    ticketId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.giveawayCode.updateMany({
      where: {
        codeHash: hash,
        redeemedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { redeemedAt: now, ticketId },
    });
  }

  async redeem(
    serverId: string,
    body: RedeemBody,
    now: Date = new Date(),
  ): Promise<RedeemResult> {
    // 1. Лимиты: по UUID и по серверу.
    // L3: по очереди; отказ по UUID не расходует лимит сервера.
    const uuidRetry = await this.redis.hit(
      'redeem-uuid',
      body.playerUuid,
      REDEEM_PER_UUID_MIN,
      60,
    );
    if (uuidRetry > 0) throw new GiveawayLimitError('rate_limited', uuidRetry);
    const srvRetry = await this.redis.hit(
      'redeem-srv',
      serverId,
      REDEEM_PER_SERVER_MIN,
      60,
    );
    if (srvRetry > 0) throw new GiveawayLimitError('rate_limited', srvRetry);

    // Хэш считается всегда (в том числе для неверного формата).
    const normalized = normalizeCode(body.code);
    const hash = this.codes.codeHash(normalized ?? DUMMY_CODE);
    const validFormat = normalized !== null;

    // 2. Уже есть билет: вернуть его, при валидном коде привязать код.
    const existing = await this.prisma.giveawayTicket.findUnique({
      where: { playerUuid: body.playerUuid },
    });
    if (existing !== null) return this.repeat(existing, hash, validFormat, now);

    const s = await this.settings.get();
    // 3. Окно выдачи.
    if (now.getTime() < s.startAt.getTime()) return { status: 'not_started' };
    if (now.getTime() > s.cutoffAt.getTime()) return { status: 'closed' };

    // 4. Время меньше порога: код не проверяется.
    const minutes = await this.countMinutes(body.playerUuid, s);
    if (minutes < s.thresholdMinutes) {
      // Код не гасится; на валидном активном коде запоминается последняя
      // попытка для страницы (ответ плагину от этого не зависит).
      await this.prisma.giveawayCode.updateMany({
        where: {
          codeHash: hash,
          redeemedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          lastAttemptAt: now,
          lastAttemptMinutes: minutes,
          lastAttemptThreshold: s.thresholdMinutes,
        },
      });
      return {
        status: 'not_enough',
        minutes,
        remainingMinutes: s.thresholdMinutes - minutes,
        thresholdMinutes: s.thresholdMinutes,
      };
    }

    // 5-6. Код и билет в одной транзакции; повтор при коллизии билета.
    for (let attempt = 0; attempt < TICKET_MAX_ATTEMPTS; attempt++) {
      try {
        const ticket = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.giveawayCode.updateMany({
            where: {
              codeHash: hash,
              redeemedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { redeemedAt: now },
          });
          if (claimed.count === 0 || !validFormat) return null;
          const created = await tx.giveawayTicket.create({
            data: {
              ticket: generateTicket(),
              trackingToken: generateTrackingToken(),
              playerUuid: body.playerUuid,
              playerName: body.playerName,
              issuedAt: now,
            },
          });
          await tx.giveawayCode.updateMany({
            where: { codeHash: hash },
            data: { ticketId: created.id },
          });
          return created;
        });
        if (ticket === null) return { status: 'invalid_code' };
        return { status: 'issued', ticket: ticket.ticket };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Гонка по UUID: билет уже создан параллельным запросом.
        const raced = await this.prisma.giveawayTicket.findUnique({
          where: { playerUuid: body.playerUuid },
        });
        if (raced !== null) return this.repeat(raced, hash, validFormat, now);
        // Иначе коллизия значения билета: новая попытка.
      }
    }
    throw unavailable(undefined, undefined);
  }

  private async repeat(
    existing: { id: string; ticket: string },
    hash: string,
    validFormat: boolean,
    now: Date,
  ): Promise<RedeemResult> {
    if (validFormat) await this.bindCode(hash, existing.id, now);
    return { status: 'issued', ticket: existing.ticket, repeat: true };
  }

  /// Публичное отслеживание по токену; неизвестный или неверный формат -
  /// null (единый 404 в контроллере). Токен нельзя подобрать по номеру и нику.
  async track(
    token: string,
    now: Date = new Date(),
  ): Promise<TrackedTicket | null> {
    if (!TRACKING_TOKEN_PATTERN.test(token)) return null;
    const row = await this.prisma.giveawayTicket.findUnique({
      where: { trackingToken: token },
    });
    if (row === null) return null;
    const s = await this.settings.get();
    const total = await this.countMinutes(row.playerUuid, s);
    return {
      ticket: row.ticket,
      playerName: row.playerName,
      played: { hours: Math.floor(total / 60), minutes: total % 60 },
      status: now.getTime() > s.cutoffAt.getTime() ? 'finished' : 'running',
    };
  }

  /// Пакетный прогресс (п. 6.2): только минуты с разрешённых серверов.
  async progress(uuids: string[]): Promise<{
    thresholdMinutes: number;
    startAt: string;
    cutoffAt: string;
    startText: string;
    cutoffText: string;
    players: PlayerProgress[];
  }> {
    const s = await this.settings.get();
    const [groups, tickets] = await Promise.all([
      this.prisma.giveawayMinute.groupBy({
        by: ['playerUuid'],
        where: {
          playerUuid: { in: uuids },
          serverSlug: { in: s.allowedServers },
          minute: { gte: s.startAt, lte: s.cutoffAt },
        },
        _count: { _all: true },
      }),
      this.prisma.giveawayTicket.findMany({
        where: { playerUuid: { in: uuids } },
      }),
    ]);
    const minutesBy = new Map(groups.map((g) => [g.playerUuid, g._count._all]));
    const ticketBy = new Map(tickets.map((t) => [t.playerUuid, t.ticket]));
    return {
      thresholdMinutes: s.thresholdMinutes,
      startAt: s.startAt.toISOString(),
      cutoffAt: s.cutoffAt.toISOString(),
      startText: formatMskShort(s.startAt),
      cutoffText: formatMskShort(s.cutoffAt),
      players: uuids.map((u) => {
        const minutes = minutesBy.get(u) ?? 0;
        return {
          playerUuid: u,
          minutes,
          thresholdMinutes: s.thresholdMinutes,
          remainingMinutes: Math.max(0, s.thresholdMinutes - minutes),
          percent: Math.min(
            100,
            Math.floor((minutes * 100) / s.thresholdMinutes),
          ),
          qualified: minutes >= s.thresholdMinutes,
          ticket: ticketBy.get(u) ?? null,
        };
      }),
    };
  }
}
