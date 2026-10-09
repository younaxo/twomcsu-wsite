import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SiteSocialLink } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSiteSocialLinkDto,
  SITE_SOCIAL_HOSTS,
  UpdateSiteSocialLinkDto,
} from './dto/site-social-link.dto';

const MAX_LINKS = 30;
const ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.SiteSocialLinkOrderByWithRelationInput[];

/// Соцсети проекта (ADR-0067): CRUD + порядок, audit на каждое изменение.
/// Ссылка проверяется на https и домен выбранной платформы.
@Injectable()
export class SiteSocialLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.siteSocialLink.findMany({ orderBy: ORDER });
  }

  /// Для публичных настроек — только включённые.
  listPublic() {
    return this.prisma.siteSocialLink.findMany({
      where: { isEnabled: true },
      orderBy: ORDER,
      select: { id: true, platform: true, title: true, url: true },
    });
  }

  private assertHost(platform: string, url: string) {
    const hosts =
      SITE_SOCIAL_HOSTS[platform as keyof typeof SITE_SOCIAL_HOSTS] ?? [];
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      throw new BadRequestException('Некорректная ссылка');
    }
    const ok = hosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
    if (!ok) {
      throw new BadRequestException(
        `Ссылка не похожа на ${platform}: ожидается домен ${hosts.join(' / ')}`,
      );
    }
  }

  private async getOrThrow(id: string): Promise<SiteSocialLink> {
    const link = await this.prisma.siteSocialLink.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException('Соцсеть не найдена');
    }
    return link;
  }

  async create(dto: CreateSiteSocialLinkDto, actorId: string) {
    this.assertHost(dto.platform, dto.url);
    if ((await this.prisma.siteSocialLink.count()) >= MAX_LINKS) {
      throw new BadRequestException(`Не больше ${MAX_LINKS} соцсетей`);
    }
    const last = await this.prisma.siteSocialLink.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const link = await this.prisma.siteSocialLink.create({
      data: {
        platform: dto.platform,
        url: dto.url,
        title: dto.title ?? null,
        isEnabled: dto.isEnabled ?? true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.log({
      actorId,
      action: 'settings.social.create',
      targetType: 'SiteSocialLink',
      targetId: link.id,
      changes: {
        platform: link.platform,
        url: link.url,
        isEnabled: link.isEnabled,
      },
    });
    return link;
  }

  async update(id: string, dto: UpdateSiteSocialLinkDto, actorId: string) {
    const current = await this.getOrThrow(id);
    if (dto.platform !== undefined || dto.url !== undefined) {
      this.assertHost(dto.platform ?? current.platform, dto.url ?? current.url);
    }
    const updated = await this.prisma.siteSocialLink.update({
      where: { id },
      data: dto,
    });
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of ['platform', 'url', 'title', 'isEnabled'] as const) {
      if (current[field] !== updated[field]) {
        diff[field] = { from: current[field], to: updated[field] };
      }
    }
    if (Object.keys(diff).length > 0) {
      await this.audit.log({
        actorId,
        action: 'settings.social.update',
        targetType: 'SiteSocialLink',
        targetId: id,
        changes: diff as Prisma.InputJsonValue,
      });
    }
    return updated;
  }

  async remove(id: string, actorId: string) {
    const current = await this.getOrThrow(id);
    await this.prisma.siteSocialLink.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'settings.social.delete',
      targetType: 'SiteSocialLink',
      targetId: id,
      changes: { platform: current.platform, url: current.url },
      severity: 'warning',
    });
    return { success: true };
  }

  /// Новый порядок: `ids` — все ссылки ровно по одному разу; одна транзакция.
  async reorder(ids: string[], actorId: string) {
    const existing = await this.prisma.siteSocialLink.findMany({
      select: { id: true },
    });
    const known = new Set(existing.map((link) => link.id));
    const valid =
      ids.length === known.size &&
      new Set(ids).size === ids.length &&
      ids.every((id) => known.has(id));
    if (!valid) {
      throw new BadRequestException(
        'Порядок должен содержать все соцсети ровно по одному разу',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.siteSocialLink.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.audit.log({
      actorId,
      action: 'settings.social.reorder',
      targetType: 'SiteSocialLink',
      changes: { order: ids },
    });
    return this.list();
  }
}
