import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CalendarEventStatus,
  CalendarEventVisibility,
  Prisma,
} from '@prisma/client';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventAttendanceDto } from './dto/event-attendance.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { PUBLIC_USER_SELECT } from '../users/public-user';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  private async canView(
    visibility: CalendarEventVisibility,
    viewerId: string | null,
  ): Promise<boolean> {
    if (visibility === CalendarEventVisibility.PUBLIC) {
      return true;
    }
    if (!viewerId) {
      return false;
    }
    if (visibility === CalendarEventVisibility.AUTHENTICATED) {
      return true;
    }
    return this.permissions.hasPermission(viewerId, 'events.view.staff');
  }

  /// Список фильтруется по видимости уже в запросе (PUBLIC+AUTHENTICATED
  /// для любого авторизованного viewer; STAFF добавляется отдельным
  /// запросом, если у viewer есть соответствующее право — дешевле, чем
  /// грузить все STAFF-события и выкидывать их построчно).
  async list(query: ListEventsQueryDto, viewerId: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const visibilityIn: CalendarEventVisibility[] = [
      CalendarEventVisibility.PUBLIC,
    ];
    if (viewerId) {
      visibilityIn.push(CalendarEventVisibility.AUTHENTICATED);
      if (await this.permissions.hasPermission(viewerId, 'events.view.staff')) {
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

  async featured(viewerId: string | null) {
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
        (await this.canView(e.visibility, viewerId)) ? e : null,
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

  async bySlug(slug: string, viewerId: string | null) {
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
    if (!(await this.canView(event.visibility, viewerId))) {
      throw new NotFoundException('Событие не найдено');
    }
    const myStatus = viewerId
      ? await this.prisma.eventParticipant.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: viewerId } },
        })
      : null;
    return { ...event, myStatus: myStatus?.status ?? null };
  }

  private async requireAttendable(eventId: string, viewerId: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.status !== CalendarEventStatus.PUBLISHED) {
      throw new NotFoundException('Событие не найдено');
    }
    if (!(await this.canView(event.visibility, viewerId))) {
      throw new NotFoundException('Событие не найдено');
    }
    if (event.registrationDeadline && event.registrationDeadline < new Date()) {
      throw new ForbiddenException('Регистрация на событие закрыта');
    }
    return event;
  }

  async attend(userId: string, eventId: string, dto: EventAttendanceDto) {
    const event = await this.requireAttendable(eventId, userId);

    if (event.maxParticipants && dto.status === 'GOING') {
      const existing = await this.prisma.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (!existing || existing.status !== 'GOING') {
        const goingCount = await this.prisma.eventParticipant.count({
          where: { eventId, status: 'GOING' },
        });
        if (goingCount >= event.maxParticipants) {
          throw new ConflictException('Достигнут лимит участников события');
        }
      }
    }

    return this.prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: dto.status },
      update: { status: dto.status },
    });
  }

  async leave(userId: string, eventId: string): Promise<void> {
    await this.prisma.eventParticipant.deleteMany({
      where: { eventId, userId },
    });
  }
}
