import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GIVEAWAY_CONFIG, GiveawayConfig } from './giveaway.config';
import { GIVEAWAY_TIMEZONE, SERVER_ID_PATTERN } from './giveaway.constants';
import { formatMsk } from './giveaway-time';

export interface GiveawaySettingsValue {
  thresholdMinutes: number;
  /// UTC.
  startAt: Date;
  cutoffAt: Date;
  timezone: string;
  allowedServers: string[];
}

export interface GiveawaySettingsPatch {
  thresholdMinutes?: number;
  startAt?: Date;
  cutoffAt?: Date;
  allowedServers?: string[];
}

const SETTINGS_ID = 'default';

/// Настройки розыгрыша: строка в БД или значения по умолчанию из окружения
/// (без seed). Админ-интерфейса в фазе 1 нет; `update` - для сервиса и
/// будущей админки. После старта порог можно только понижать (и нельзя
/// сдвигать старт).
@Injectable()
export class GiveawaySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  async get(): Promise<GiveawaySettingsValue> {
    const row = await this.prisma.giveawaySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (row === null) {
      return { ...this.config.defaults, timezone: GIVEAWAY_TIMEZONE };
    }
    return {
      thresholdMinutes: row.thresholdMinutes,
      startAt: row.startAt,
      cutoffAt: row.cutoffAt,
      timezone: row.timezone,
      allowedServers: row.allowedServers,
    };
  }

  /// Атомарно: в транзакции строка настроек блокируется (`SELECT ... FOR
  /// UPDATE`; при отсутствии строки сначала создаётся из значений по
  /// умолчанию), текущие значения читаются уже под блокировкой, правило
  /// «порог только вниз после старта» проверяется по ним. Параллельные
  /// `update` выстраиваются в очередь. Ограничение: правило действует только
  /// для этого метода; прямое изменение env/SQL его обходит (см. ADR-G001).
  async update(
    patch: GiveawaySettingsPatch,
    now: Date = new Date(),
  ): Promise<GiveawaySettingsValue> {
    return this.prisma.$transaction(async (tx) => {
      const d = this.config.defaults;
      await tx.giveawaySettings.createMany({
        data: [
          {
            id: SETTINGS_ID,
            thresholdMinutes: d.thresholdMinutes,
            startAt: d.startAt,
            cutoffAt: d.cutoffAt,
            timezone: GIVEAWAY_TIMEZONE,
            allowedServers: d.allowedServers,
          },
        ],
        skipDuplicates: true,
      });
      await tx.$queryRaw`SELECT id FROM giveaway_settings WHERE id = ${SETTINGS_ID} FOR UPDATE`;
      const row = await tx.giveawaySettings.findUniqueOrThrow({
        where: { id: SETTINGS_ID },
      });
      const cur: GiveawaySettingsValue = {
        thresholdMinutes: row.thresholdMinutes,
        startAt: row.startAt,
        cutoffAt: row.cutoffAt,
        timezone: row.timezone,
        allowedServers: row.allowedServers,
      };
      const next: GiveawaySettingsValue = { ...cur, ...stripUndefined(patch) };
      validate(next);
      const started =
        now.getTime() >=
        Math.min(cur.startAt.getTime(), next.startAt.getTime());
      if (started) {
        if (next.thresholdMinutes > cur.thresholdMinutes) {
          throw new BadRequestException(
            'threshold_cannot_increase_after_start',
          );
        }
        if (next.startAt.getTime() !== cur.startAt.getTime()) {
          throw new BadRequestException('start_cannot_change_after_start');
        }
      }
      await tx.giveawaySettings.update({
        where: { id: SETTINGS_ID },
        data: {
          thresholdMinutes: next.thresholdMinutes,
          startAt: next.startAt,
          cutoffAt: next.cutoffAt,
          allowedServers: next.allowedServers,
        },
      });
      return next;
    });
  }

  async isServerAllowed(serverId: string): Promise<boolean> {
    return (await this.get()).allowedServers.includes(serverId);
  }

  /// Подписи для показа игрокам: даты только «по МСК».
  describe(s: GiveawaySettingsValue) {
    return {
      thresholdMinutes: s.thresholdMinutes,
      thresholdHours: s.thresholdMinutes / 60,
      startAtUtc: s.startAt.toISOString(),
      cutoffAtUtc: s.cutoffAt.toISOString(),
      startAtMsk: formatMsk(s.startAt),
      cutoffAtMsk: formatMsk(s.cutoffAt),
    };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function validate(s: GiveawaySettingsValue): void {
  if (!Number.isInteger(s.thresholdMinutes) || s.thresholdMinutes < 1) {
    throw new BadRequestException('threshold_invalid');
  }
  if (s.cutoffAt.getTime() <= s.startAt.getTime()) {
    throw new BadRequestException('window_invalid');
  }
  if (!s.allowedServers.every((x) => SERVER_ID_PATTERN.test(x))) {
    throw new BadRequestException('servers_invalid');
  }
}
