import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { VoteWebhookDto } from './dto/vote-webhook.dto';

@Injectable()
export class VotingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(viewerId: string | null) {
    const sites = await this.prisma.voteSite.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return Promise.all(
      sites.map(async (site) => {
        let nextVoteAt: Date | null = null;
        if (viewerId) {
          const lastVote = await this.prisma.playerVote.findFirst({
            where: { siteId: site.id, userId: viewerId },
            orderBy: { votedAt: 'desc' },
          });
          if (lastVote) {
            nextVoteAt = new Date(
              lastVote.votedAt.getTime() + site.cooldownHours * 60 * 60 * 1000,
            );
          }
        }
        const { webhookSecretHash: _secret, ...rest } = site;
        return {
          ...rest,
          nextVoteAt,
          canVoteNow: viewerId
            ? nextVoteAt
              ? nextVoteAt <= new Date()
              : true
            : null,
        };
      }),
    );
  }

  /// Всегда отвечает 200 с { accepted } — внешние vote-сайты обычно ретраят
  /// агрессивно на не-2xx ответ; причина отказа (неверный секрет/юзер не
  /// найден/cooldown) передаётся в теле, не в статус-коде.
  async processWebhook(
    slug: string,
    dto: VoteWebhookDto,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const site = await this.prisma.voteSite.findUnique({ where: { slug } });
    if (!site || !site.isActive) {
      throw new NotFoundException('Vote-сайт не найден');
    }

    const validSecret = await bcrypt.compare(
      dto.secret,
      site.webhookSecretHash,
    );
    if (!validSecret) {
      return { accepted: false, reason: 'invalid_secret' };
    }

    const user = await this.prisma.user.findFirst({
      where: { username: { equals: dto.username, mode: 'insensitive' } },
    });
    if (!user) {
      return { accepted: false, reason: 'user_not_found' };
    }

    const lastVote = await this.prisma.playerVote.findFirst({
      where: { siteId: site.id, userId: user.id },
      orderBy: { votedAt: 'desc' },
    });
    if (lastVote) {
      const cooldownMs = site.cooldownHours * 60 * 60 * 1000;
      if (Date.now() - lastVote.votedAt.getTime() < cooldownMs) {
        return { accepted: false, reason: 'cooldown' };
      }
    }

    await this.prisma.$transaction([
      this.prisma.playerVote.create({
        data: {
          siteId: site.id,
          userId: user.id,
          externalId: dto.externalId,
          rewardCoins: site.rewardCoins,
        },
      }),
      this.prisma.playerStatistics.upsert({
        where: { userId: user.id },
        create: { userId: user.id, coins: site.rewardCoins },
        update: { coins: { increment: site.rewardCoins } },
      }),
    ]);

    return { accepted: true };
  }
}
