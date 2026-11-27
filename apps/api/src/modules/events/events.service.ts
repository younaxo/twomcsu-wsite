import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CalendarEventStatus,
  CalendarEventVisibility,
  Prisma,
} from '@prisma/client';
import { isAdmin2faDenied } from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventAttendanceDto } from './dto/event-attendance.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { PUBLIC_USER_SELECT } from '../users/public-user';

/// Зритель: id и признак 2FA (из JwtStrategy); null — аноним.
export type EventViewer = { id: string; twoFactorEnabled?: boolean } | null;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {}

  /// ADR-0169 / Q22: право персонала расширяет видимость только при 2FA.
  /// Чтение без 2FA — видимость обычного игрока (без 403).
  private async hasStaffView(viewer: EventViewer): Promise<boolean> {
    if (!viewer || isAdmin2faDenied(viewer, this.config)) {
      return false;
    }
    return this.permissions.hasPermission(viewer.id, 'events.view.staff');
  }

  private async canView(
    visibility: CalendarEventVisibility,
    viewer: EventViewer,
  ): Promise<boolean> {
    if (visibility === CalendarEventVisibility.PUBLIC) {
      return true;
    }
    if (!viewer) {
      return false;
    }
    if (visibility === CalendarEventVisibility.AUTHENTICATED) {
      return true;
    }
    return this.hasStaffView(viewer);
  }

  /// Список фильтруется по видимости уже в запросе (PUBLIC+AUTHENTICATED
  /// для любого авторизованного viewer; STAFF добавляется отдельным
  /// запросом, если у viewer есть соответствующее право — дешевле, чем
  /// грузить все STAFF-события и выкидывать их построчно).
  async list(query: ListEventsQueryDto, viewer: EventViewer) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const visibilityIn: CalendarEventVisibility[] = [
      CalendarEventVisibility.PUBLIC,
    ];
    if (viewer) {
      visibilityIn.push(CalendarEventVisibility.AUTHENTICATED);
      if (await this.hasStaffView(viewer)) {
        visibilityIn.push(CalendarEventVisibility.STAFF);
      }
    }
    const where: Prisma.CalendarEventWhereInput = {
      status: CalendarEventStatus.PUBLISHED,
      visibility: { in: visibilityIn },
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        include: {
          createdBy: { select: PUBLIC_USER_SELECT },
          _count: { select: { participants: true } },
        },
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async featured(viewer: EventViewer) {
    const all = await this.prisma.calendarEvent.findMany({
      where: { status: CalendarEventStatus.PUBLISHED, isFeatured: true },
      include: {
        createdBy: { select: PUBLIC_USER_SELECT },
        _count: { select: { participants: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    const visible = await Promise.all(
      all.map(async (e) =>
        (await this.canView(e.visibility, viewer)) ? e : null,
      ),
    );
    return visible.filter((e) => e !== null);
  }

  async mine(userId: string) {
    return this.prisma.calendarEvent.findMany({
      where: {
        OR: [{ createdById: userId }, { participants: { some: { userId } } }],
      },
      include: {
        createdBy: { select: PUBLIC_USER_SELECT },
        participants: { where: { userId } },
        _count: { select: { participants: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async bySlug(slug: string, viewer: EventViewer) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { slug },
      include: {
        createdBy: { select: PUBLIC_USER_SELECT },
        _count: { select: { participants: true } },
      },
    });
    if (!event || event.status !== CalendarEventStatus.PUBLISHED) {
      throw new NotFoundException('Событие не найдено');
    }
    if (!(await this.canView(event.visibility, viewer))) {
      throw new NotFoundException('Событие не найдено');
    }
    const myStatus = viewer
      ? await this.prisma.eventParticipant.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
        })
      : null;
    return { ...event, myStatus: myStatus?.status ?? null };
  }

  private async requireAttendable(eventId: string, viewer: EventViewer) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.status !== CalendarEventStatus.PUBLISHED) {
      throw new NotFoundException('Событие не найдено');
    }
    if (!(await this.canView(event.visibility, viewer))) {
      throw new NotFoundException('Событие не найдено');
    }
    if (event.registrationDeadline && event.registrationDeadline < new Date()) {
      throw new ForbiddenException('Регистрация на событие закрыта');
    }
    return event;
  }

  async attend(
    viewer: NonNullable<EventViewer>,
    eventId: string,
    dto: EventAttendanceDto,
  ) {
    const userId = viewer.id;
    const event = await this.requireAttendable(eventId, viewer);
    // Прошедшее событие (ADR-0118): записаться нельзя, выйти — можно (leave).
    if ((event.endsAt ?? event.startsAt) < new Date()) {
      throw new ForbiddenException('Событие уже прошло');
    }

    const write = (db: Prisma.TransactionClient | PrismaService) =>
      db.eventParticipant.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, status: dto.status },
        update: { status: dto.status },
      });

    if (!event.maxParticipants || dto.status !== 'GOING') {
      return write(this.prisma);
    }

    // Лимит без гонки (J-09-2): строка события блокируется на время
    // транзакции, параллельные записи на то же событие идут по очереди, и
    // подсчёт GOING всегда видит результат предыдущей записи.
    // Лимит, статус и дедлайн берутся из заблокированной строки, а не из
    // объекта, прочитанного до транзакции: админ мог изменить их в промежутке.
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          status: CalendarEventStatus;
          maxParticipants: number | null;
          registrationDeadline: Date | null;
        }[]
      >`SELECT status, "maxParticipants", "registrationDeadline" FROM calendar_events WHERE id = ${eventId} FOR UPDATE`;
      const row = locked[0];
      if (!row || row.status !== CalendarEventStatus.PUBLISHED) {
        throw new NotFoundException('Событие не найдено');
      }
      if (row.registrationDeadline && row.registrationDeadline < new Date()) {
        throw new ForbiddenException('Регистрация на событие закрыта');
      }
      const max = row.maxParticipants;
      const existing = await tx.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (existing?.status === 'GOING') return existing; // идемпотентно
      const goingCount = await tx.eventParticipant.count({
        where: { eventId, status: 'GOING' },
      });
      if (max !== null && goingCount >= max) {
        throw new ConflictException('Достигнут лимит участников события');
      }
      return write(tx);
    });
  }

  async leave(userId: string, eventId: string): Promise<void> {
    await this.prisma.eventParticipant.deleteMany({
      where: { eventId, userId },
    });
  }
}
