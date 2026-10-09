import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Хеш пароля никогда не попадает в результаты запросов по умолчанию —
      // include: { author: true } и подобные в публичных ответах безопасны.
      // Где hash действительно нужен (login, смена пароля) — omit: { password: false }.
      omit: { user: { password: true } },
      log:
        process.env.PRISMA_DEBUG === 'true'
          ? [
              { emit: 'stdout', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma подключён к базе данных');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
