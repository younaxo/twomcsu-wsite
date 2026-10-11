import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsStatus, Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListAdminNewsQueryDto } from './dto/list-admin-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

@Injectable()
export class NewsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListAdminNewsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.NewsWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      // Текст новости (до 100 000 символов) в списке не нужен — только в
      // карточке редактирования (ADR-0143).
      this.prisma.news.findMany({
        where,
        omit: { content: true, contentHtml: true },
        include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.news.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async stats() {
    const [
      total,
      published,
      draft,
      scheduled,
      archived,
      totalViews,
      totalLikes,
      totalComments,
    ] = await Promise.all([
      this.prisma.news.count(),
      this.prisma.news.count({ where: { status: NewsStatus.PUBLISHED } }),
      this.prisma.news.count({ where: { status: NewsStatus.DRAFT } }),
      this.prisma.news.count({ where: { status: NewsStatus.SCHEDULED } }),
      this.prisma.news.count({ where: { status: NewsStatus.ARCHIVED } }),
      this.prisma.news.aggregate({ _sum: { viewsCount: true } }),
      this.prisma.news.aggregate({ _sum: { likesCount: true } }),
      this.prisma.news.aggregate({ _sum: { commentsCount: true } }),
    ]);
    return {
      total,
      byStatus: { published, draft, scheduled, archived },
      totalViews: totalViews._sum.viewsCount ?? 0,
      totalLikes: totalLikes._sum.likesCount ?? 0,
      totalComments: totalComments._sum.commentsCount ?? 0,
    };
  }

  async getAdminById(id: string) {
    const news = await this.prisma.news.findUnique({
      where: { id },
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
    });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    return news;
  }

  /// Автопубликация запланированных новостей (ADR-0146): вызывается
  /// NewsScheduler раз в минуту. updateMany атомарен — повтор в нескольких
  /// инстансах API не публикует новость дважды.
  async publishDue(now = new Date()): Promise<number> {
    const { count } = await this.prisma.news.updateMany({
      where: { status: NewsStatus.SCHEDULED, scheduledFor: { lte: now } },
      data: { status: NewsStatus.PUBLISHED, publishedAt: now },
    });
    return count;
  }

  /// Запланировать можно только на будущее — иначе новость не вышла бы
  /// (или вышла бы мгновенно, хотя её «планировали»).
  private assertScheduleInFuture(scheduledFor: Date | null | undefined) {
    if (!scheduledFor || scheduledFor.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Для запланированной новости укажите дату публикации в будущем',
      );
    }
  }

  async create(authorId: string, dto: CreateNewsDto) {
    if (dto.status === NewsStatus.SCHEDULED) {
      this.assertScheduleInFuture(
        dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      );
    }
    const existing = await this.prisma.news.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Новость с таким slug уже существует');
    }
    const status = dto.status ?? NewsStatus.DRAFT;
    const { tags, ...rest } = dto;
    return this.prisma.news
      .create({
        data: {
          ...rest,
          status,
          authorId,
          contentHtml: escapeToHtml(dto.content),
          scheduledFor: dto.scheduledFor
            ? new Date(dto.scheduledFor)
            : undefined,
          publishedAt: status === NewsStatus.PUBLISHED ? new Date() : undefined,
          tags: tags ? { create: tags.map((tag) => ({ tag })) } : undefined,
        },
        include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
      })
      .catch((error: unknown) => {
        // Гонка двух создателей с одним slug — проверка выше прошла у обоих.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Новость с таким slug уже существует');
        }
        throw error;
      });
  }

  async update(id: string, dto: UpdateNewsDto) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }

    const { tags, content, status, scheduledFor, ...rest } = dto;
    const schedulingChanged =
      status === NewsStatus.SCHEDULED || scheduledFor !== undefined;
    if (schedulingChanged && (status ?? news.status) === NewsStatus.SCHEDULED) {
      this.assertScheduleInFuture(
        scheduledFor ? new Date(scheduledFor) : news.scheduledFor,
      );
    }
    const becomingPublished =
      status === NewsStatus.PUBLISHED && news.status !== NewsStatus.PUBLISHED;

    return this.prisma.news.update({
      where: { id },
      data: {
        ...rest,
        ...(content ? { content, contentHtml: escapeToHtml(content) } : {}),
        ...(status ? { status } : {}),
        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor) } : {}),
        ...(becomingPublished ? { publishedAt: new Date() } : {}),
        ...(tags
          ? { tags: { deleteMany: {}, create: tags.map((tag) => ({ tag })) } }
          : {}),
      },
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
    });
  }

  /// "Удаление" новости — архивация (status=ARCHIVED), не hard delete:
  /// соответствует docs/technical/04-API-REFERENCE.md (`news.archive()`).
  async archive(id: string) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    await this.prisma.news.update({
      where: { id },
      data: { status: NewsStatus.ARCHIVED },
    });
  }

  async setPinned(id: string, pinned: boolean) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    return this.prisma.news.update({
      where: { id },
      data: { isPinned: pinned },
    });
  }

  async setFeatured(id: string, featured: boolean) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    return this.prisma.news.update({
      where: { id },
      data: { isFeatured: featured },
    });
  }

  async pinComment(commentId: string, pinned: boolean) {
    const comment = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    return this.prisma.newsComment.update({
      where: { id: commentId },
      data: { isPinned: pinned },
    });
  }

  async moderateDeleteComment(
    moderatorId: string,
    commentId: string,
  ): Promise<void> {
    const comment = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    await this.prisma.$transaction([
      this.prisma.newsComment.update({
        where: { id: commentId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: moderatorId,
        },
      }),
      this.prisma.news.update({
        where: { id: comment.newsId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);
  }
}
