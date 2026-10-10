import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsStatus, Prisma } from '@prisma/client';
import { escapeToHtml, extractMentions } from '../../common/html.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNewsCommentDto } from './dto/create-news-comment.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { ReactNewsCommentDto } from './dto/react-news-comment.dto';
import { TagsQueryDto } from './dto/tags-query.dto';
import { UpdateNewsCommentDto } from './dto/update-news-comment.dto';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { NEWS_COMMENT_REACTIONS } from './dto/react-news-comment.dto';

const PUBLIC_WHERE: Prisma.NewsWhereInput = { status: NewsStatus.PUBLISHED };

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPublic(query: ListNewsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NewsWhereInput = {
      ...PUBLIC_WHERE,
      ...(query.category ? { category: query.category } : {}),
      ...(query.tag ? { tags: { some: { tag: query.tag } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.news.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async featured() {
    return this.prisma.news.findMany({
      where: { ...PUBLIC_WHERE, isFeatured: true },
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    });
  }

  async latest(limit: number) {
    return this.prisma.news.findMany({
      where: PUBLIC_WHERE,
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  /// "Популярные" — по количеству просмотров за всё время (viewsCount),
  /// не ограничено временным окном — в схеме нет отдельной агрегации
  /// просмотров по периоду, пересмотр метрики — PHASE 34 (Performance).
  async popular() {
    return this.prisma.news.findMany({
      where: PUBLIC_WHERE,
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
      orderBy: { viewsCount: 'desc' },
      take: 10,
    });
  }

  async categories() {
    const rows = await this.prisma.news.groupBy({
      by: ['category'],
      where: PUBLIC_WHERE,
      _count: { category: true },
    });
    return rows.map((r) => ({
      category: r.category,
      count: r._count.category,
    }));
  }

  async tags(query: TagsQueryDto) {
    const rows = await this.prisma.newsTag.groupBy({
      by: ['tag'],
      where: query.search
        ? { tag: { contains: query.search, mode: 'insensitive' } }
        : {},
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: query.limit ?? 30,
    });
    return rows.map((r) => ({ tag: r.tag, count: r._count.tag }));
  }

  async buildRssFeed(): Promise<string> {
    const items = await this.prisma.news.findMany({
      where: PUBLIC_WHERE,
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    const entries = items
      .map(
        (n) => `    <item>
      <title>${escapeXml(n.title)}</title>
      <link>https://twomc.su/news/${n.slug}</link>
      <guid>https://twomc.su/news/${n.slug}</guid>
      <description>${escapeXml(n.excerpt ?? '')}</description>
      <pubDate>${(n.publishedAt ?? n.createdAt).toUTCString()}</pubDate>
    </item>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>twomc.su — новости</title>
    <link>https://twomc.su/news</link>
    <description>Новости twomc.su</description>
${entries}
  </channel>
</rss>`;
  }

  async getBySlug(slug: string, viewerId: string | null) {
    const news = await this.prisma.news.findUnique({
      where: { slug },
      include: { author: { select: PUBLIC_USER_SELECT }, tags: true },
    });
    if (!news || news.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException('Новость не найдена');
    }

    await this.prisma.$transaction([
      this.prisma.newsView.create({
        data: { newsId: news.id, userId: viewerId },
      }),
      this.prisma.news.update({
        where: { id: news.id },
        data: { viewsCount: { increment: 1 } },
      }),
    ]);

    const liked = viewerId
      ? (await this.prisma.newsLike.findUnique({
          where: { newsId_userId: { newsId: news.id, userId: viewerId } },
        })) !== null
      : false;

    return { ...news, viewsCount: news.viewsCount + 1, liked };
  }

  private async requirePublished(newsId: string) {
    const news = await this.prisma.news.findUnique({ where: { id: newsId } });
    if (!news || news.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException('Новость не найдена');
    }
    return news;
  }

  async like(userId: string, newsId: string) {
    const news = await this.requirePublished(newsId);
    const existing = await this.prisma.newsLike.findUnique({
      where: { newsId_userId: { newsId, userId } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.newsLike.delete({ where: { id: existing.id } }),
        this.prisma.news.update({
          where: { id: newsId },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);
      return { liked: false };
    }

    await this.prisma.$transaction([
      this.prisma.newsLike.create({ data: { newsId, userId } }),
      this.prisma.news.update({
        where: { id: newsId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    if (news.authorId !== userId) {
      const liker = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (liker) {
        await this.notifications.create({
          userId: news.authorId,
          type: 'NEWS_LIKED',
          title: `${liker.username} оценил(а) вашу новость «${news.title}»`,
          link: `/news/${news.slug}`,
          fromUserId: liker.id,
        });
      }
    }

    return { liked: true };
  }

  /// Комментарии — только у опубликованной новости (черновик — 404, ADR-0117).
  /// Реакции — счётчики по набору и своя (без userId реагировавших), права
  /// зрителя на правку и удаление.
  async listComments(
    slug: string,
    page: number,
    limit: number,
    viewerId: string | null = null,
  ) {
    const news = await this.prisma.news.findUnique({ where: { slug } });
    if (!news || news.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException('Новость не найдена');
    }
    const where = { newsId: news.id, isDeleted: false };
    const [items, total] = await Promise.all([
      this.prisma.newsComment.findMany({
        where,
        include: { author: { select: PUBLIC_USER_SELECT }, reactions: true },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.newsComment.count({ where }),
    ]);
    return {
      items: items.map((item) => {
        const counts = new Map<string, number>();
        for (const reaction of item.reactions) {
          if (!NEWS_COMMENT_REACTIONS.includes(reaction.emoji as never))
            continue;
          counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
        }
        const mine = viewerId
          ? (item.reactions.find((reaction) => reaction.userId === viewerId)
              ?.emoji ?? null)
          : null;
        return {
          id: item.id,
          parentId: item.parentId,
          content: item.content,
          createdAt: item.createdAt,
          isEdited: item.isEdited,
          isPinned: item.isPinned,
          author: item.author,
          reactions: NEWS_COMMENT_REACTIONS.filter((key) =>
            counts.has(key),
          ).map((key) => ({ key, count: counts.get(key)! })),
          myReaction:
            mine && NEWS_COMMENT_REACTIONS.includes(mine as never)
              ? mine
              : null,
          canEdit: viewerId === item.authorId,
          canDelete: viewerId === item.authorId,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async createComment(userId: string, slug: string, dto: CreateNewsCommentDto) {
    const news = await this.prisma.news.findUnique({ where: { slug } });
    if (!news || news.status !== NewsStatus.PUBLISHED) {
      throw new NotFoundException('Новость не найдена');
    }
    if (!news.allowComments) {
      throw new ForbiddenException('Комментарии к этой новости отключены');
    }

    let parent: { authorId: string } | null = null;
    if (dto.parentId) {
      parent = await this.prisma.newsComment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Родительский комментарий не найден');
      }
    }

    const created = await this.prisma.$transaction([
      this.prisma.newsComment.create({
        data: {
          newsId: news.id,
          authorId: userId,
          content: dto.content,
          contentHtml: escapeToHtml(dto.content),
          parentId: dto.parentId,
        },
        include: { author: { select: PUBLIC_USER_SELECT } },
      }),
      this.prisma.news.update({
        where: { id: news.id },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);
    const comment = created[0];

    await this.notifyCommentParticipants(news, comment, parent, dto.content);

    return comment;
  }

  private async notifyCommentParticipants(
    news: { authorId: string; slug: string; title: string },
    comment: { id: string; authorId: string },
    parent: { authorId: string } | null,
    content: string,
  ): Promise<void> {
    const author = await this.prisma.user.findUnique({
      where: { id: comment.authorId },
    });
    if (!author) {
      return;
    }
    const link = `/news/${news.slug}#comment-${comment.id}`;

    if (parent && parent.authorId !== comment.authorId) {
      const parentAuthor = await this.prisma.user.findUnique({
        where: { id: parent.authorId },
      });
      if (parentAuthor?.notifyOnReply) {
        await this.notifications.create({
          userId: parentAuthor.id,
          type: 'NEWS_COMMENT_REPLY',
          title: `${author.username} ответил(а) на ваш комментарий к новости «${news.title}»`,
          link,
          fromUserId: author.id,
        });
      }
    }

    for (const username of extractMentions(content)) {
      if (username.toLowerCase() === author.username.toLowerCase()) {
        continue;
      }
      const mentioned = await this.prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      if (mentioned?.notifyOnMention) {
        await this.notifications.create({
          userId: mentioned.id,
          type: 'NEWS_COMMENT_MENTION',
          title: `${author.username} упомянул(а) вас в комментарии к новости «${news.title}»`,
          link,
          fromUserId: author.id,
        });
      }
    }
  }

  async updateComment(
    userId: string,
    commentId: string,
    dto: UpdateNewsCommentDto,
  ) {
    const comment = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException(
        'Редактировать можно только свои комментарии',
      );
    }
    return this.prisma.newsComment.update({
      where: { id: commentId },
      data: {
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        isEdited: true,
        editedAt: new Date(),
      },
    });
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Удалить можно только свои комментарии');
    }
    await this.prisma.$transaction([
      this.prisma.newsComment.update({
        where: { id: commentId },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
      }),
      this.prisma.news.update({
        where: { id: comment.newsId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);
  }

  async react(userId: string, commentId: string, dto: ReactNewsCommentDto) {
    const comment = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    // Реакции — только на комментарии опубликованной новости.
    await this.requirePublished(comment.newsId);
    const existing = await this.prisma.newsCommentReaction.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    if (!existing) {
      await this.prisma.newsCommentReaction.create({
        data: { commentId, userId, emoji: dto.emoji },
      });
      return { reacted: true, emoji: dto.emoji };
    }
    if (existing.emoji === dto.emoji) {
      await this.prisma.newsCommentReaction.delete({
        where: { id: existing.id },
      });
      return { reacted: false };
    }
    await this.prisma.newsCommentReaction.update({
      where: { id: existing.id },
      data: { emoji: dto.emoji },
    });
    return { reacted: true, emoji: dto.emoji };
  }
}
