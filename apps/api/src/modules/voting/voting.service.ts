import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VoteWebhookDto } from './dto/vote-webhook.dto';
import { SlugRateLimiter } from './slug-rate-limiter';
import {
  MAX_SECRET_LENGTH,
  SHA256_PREFIX,
  sha256Hash,
  verifyWebhookSecret,
} from './vote-webhook-secret';

@Injectable()
export class VotingService {
  private readonly slugLimiter = new SlugRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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

  /// Контракт (изменён, ADR-0121 + R180): до проверки секрета все отказы —
  /// единый 401 без деталей (нет/неверный секрет, неизвестный или выключенный
  /// slug, IP вне белого списка); сверх лимита по slug — 429. После валидного
  /// секрета ответ прежний: 200 с { accepted, reason? } (user_not_found,
  /// cooldown, duplicate), чтобы внешний сервис не ретраил бизнес-отказы.
  async processWebhook(
    slug: string,
    dto: VoteWebhookDto,
    clientIp: string | null = null,
  ): Promise<{ accepted: boolean; reason?: string }> {
    if (!this.slugLimiter.allow(slug)) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!this.ipAllowed(clientIp)) {
      throw new UnauthorizedException();
    }
    const secret = dto.secret;
    // Дешёвая проверка до обращения к БД и bcrypt.
    if (
      typeof secret !== 'string' ||
      secret.length === 0 ||
      secret.length > MAX_SECRET_LENGTH
    ) {
      throw new UnauthorizedException();
    }

    const found = await this.prisma.voteSite.findUnique({ where: { slug } });
    const site = found && found.isActive ? found : null;
    const validSecret = await verifyWebhookSecret(
      secret,
      site ? site.webhookSecretHash : null,
      this.config.get<number>('BCRYPT_ROUNDS', 12),
    );
    if (!site || !validSecret) {
      throw new UnauthorizedException();
    }
    // Ленивый переход bcrypt -> sha256 (без миграции схемы); условие по
    // старому хешу не затрёт секрет, ротированный параллельно.
    if (!site.webhookSecretHash.startsWith(SHA256_PREFIX)) {
      await this.prisma.voteSite
        .updateMany({
          where: { id: site.id, webhookSecretHash: site.webhookSecretHash },
          data: { webhookSecretHash: sha256Hash(secret) },
        })
        .catch(() => undefined);
    }

    const { username, externalId } = dto;
    if (
      typeof username !== 'string' ||
      username.length < 1 ||
      username.length > 32 ||
      (externalId !== undefined &&
        externalId !== null &&
        (typeof externalId !== 'string' ||
          externalId.length < 1 ||
          externalId.length > 200))
    ) {
      throw new BadRequestException('Некорректные поля голоса');
    }
    const extId = typeof externalId === 'string' ? externalId : undefined;

    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
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
        // Идемпотентность по externalId: повтор того же голоса — duplicate
        // (раньше внутри cooldown отвечал cooldown). Уникальный индекс
        // (siteId, externalId) закрывает гонку между разными игроками.
        if (extId) {
          const seen = await tx.playerVote.findUnique({
            where: {
              siteId_externalId: { siteId: site.id, externalId: extId },
            },
            select: { id: true },
          });
          if (seen) return { accepted: false, reason: 'duplicate' };
        }
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
            externalId: extId,
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

  /// Белый список выключен (пусто) — пропускает всех. Точное совпадение IP.
  private ipAllowed(clientIp: string | null): boolean {
    const raw = this.config.get<string>('VOTING_WEBHOOK_ALLOWED_IPS', '');
    const allowed = raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');
    if (allowed.length === 0) return true;
    return clientIp !== null && allowed.includes(clientIp);
  }
}
