import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TopicVisibility } from '@prisma/client';
import { isAdmin2faDenied } from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListTopicsQueryDto } from './dto/list-topics-query.dto';

const VISIBILITY_PERMISSION: Partial<Record<TopicVisibility, string>> = {
  HELPER_ONLY: 'topics.view.helper',
  MODERATOR_ONLY: 'topics.view.moderator',
  ADMIN_ONLY: 'topics.view.admin',
  OWNER_ONLY: 'topics.view.owner',
};

/// Зритель: id и признак 2FA (из JwtStrategy); null — аноним.
export type TopicViewer = { id: string; twoFactorEnabled?: boolean } | null;

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {}

  async canView(
    visibility: TopicVisibility,
    viewer: TopicViewer,
  ): Promise<boolean> {
    if (visibility === TopicVisibility.PUBLIC) {
      return true;
    }
    if (!viewer) {
      return false;
    }
    if (visibility === TopicVisibility.AUTHENTICATED) {
      return true;
    }
    // ADR-0169 / Q22: право персонала расширяет видимость только при 2FA;
    // без неё — видимость обычного игрока (без 403).
    if (isAdmin2faDenied(viewer, this.config)) {
      return false;
    }
    const permission = VISIBILITY_PERMISSION[visibility];
    return permission
      ? this.permissions.hasPermission(viewer.id, permission)
      : false;
  }

  async listPublic(query: ListTopicsQueryDto, viewer: TopicViewer) {
    const all = await this.prisma.topic.findMany({
      where: {
        isActive: true,
        ...(query.category ? { category: query.category } : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
    });
    const visible = await Promise.all(
      all.map(async (t) =>
        (await this.canView(t.visibility, viewer)) ? t : null,
      ),
    );
    return visible.filter((t) => t !== null);
  }

  async getBySlug(slug: string, viewer: TopicViewer) {
    const topic = await this.prisma.topic.findUnique({ where: { slug } });
    if (!topic || !topic.isActive) {
      throw new NotFoundException('Тема не найдена');
    }
    if (!(await this.canView(topic.visibility, viewer))) {
      throw new NotFoundException('Тема не найдена');
    }
    await this.prisma.topic.update({
      where: { id: topic.id },
      data: { views: { increment: 1 } },
    });
    return { ...topic, views: topic.views + 1 };
  }
}
