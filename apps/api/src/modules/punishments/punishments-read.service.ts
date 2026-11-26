import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MyPunishmentAppeal,
  MyPunishmentListResponse,
  PUNISHMENT_KINDS,
  PublicPunishment,
  PublicPunishmentListResponse,
  PublicPunishmentResponse,
  PunishmentKind,
  PunishmentOrder,
  PunishmentResponseMeta,
  PunishmentsAdminStatus,
  StaffPunishmentListResponse,
  StaffPunishmentResponse,
} from './api/punishments-api.types';
import { decodeCursor, encodeCursor, filterHash } from './punishments-cursor';
import {
  punishmentNotFound,
  punishmentsUnavailable,
} from './punishments-errors';
import { PublicPunishmentsCache } from './punishments-public-cache';
import {
  MyPunishmentsQueryDto,
  PublicPunishmentsQueryDto,
  StaffPunishmentsQueryDto,
} from './punishments-query.dto';
import {
  PublicPunishmentSettings,
  PunishmentsSettingsService,
} from './punishments-settings.service';
import {
  ListFilters,
  ListQuerySpec,
  buildListQuery,
  filtersForHash,
} from './punishments-sql';
import { PunishmentsSyncService } from './punishments-sync.service';
import {
  MirrorRow,
  SiteServerRef,
  parseRef,
  toMyPunishment,
  toPublicPunishment,
  toStaffPunishment,
} from './punishments-view';
import { PunishmentsConfig } from './punishments.config';
import {
  PUNISHMENTS_CONFIG,
  PUNISHMENTS_RUNTIME,
  PunishmentsRuntime,
} from './punishments.tokens';

export const PUNISHMENT_SOURCE_NAME = 'litebans';
/// Порог устаревания (контракт 5): 5 минут.
export const PUBLIC_STALE_AFTER_MS = 5 * 60_000;
export const DEFAULT_PUBLIC_LIMIT = 25;
export const DEFAULT_STAFF_LIMIT = 50;
export const MAX_APPEALS_PER_PUNISHMENT = 5;
export const MAX_VERDICT_LENGTH = 1000;

const PUBLIC_KINDS: readonly PunishmentKind[] = ['BAN', 'MUTE'];

/// Слой чтения зеркала наказаний (контракт 2-6). Пишет только аудит просмотра
/// карточки; скрытие выдавшего - в `PunishmentsIssuerHideService`.
@Injectable()
export class PunishmentsReadService {
  readonly cache: PublicPunishmentsCache<
    PublicPunishmentListResponse | PublicPunishmentResponse
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: PunishmentsSettingsService,
    private readonly sync: PunishmentsSyncService,
    @Inject(PUNISHMENTS_CONFIG) private readonly config: PunishmentsConfig,
    @Inject(PUNISHMENTS_RUNTIME) private readonly runtime: PunishmentsRuntime,
  ) {
    this.cache = new PublicPunishmentsCache(() => this.runtime.now());
    // Изменение зеркала (синхронизация) сбрасывает кэш публичного слоя.
    this.sync.onChange(() => this.cache.clear());
  }

  /// Сброс кэша публичного слоя (изменение isHidden и issuerHidden, настроек).
  invalidatePublicCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------- публичные

  async listPublic(
    query: PublicPunishmentsQueryDto,
  ): Promise<PublicPunishmentListResponse> {
    const settings = await this.settings.readPublic();
    const order: PunishmentOrder = query.order ?? 'desc';
    const limit = query.limit ?? DEFAULT_PUBLIC_LIMIT;
    const filters: ListFilters = {
      ...(query.kind ? { kinds: [query.kind] } : {}),
      ...(query.status ? { activity: query.status } : {}),
      ...(query.name ? { namePrefix: query.name } : {}),
    };
    const hash = filterHash(
      'public',
      filtersForHash({ filters, hideSilent: settings.hideSilent }),
    );
    const cursor = query.cursor
      ? decodeCursor(query.cursor, order, hash)
      : null;

    const key = JSON.stringify([
      'list',
      hash,
      order,
      limit,
      query.cursor ?? null,
      settings.fingerprint,
    ]);
    return (await this.cache.getOrLoad(key, async () => {
      const meta = await this.requireAvailability(PUBLIC_KINDS);
      const nowDate = new Date(this.runtime.now());
      const { rows, nextCursor } = await this.fetchPage(
        {
          filters,
          publicOnly: true,
          hideSilent: settings.hideSilent,
          order,
          limit,
          cursor,
          now: nowDate,
        },
        hash,
      );
      const servers = await this.loadServers();
      const ctx = {
        nowMs: nowDate.getTime(),
        servers,
        reasonMap: settings.reasonMap,
      };
      const items = rows
        .map((r) => toPublicPunishment(r, ctx))
        .filter((i): i is PublicPunishment => i !== null);
      return { items, nextCursor, meta };
    })) as PublicPunishmentListResponse;
  }

  async getPublic(ref: string): Promise<PublicPunishmentResponse> {
    const settings = await this.settings.readPublic();
    const parsed = parseRef(ref, true);
    const key = JSON.stringify(['card', ref, settings.fingerprint]);
    return (await this.cache.getOrLoad(key, async () => {
      const meta = await this.requireAvailability(PUBLIC_KINDS);
      if (parsed === null) throw punishmentNotFound();
      const row = await this.findByRef(parsed.kind, parsed.sourceId);
      const servers = await this.loadServers();
      const item =
        row && this.matchesPublicPredicate(row, settings)
          ? toPublicPunishment(row, {
              nowMs: this.runtime.now(),
              servers,
              reasonMap: settings.reasonMap,
            })
          : null;
      if (item === null) throw punishmentNotFound();
      return { item, meta };
    })) as PublicPunishmentResponse;
  }

  /// Те же условия, что `publicOnly` в SQL (карточка читается по ключу);
  /// формат ника и маркер проверяет `toPublicPunishment`.
  private matchesPublicPredicate(
    row: MirrorRow,
    settings: PublicPunishmentSettings,
  ): boolean {
    return (
      (row.kind === 'BAN' || row.kind === 'MUTE') &&
      !row.isHidden &&
      !(settings.hideSilent && row.silent) &&
      !row.ipBan &&
      row.status !== 'DELETED_AT_SOURCE' &&
      row.subjectName !== null &&
      !row.subjectName.includes('[скрыто]')
    );
  }

  // --------------------------------------------------------------- «мои»

  async listMine(
    userId: string,
    query: MyPunishmentsQueryDto,
  ): Promise<MyPunishmentListResponse> {
    const order: PunishmentOrder = query.order ?? 'desc';
    const limit = query.limit ?? DEFAULT_PUBLIC_LIMIT;
    const filters: ListFilters = {
      ...(query.kind ? { kinds: query.kind } : {}),
      ...(query.status ? { activity: query.status } : {}),
    };
    const hash = filterHash(
      'me',
      filtersForHash({ filters, hideSilent: true, mine: true }),
    );
    const cursor = query.cursor
      ? decodeCursor(query.cursor, order, hash)
      : null;

    const uuid = await this.linkedUuid(userId);
    if (uuid === null) {
      return {
        linked: false,
        items: [],
        nextCursor: null,
        meta: {
          generatedAt: new Date(this.runtime.now()).toISOString(),
          stale: false,
        },
      };
    }
    const meta = await this.requireAvailability(PUNISHMENT_KINDS);
    const nowDate = new Date(this.runtime.now());
    const { rows, nextCursor } = await this.fetchPage(
      {
        filters,
        publicOnly: false,
        hideSilent: true,
        mineUuid: uuid,
        order,
        limit,
        cursor,
        now: nowDate,
      },
      hash,
    );
    const servers = await this.loadServers();
    const ctx = { nowMs: nowDate.getTime(), servers };
    const appeals = await this.loadAppeals(
      userId,
      rows.map((r) => r.id),
    );
    return {
      linked: true,
      items: rows
        .map((r) => toMyPunishment(r, ctx, appeals.get(r.id) ?? []))
        .filter((i): i is NonNullable<typeof i> => i !== null),
      nextCursor,
      meta,
    };
  }

  /// Обжалования своих наказаний (l1-02): только обращения автора типа
  /// PUNISHMENT_APPEAL, новые первыми, не более MAX_APPEALS_PER_PUNISHMENT
  /// на наказание. Данные персонала (исполнитель, заметки) не выбираются.
  private async loadAppeals(
    userId: string,
    punishmentIds: string[],
  ): Promise<Map<string, MyPunishmentAppeal[]>> {
    const result = new Map<string, MyPunishmentAppeal[]>();
    if (punishmentIds.length === 0) return result;
    const reports = await this.prisma.report.findMany({
      where: {
        authorId: userId,
        type: 'PUNISHMENT_APPEAL',
        appealedMinecraftPunishmentId: { in: punishmentIds },
      },
      select: {
        appealedMinecraftPunishmentId: true,
        reportNumber: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        verdict: true,
      },
      orderBy: { createdAt: 'desc' },
      take: punishmentIds.length * MAX_APPEALS_PER_PUNISHMENT,
    });
    for (const r of reports) {
      const key = r.appealedMinecraftPunishmentId;
      if (key === null) continue;
      const list = result.get(key) ?? [];
      if (list.length >= MAX_APPEALS_PER_PUNISHMENT) continue;
      list.push({
        reportNumber: r.reportNumber,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        verdict: r.verdict ? r.verdict.slice(0, MAX_VERDICT_LENGTH) : null,
      });
      result.set(key, list);
    }
    return result;
  }

  /// Подтверждённая привязка (ADR-0072). uuid версии 3 (офлайн) - как нет
  /// привязки (fail-closed до ответа владельца про online_mode).
  private async linkedUuid(userId: string): Promise<string | null> {
    const account = await this.prisma.minecraftAccount.findUnique({
      where: { userId },
      select: { uuid: true },
    });
    if (!account) return null;
    const uuid = normalizeAccountUuid(account.uuid);
    if (uuid === null || isOfflineUuid(uuid)) return null;
    return uuid;
  }

  // ------------------------------------------------------------- персонал

  async listStaff(
    query: StaffPunishmentsQueryDto,
  ): Promise<StaffPunishmentListResponse> {
    const order: PunishmentOrder = query.order ?? 'desc';
    const limit = query.limit ?? DEFAULT_STAFF_LIMIT;
    const from = query.from ? parseUtc(query.from, 'from') : undefined;
    const to = query.to ? parseUtc(query.to, 'to') : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(['from must not be later than to']);
    }
    const filters: ListFilters = {
      ...(query.kind ? { kinds: query.kind } : {}),
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.name ? { namePrefix: query.name } : {}),
      ...(query.nameExact ? { nameExact: query.nameExact } : {}),
      ...(query.subjectUuid ? { subjectUuid: query.subjectUuid } : {}),
      ...(query.silent !== undefined ? { silent: query.silent } : {}),
      ...(query.ipBan !== undefined ? { ipBan: query.ipBan } : {}),
      ...(query.hidden !== undefined ? { hidden: query.hidden } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    const hash = filterHash(
      'staff',
      filtersForHash({ filters, hideSilent: false }),
    );
    const cursor = query.cursor
      ? decodeCursor(query.cursor, order, hash)
      : null;
    const meta = await this.requireAvailability(PUNISHMENT_KINDS);
    const nowDate = new Date(this.runtime.now());
    const { rows, nextCursor } = await this.fetchPage(
      {
        filters,
        publicOnly: false,
        hideSilent: false,
        order,
        limit,
        cursor,
        now: nowDate,
      },
      hash,
    );
    return {
      items: rows.map((r) => toStaffPunishment(r, nowDate.getTime())),
      nextCursor,
      meta,
    };
  }

  /// Карточка для персонала. Аудит (`punishment.card.view`) пишется ДО выдачи
  /// ответа; сбой записи - исключение (500 без данных, fail-closed).
  async staffCard(
    actorId: string,
    ref: string,
  ): Promise<StaffPunishmentResponse> {
    const parsed = parseRef(ref, false);
    if (parsed === null) throw punishmentNotFound();
    const meta = await this.requireAvailability(PUNISHMENT_KINDS);
    const row = await this.findByRef(parsed.kind, parsed.sourceId);
    if (!row) throw punishmentNotFound();
    await this.audit.logInTx(this.prisma, {
      actorId,
      action: 'punishment.card.view',
      targetType: 'MinecraftPunishment',
      targetId: row.id,
      changes: { ref, subjectUuid: row.subjectUuid },
      severity: 'info',
    });
    return { item: toStaffPunishment(row, this.runtime.now()), meta };
  }

  /// Карточка после изменения (без аудита просмотра).
  async staffCardOf(row: MirrorRow): Promise<StaffPunishmentResponse> {
    return {
      item: toStaffPunishment(row, this.runtime.now()),
      meta: await this.requireAvailability(PUNISHMENT_KINDS),
    };
  }

  async adminStatus(): Promise<PunishmentsAdminStatus> {
    const states = await this.prisma.punishmentSyncState.findMany({
      where: { source: PUNISHMENT_SOURCE_NAME },
    });
    return {
      enabled: this.config.enabled,
      configured: this.sync.isConfigured,
      kinds: PUNISHMENT_KINDS.map((kind) => {
        const s = states.find((x) => x.kind === kind);
        return {
          kind,
          initialSyncDone: Boolean(s?.initialSyncDoneAt),
          lastSuccessAt: s?.lastSuccessAt
            ? s.lastSuccessAt.toISOString()
            : null,
          consecutiveFailures: s?.consecutiveFailures ?? 0,
          // Только код SOURCE_*: тексты ошибок, хост и учётные данные не отдаются.
          lastErrorCode:
            s?.lastErrorCode && /^SOURCE_[A-Z_]{1,30}$/.test(s.lastErrorCode)
              ? s.lastErrorCode
              : null,
        };
      }),
    };
  }

  // ------------------------------------------------------------- общее

  async findByRef(
    kind: PunishmentKind,
    sourceId: bigint,
  ): Promise<MirrorRow | null> {
    return this.prisma.minecraftPunishment.findUnique({
      where: {
        source_sourceScope_kind_sourceId: {
          source: PUNISHMENT_SOURCE_NAME,
          sourceScope: 'default',
          kind,
          sourceId,
        },
      },
    });
  }

  private async fetchPage(
    spec: ListQuerySpec,
    hash: string,
  ): Promise<{ rows: MirrorRow[]; nextCursor: string | null }> {
    const fetched = await this.prisma.$queryRaw<MirrorRow[]>(
      buildListQuery(spec),
    );
    const hasMore = fetched.length > spec.limit;
    const rows = hasMore ? fetched.slice(0, spec.limit) : fetched;
    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(
            { t: last.startedAt.getTime(), i: last.id },
            spec.order,
            hash,
          )
        : null;
    return { rows, nextCursor };
  }

  private async loadServers(): Promise<SiteServerRef[]> {
    return this.prisma.server.findMany({
      where: { isActive: true },
      select: { slug: true, name: true },
    });
  }

  /// Шаг 6 порядка проверок (контракт 5): у любого нужного вида нет первичной
  /// загрузки - 503. Иначе `meta` с `stale` по единой формуле.
  async requireAvailability(
    kinds: readonly PunishmentKind[],
  ): Promise<PunishmentResponseMeta> {
    const states = await this.prisma.punishmentSyncState.findMany({
      where: { source: PUNISHMENT_SOURCE_NAME, kind: { in: [...kinds] } },
    });
    let oldest: number | null = null;
    for (const kind of kinds) {
      const s = states.find((x) => x.kind === kind);
      if (!s || !s.initialSyncDoneAt) throw punishmentsUnavailable();
      const t = s.lastSuccessAt
        ? s.lastSuccessAt.getTime()
        : Number.NEGATIVE_INFINITY;
      oldest = oldest === null ? t : Math.min(oldest, t);
    }
    const now = this.runtime.now();
    const stale =
      !this.sync.isConfigured ||
      oldest === null ||
      now - oldest > PUBLIC_STALE_AFTER_MS;
    return { generatedAt: new Date(now).toISOString(), stale };
  }
}

/// uuid с дефисами в нижнем регистре; иное - null.
export function normalizeAccountUuid(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(v)) {
    return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    v,
  )
    ? v
    : null;
}

/// Офлайн-uuid (версия 3): первый символ третьей группы равен `3`.
export function isOfflineUuid(uuid: string): boolean {
  const normalized = normalizeAccountUuid(uuid);
  return normalized !== null && normalized.charAt(14) === '3';
}

function parseUtc(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException([
      `${field} must be a valid ISO 8601 UTC date`,
    ]);
  }
  return date;
}
