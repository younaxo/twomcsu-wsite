import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const cooldownMs = site.cooldownHours * 60 * 60 * 1000;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Параллельные вебхуки одного игрока на один сайт идут по очереди:
        // иначе оба проходят проверку cooldown и награда начисляется дважды
        // (ADR-0121). Блокировка снимается с концом транзакции.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vote:${site.id}:${user.id}`}))`;
        const lastVote = await tx.playerVote.findFirst({
          where: { siteId: site.id, userId: user.id },
          orderBy: { votedAt: 'desc' },
        });
        if (lastVote && Date.now() - lastVote.votedAt.getTime() < cooldownMs) {
          return { accepted: false, reason: 'cooldown' };
        }
        await tx.playerVote.create({
          data: {
            siteId: site.id,
            userId: user.id,
            externalId: dto.externalId,
            rewardCoins: site.rewardCoins,
          },
        });
        await tx.playerStatistics.upsert({
          where: { userId: user.id },
          create: { userId: user.id, coins: site.rewardCoins },
          update: { coins: { increment: site.rewardCoins } },
        });
        return { accepted: true };
      });
    } catch (error) {
      // Повтор того же голоса (externalId уже учтён) — не 500: сайт-рейтинг
      // ретраит не-2xx ответы бесконечно.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('externalId')
      ) {
        return { accepted: false, reason: 'duplicate' };
      }
      throw error;
    }
  }
}
