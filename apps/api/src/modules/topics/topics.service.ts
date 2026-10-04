import { Injectable, NotFoundException } from '@nestjs/common';
import { TopicVisibility } from '@prisma/client';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListTopicsQueryDto } from './dto/list-topics-query.dto';

const VISIBILITY_PERMISSION: Partial<Record<TopicVisibility, string>> = {
  HELPER_ONLY: 'topics.view.helper',
  MODERATOR_ONLY: 'topics.view.moderator',
  ADMIN_ONLY: 'topics.view.admin',
  OWNER_ONLY: 'topics.view.owner',
};

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async canView(
    visibility: TopicVisibility,
    viewerId: string | null,
  ): Promise<boolean> {
    if (visibility === TopicVisibility.PUBLIC) {
      return true;
    }
    if (!viewerId) {
      return false;
    }
    if (visibility === TopicVisibility.AUTHENTICATED) {
      return true;
    }
    const permission = VISIBILITY_PERMISSION[visibility];
    return permission
      ? this.permissions.hasPermission(viewerId, permission)
      : false;
  }

  async listPublic(query: ListTopicsQueryDto, viewerId: string | null) {
    const all = await this.prisma.topic.findMany({
      where: {
        isActive: true,
        ...(query.category ? { category: query.category } : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
    });
    const visible = await Promise.all(
      all.map(async (t) =>
        (await this.canView(t.visibility, viewerId)) ? t : null,
      ),
    );
    return visible.filter((t) => t !== null);
  }

  async getBySlug(slug: string, viewerId: string | null) {
    const topic = await this.prisma.topic.findUnique({ where: { slug } });
    if (!topic || !topic.isActive) {
      throw new NotFoundException('Тема не найдена');
    }
    if (!(await this.canView(topic.visibility, viewerId))) {
      throw new NotFoundException('Тема не найдена');
    }
    await this.prisma.topic.update({
      where: { id: topic.id },
      data: { views: { increment: 1 } },
    });
    return { ...topic, views: topic.views + 1 };
  }
}
