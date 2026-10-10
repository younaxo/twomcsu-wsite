import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  Announcement,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANNOUNCEMENT_KINDS,
  AnnouncementKind,
  UpsertAnnouncementDto,
} from './dto/announcement.dto';

type AnnouncementStatus =
  'draft' | 'scheduled' | 'active' | 'expired' | 'unpublished';

/// Старые типы broadcast (info/success/warning/danger) → семантические.
const LEGACY_KIND: Record<string, AnnouncementKind> = {
  success: 'update',
  danger: 'important',
};

const AUDITED_FIELDS = [
  'title',
  'message',
  'type',
  'link',
  'isDismissible',
  'showFrom',
  'showUntil',
  'audience',
  'targetRole',
  'placements',
] as const;

/// Объявления (ADR-0081). Публикация — флаг `isActive` + `publishedAt`;
/// статус вычисляется по окну показа и времени сервера. Рассылка в центр
/// уведомлений — один раз (атомарная отметка `notifiedAt`), когда объявление
/// опубликовано и наступило начало показа: сразу при публикации или фоновым
/// обработчиком (`AnnouncementsScheduler`) для запланированных.
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  static kindOf(type: string): AnnouncementKind {
    return (ANNOUNCEMENT_KINDS as readonly string[]).includes(type)
      ? (type as AnnouncementKind)
      : (LEGACY_KIND[type] ?? 'info');
  }

  static statusOf(row: Announcement, now = new Date()): AnnouncementStatus {
    if (!row.isActive) return row.publishedAt ? 'unpublished' : 'draft';
    if (row.showFrom && row.showFrom > now) return 'scheduled';
    if (row.showUntil && row.showUntil < now) return 'expired';
    return 'active';
  }

  private toAdmin(row: Announcement) {
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      kind: AnnouncementsService.kindOf(row.type),
      link: row.link,
      isDismissible: row.isDismissible,
      showFrom: row.showFrom,
      showUntil: row.showUntil,
      audience: row.audience,
      targetRole: row.targetRole,
      placements: row.placements,
      status: AnnouncementsService.statusOf(row),
      publishedAt: row.publishedAt,
      notifiedAt: row.notifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count(),
    ]);
    return { items: items.map((row) => this.toAdmin(row)), total, page, limit };
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Объявление не найдено');
    return row;
  }

  private async toData(dto: UpsertAnnouncementDto) {
    const showFrom = dto.showFrom ? new Date(dto.showFrom) : null;
    const showUntil = dto.showUntil ? new Date(dto.showUntil) : null;
    if (showFrom && showUntil && showFrom >= showUntil) {
      throw new BadRequestException('Начало показа должно быть раньше конца');
    }
    const audience = dto.audience ?? 'all';
    let targetRole: string | null = null;
    if (audience === 'role') {
      if (!dto.targetRole) throw new BadRequestException('Выберите роль');
      const role = await this.prisma.role.findUnique({
        where: { name: dto.targetRole },
        select: { name: true },
      });
      if (!role) throw new BadRequestException('Роль не найдена');
      targetRole = role.name;
    }
    return {
      title: dto.title.trim(),
      message: dto.message.trim(),
      type: dto.kind,
      link: dto.link?.trim() || null,
      isDismissible: dto.isDismissible ?? true,
      showFrom,
      showUntil,
      audience,
      targetRole,
      placements: dto.placements ?? [],
    };
  }

  /// Разумный diff для аудита: только изменённые поля, даты — ISO.
  private diff(before: Partial<Announcement> | null, after: Announcement) {
    const plain = (value: unknown) =>
      value instanceof Date ? value.toISOString() : value;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of AUDITED_FIELDS) {
      const from = before ? plain(before[key]) : null;
      const to = plain(after[key]);
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[key] =
          key === 'message'
            ? {
                from: typeof from === 'string' ? `${from.length} симв.` : null,
                to: `${(to as string).length} симв.`,
              }
            : { from, to };
      }
    }
    return changes as Prisma.InputJsonValue;
  }

  async create(dto: UpsertAnnouncementDto, actorId: string) {
    const row = await this.prisma.announcement.create({
      data: {
        ...(await this.toData(dto)),
        isActive: false,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'announcements.create',
      targetType: 'Announcement',
      targetId: row.id,
      changes: this.diff(null, row),
    });
    return this.toAdmin(row);
  }

  async update(id: string, dto: UpsertAnnouncementDto, actorId: string) {
    const before = await this.findOrThrow(id);
    const data = await this.toData(dto);
    if (before.isActive && data.placements.length === 0) {
      // Опубликованное объявление без мест показа бессмысленно.
      throw new BadRequestException('Выберите, где показывать объявление');
    }
    const row = await this.prisma.announcement.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
    });
    await this.audit.log({
      actorId,
      action: 'announcements.update',
      targetType: 'Announcement',
      targetId: id,
      changes: this.diff(before, row),
    });
    if (row.isActive) await this.dispatchOne(row.id);
    return this.toAdmin(await this.findOrThrow(id));
  }

  async publish(id: string, actorId: string) {
    const before = await this.findOrThrow(id);
    if (before.placements.length === 0) {
      throw new BadRequestException('Выберите, где показывать объявление');
    }
    if (before.showUntil && before.showUntil < new Date()) {
      throw new BadRequestException('Срок показа уже истёк — измените даты');
    }
    await this.prisma.announcement.update({
      where: { id },
      data: {
        isActive: true,
        publishedAt: before.publishedAt ?? new Date(),
        updatedBy: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'announcements.publish',
      targetType: 'Announcement',
      targetId: id,
      changes: {
        title: before.title,
        placements: before.placements,
        audience: before.audience,
        showFrom: before.showFrom?.toISOString() ?? null,
        showUntil: before.showUntil?.toISOString() ?? null,
      },
    });
    await this.dispatchOne(id);
    return this.toAdmin(await this.findOrThrow(id));
  }

  async unpublish(id: string, actorId: string) {
    const before = await this.findOrThrow(id);
    const row = await this.prisma.announcement.update({
      where: { id },
      data: { isActive: false, updatedBy: actorId },
    });
    await this.audit.log({
      actorId,
      action: 'announcements.unpublish',
      targetType: 'Announcement',
      targetId: id,
      changes: { title: before.title },
    });
    return this.toAdmin(row);
  }

  async remove(id: string, actorId: string) {
    const before = await this.findOrThrow(id);
    if (before.isActive) {
      throw new ConflictException('Сначала снимите объявление с публикации');
    }
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'announcements.delete',
      targetType: 'Announcement',
      targetId: id,
      severity: 'warning',
      changes: {
        title: before.title,
        status: AnnouncementsService.statusOf(before),
      },
    });
    return { id };
  }

  /// Активные объявления места `placement` для зрителя (null — гость).
  async listPublic(placement: 'banner' | 'dashboard', viewerId: string | null) {
    const now = new Date();
    const roles = viewerId
      ? (
          await this.prisma.userRole.findMany({
            where: { userId: viewerId },
            select: { role: { select: { name: true } } },
          })
        ).map((item) => item.role.name)
      : [];
    const audience: Prisma.AnnouncementWhereInput[] = [{ audience: 'all' }];
    if (viewerId) audience.push({ audience: 'users' });
    if (roles.length)
      audience.push({ audience: 'role', targetRole: { in: roles } });
    const rows = await this.prisma.announcement.findMany({
      where: {
        isActive: true,
        placements: { has: placement },
        AND: [
          { OR: [{ showFrom: null }, { showFrom: { lte: now } }] },
          { OR: [{ showUntil: null }, { showUntil: { gte: now } }] },
          { OR: audience },
        ],
      },
      orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
      take: 5,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      kind: AnnouncementsService.kindOf(row.type),
      link: row.link,
      isDismissible: row.isDismissible,
      showUntil: row.showUntil,
    }));
  }

  /// Разослать уведомления по всем наступившим объявлениям (фоновый обработчик).
  async dispatchDue(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.announcement.findMany({
      where: {
        isActive: true,
        notifiedAt: null,
        placements: { has: 'notifications' },
        AND: [
          { OR: [{ showFrom: null }, { showFrom: { lte: now } }] },
          { OR: [{ showUntil: null }, { showUntil: { gte: now } }] },
        ],
      },
      select: { id: true },
      take: 20,
    });
    let sent = 0;
    for (const row of due) {
      sent += await this.dispatchOne(row.id);
    }
    return sent;
  }

  /// Одна рассылка на объявление: атомарный захват `notifiedAt` — повторный
  /// вызов (другой инстанс, повторная публикация) ничего не отправит.
  private async dispatchOne(id: string): Promise<number> {
    const now = new Date();
    const claimed = await this.prisma.announcement.updateMany({
      where: {
        id,
        isActive: true,
        notifiedAt: null,
        placements: { has: 'notifications' },
        OR: [{ showFrom: null }, { showFrom: { lte: now } }],
      },
      data: { notifiedAt: now },
    });
    if (claimed.count === 0) return 0;
    const row = await this.findOrThrow(id);
    const kind = AnnouncementsService.kindOf(row.type);
    const targets = await this.prisma.user.findMany({
      where: {
        accountType: AccountType.DEFAULT,
        isBanned: false,
        ...(row.audience === 'role' && row.targetRole
          ? { roles: { some: { role: { name: row.targetRole } } } }
          : {}),
      },
      select: { id: true },
    });
    let delivered = 0;
    for (const target of targets) {
      const notification = await this.notifications.create({
        userId: target.id,
        type:
          kind === 'maintenance'
            ? NotificationType.MAINTENANCE
            : NotificationType.ANNOUNCEMENT,
        title: row.title,
        message: row.message,
        link: row.link ?? undefined,
        metadata: { announcementId: row.id, kind },
      });
      if (notification) delivered += 1;
    }
    this.logger.log(
      `Объявление ${row.id}: уведомления ${delivered}/${targets.length}`,
    );
    return delivered;
  }
}
