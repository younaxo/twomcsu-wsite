import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarEventStatus, Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListAdminEventsQueryDto } from './dto/list-admin-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListAdminEventsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.CalendarEventWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        include: {
          createdBy: true,
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async create(createdById: string, dto: CreateEventDto) {
    const existing = await this.prisma.calendarEvent.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Событие с таким slug уже существует');
    }
    return this.prisma.calendarEvent.create({
      data: {
        ...dto,
        createdById,
        descriptionHtml: escapeToHtml(dto.description),
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        registrationDeadline: dto.registrationDeadline
          ? new Date(dto.registrationDeadline)
          : undefined,
      },
      include: { createdBy: true },
    });
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    const { description, startsAt, endsAt, registrationDeadline, ...rest } =
      dto;
    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...rest,
        ...(description
          ? { description, descriptionHtml: escapeToHtml(description) }
          : {}),
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
        ...(registrationDeadline
          ? { registrationDeadline: new Date(registrationDeadline) }
          : {}),
      },
      include: { createdBy: true },
    });

    const scheduleChanged =
      startsAt !== undefined ||
      endsAt !== undefined ||
      dto.location !== undefined;
    if (scheduleChanged && event.status === CalendarEventStatus.PUBLISHED) {
      await this.notifyParticipants(updated.id, updated.title, updated.slug);
    }

    return updated;
  }

  private async notifyParticipants(
    eventId: string,
    title: string,
    slug: string,
  ): Promise<void> {
    const participants = await this.prisma.eventParticipant.findMany({
      where: { eventId, status: { in: ['GOING', 'INTERESTED'] } },
    });
    await Promise.all(
      participants.map((p) =>
        this.notifications.create({
          userId: p.userId,
          type: 'EVENT_UPDATED',
          title: `Событие «${title}» изменилось`,
          link: `/events/${slug}`,
        }),
      ),
    );
  }

  async setStatus(id: string, status: 'PUBLISHED' | 'CANCELLED') {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }
    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: { status },
    });

    if (status === CalendarEventStatus.CANCELLED) {
      await this.notifyParticipants(updated.id, updated.title, updated.slug);
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }
    await this.prisma.calendarEvent.delete({ where: { id } });
  }
}
