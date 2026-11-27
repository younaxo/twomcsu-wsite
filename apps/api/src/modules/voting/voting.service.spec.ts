import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { VotingService } from './voting.service';
import { sha256Hash } from './vote-webhook-secret';

describe('VotingService.processWebhook (контракт 401)', () => {
  const secret = 's'.repeat(64);
  let siteHash: string;
  let prisma: {
    voteSite: { findUnique: jest.Mock; updateMany: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const make = (env: Record<string, string> = {}) =>
    new VotingService(
      prisma as unknown as PrismaService,
      {
        get: (key: string, def?: unknown) => env[key] ?? def,
      } as unknown as ConfigService,
    );

  beforeAll(async () => {
    siteHash = await bcrypt.hash(secret, 4);
  });

  beforeEach(() => {
    prisma = {
      voteSite: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          slug: 'x',
          isActive: true,
          cooldownHours: 24,
          rewardCoins: 5,
          webhookSecretHash: siteHash,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
  });

  async function failure(p: Promise<unknown>): Promise<UnauthorizedException> {
    const error = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UnauthorizedException);
    return error as UnauthorizedException;
  }

  it('нет секрета, неверный секрет, неизвестный и выключенный slug - одинаковый ответ', async () => {
    const service = make();
    const noSecret = await failure(
      service.processWebhook('x', { username: 'u' }),
    );
    const wrong = await failure(
      service.processWebhook('x', { secret: 'bad', username: 'u' }),
    );
    prisma.voteSite.findUnique.mockResolvedValueOnce(null);
    const unknown = await failure(
      service.processWebhook('nope', { secret, username: 'u' }),
    );
    prisma.voteSite.findUnique.mockResolvedValueOnce({
      id: 's1',
      isActive: false,
      webhookSecretHash: siteHash,
    });
    const inactive = await failure(
      service.processWebhook('x', { secret, username: 'u' }),
    );
    for (const e of [wrong, unknown, inactive]) {
      expect(e.getStatus()).toBe(401);
      expect(e.getResponse()).toEqual(noSecret.getResponse());
    }
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('нет секрета: БД и bcrypt не вызываются (дешёвая проверка)', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    await failure(make().processWebhook('x', { username: 'u' }));
    await failure(make().processWebhook('x', { secret: 5, username: 'u' }));
    await failure(
      make().processWebhook('x', { secret: 'z'.repeat(501), username: 'u' }),
    );
    expect(prisma.voteSite.findUnique).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('неизвестный slug выполняет фиктивное bcrypt-сравнение', async () => {
    prisma.voteSite.findUnique.mockResolvedValue(null);
    const spy = jest.spyOn(bcrypt, 'compare');
    await failure(make().processWebhook('nope', { secret, username: 'u' }));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('user_not_found только после валидного секрета; bcrypt-хеш лениво становится sha256', async () => {
    const result = await make().processWebhook('x', { secret, username: 'u' });
    expect(result).toEqual({ accepted: false, reason: 'user_not_found' });
    expect(prisma.voteSite.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', webhookSecretHash: siteHash },
      data: { webhookSecretHash: sha256Hash(secret) },
    });
  });

  it('sha256-хеш не перезаписывается', async () => {
    prisma.voteSite.findUnique.mockResolvedValue({
      id: 's1',
      isActive: true,
      cooldownHours: 1,
      rewardCoins: 1,
      webhookSecretHash: sha256Hash(secret),
    });
    await make().processWebhook('x', { secret, username: 'u' });
    expect(prisma.voteSite.updateMany).not.toHaveBeenCalled();
  });

  it('некорректный username после валидного секрета - 400, не 401', async () => {
    await expect(
      make().processWebhook('x', { secret, username: 123 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('белый список IP: чужой адрес - тот же 401, свой проходит', async () => {
    const service = make({
      VOTING_WEBHOOK_ALLOWED_IPS: '203.0.113.5, 203.0.113.6',
    });
    await failure(
      service.processWebhook('x', { secret, username: 'u' }, '198.51.100.1'),
    );
    await failure(service.processWebhook('x', { secret, username: 'u' }, null));
    await expect(
      service.processWebhook('x', { secret, username: 'u' }, '203.0.113.6'),
    ).resolves.toEqual({ accepted: false, reason: 'user_not_found' });
  });

  it('лимит по slug: после исчерпания - 429', async () => {
    const service = make();
    let status = 0;
    for (let i = 0; i < 301; i += 1) {
      try {
        await service.processWebhook('x', { username: 'u' });
      } catch (e) {
        status = (e as HttpException).getStatus();
      }
    }
    expect(status).toBe(429);
  });
});
