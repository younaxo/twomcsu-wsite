import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PLAYER_NAME_PATTERN,
  TEST_MAX_MINUTES_PER_NAME,
  TICKET_MAX_ATTEMPTS,
} from './giveaway.constants';
import { generateTicket } from './giveaway-codes';
import { GiveawayMode } from './giveaway-data.service';
import { badRequest, conflict } from './giveaway-errors';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { GiveawayStreamService } from './giveaway-stream.service';

/// Синтетический UUID теста (ADR-G003 п. 1.6): по нику, формат UUID v4.
export function testUuid(playerName: string): string {
  const h = createHash('sha256')
    .update(playerName.toLowerCase(), 'utf8')
    .digest('hex');
  return `00000000-0000-4000-8000-${h.slice(0, 12)}`;
}

function isUnique(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

function mskDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/// Тестовый режим (ADR-G003 п. 1, 5.11): всё пишется только в `giveaway_test_*`
/// и в итоги с контекстом `test`. Ручное начисление времени в живом режиме
/// отключено (`manual_time_disabled_in_live`): реальные таблицы здесь не
/// пишутся ни при каких аргументах.
@Injectable()
export class GiveawayTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GiveawaySettingsService,
    private readonly stream: GiveawayStreamService,
  ) {}

  async grantTime(
    mode: GiveawayMode,
    playerName: string,
    minutes: number,
    day: string | undefined,
    actor: string,
    now: Date = new Date(),
  ): Promise<{ playerName: string; playerUuid: string; totalMinutes: number }> {
    if (mode !== 'test') throw badRequest('manual_time_disabled_in_live');
    if (!PLAYER_NAME_PATTERN.test(playerName)) throw badRequest('invalid_body');
    const uuid = testUuid(playerName);
    const current = await this.totalFor(uuid);
    if (current + minutes > TEST_MAX_MINUTES_PER_NAME) {
      throw badRequest('too_many_minutes');
    }
    await this.prisma.giveawayTestTimeGrant.create({
      data: {
        playerName,
        playerUuid: uuid,
        day: day ?? mskDay(now),
        minutes,
        createdBy: actor,
      },
    });
    return {
      playerName,
      playerUuid: uuid,
      totalMinutes: current + minutes,
    };
  }

  private async totalFor(uuid: string): Promise<number> {
    const agg = await this.prisma.giveawayTestTimeGrant.aggregate({
      where: { playerUuid: uuid },
      _sum: { minutes: true },
    });
    return agg._sum.minutes ?? 0;
  }

  /// Тестовый билет: нужно не меньше порога минут; повтор возвращает тот же.
  async issueTicket(
    playerName: string,
  ): Promise<{ ticket: string; playerName: string; totalMinutes: number }> {
    if (!PLAYER_NAME_PATTERN.test(playerName)) throw badRequest('invalid_body');
    const uuid = testUuid(playerName);
    const total = await this.totalFor(uuid);
    const existing = await this.prisma.giveawayTestTicket.findUnique({
      where: { playerUuid: uuid },
    });
    if (existing !== null) {
      return { ticket: existing.ticket, playerName, totalMinutes: total };
    }
    const s = await this.settings.get();
    if (total < s.thresholdMinutes) throw conflict('not_enough_time');
    for (let attempt = 0; attempt < TICKET_MAX_ATTEMPTS; attempt++) {
      try {
        const created = await this.prisma.giveawayTestTicket.create({
          data: { ticket: generateTicket(), playerName, playerUuid: uuid },
        });
        return { ticket: created.ticket, playerName, totalMinutes: total };
      } catch (err) {
        if (!isUnique(err)) throw err;
        const raced = await this.prisma.giveawayTestTicket.findUnique({
          where: { playerUuid: uuid },
        });
        if (raced !== null) {
          return { ticket: raced.ticket, playerName, totalMinutes: total };
        }
      }
    }
    throw conflict('ticket_collision');
  }

  /// Создаёт ники `TestNNN` с порогом минут и билетами (быстрая проверка).
  async seed(count: number, actor: string): Promise<{ created: number }> {
    const s = await this.settings.get();
    let created = 0;
    for (let i = 1; i <= count; i++) {
      const name = `Test${String(i).padStart(3, '0')}`;
      const uuid = testUuid(name);
      const has = await this.prisma.giveawayTestTicket.findUnique({
        where: { playerUuid: uuid },
      });
      if (has !== null) continue;
      const total = await this.totalFor(uuid);
      if (total < s.thresholdMinutes) {
        await this.prisma.giveawayTestTimeGrant.create({
          data: {
            playerName: name,
            playerUuid: uuid,
            day: mskDay(new Date()),
            minutes: s.thresholdMinutes - total,
            createdBy: actor,
          },
        });
      }
      await this.issueTicket(name);
      created += 1;
    }
    return { created };
  }

  /// Сброс ТОЛЬКО тестового контекста: тестовые начисления, билеты и
  /// тестовый розыгрыш (победители удаляются каскадом).
  async reset(): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.giveawayDraw.deleteMany({ where: { context: 'test' } }),
      this.prisma.giveawayTestTicket.deleteMany({}),
      this.prisma.giveawayTestTimeGrant.deleteMany({}),
    ]);
    await this.stream.publish('test', 'reset', {});
  }
}
