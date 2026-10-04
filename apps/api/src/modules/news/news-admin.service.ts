import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsStatus, Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
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
      this.prisma.news.findMany({
        where,
        include: { author: true, tags: true },
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
      include: { author: true, tags: true },
    });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    return news;
  }

  async create(authorId: string, dto: CreateNewsDto) {
    const existing = await this.prisma.news.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Новость с таким slug уже существует');
    }
    const status = dto.status ?? NewsStatus.DRAFT;
    const { tags, ...rest } = dto;
    return this.prisma.news.create({
      data: {
        ...rest,
        status,
        authorId,
        contentHtml: escapeToHtml(dto.content),
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        publishedAt: status === NewsStatus.PUBLISHED ? new Date() : undefined,
        tags: tags ? { create: tags.map((tag) => ({ tag })) } : undefined,
      },
      include: { author: true, tags: true },
    });
  }

  async update(id: string, dto: UpdateNewsDto) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }

    const { tags, content, status, scheduledFor, ...rest } = dto;
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
      include: { author: true, tags: true },
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
