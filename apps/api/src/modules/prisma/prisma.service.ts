import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import {
  PrismaTransactionDefaults,
  readPrismaTransactionDefaults,
} from './prisma-tx-options';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  /// Общие maxWait/timeout интерактивных транзакций (ADR-0183); точечные
  /// опции в вызове `$transaction(fn, { ... })` их переопределяют.
  readonly transactionDefaults: PrismaTransactionDefaults;

  constructor(@Optional() config?: ConfigService) {
    const transactionDefaults = readPrismaTransactionDefaults((key) =>
      config ? config.get(key) : process.env[key],
    );
    super({
      // Хеш пароля никогда не попадает в результаты запросов по умолчанию —
      // include: { author: true } и подобные в публичных ответах безопасны.
      // Где hash действительно нужен (login, смена пароля) — omit: { password: false }.
      // Секреты 2FA (ADR-0109) — так же: читаются только TwoFactorService.
      omit: {
        user: {
          password: true,
          twoFactorSecret: true,
          twoFactorPendingSecret: true,
        },
      },
      // Prisma по умолчанию даёт 2 с на старт и 5 с на выполнение транзакции:
      // под нагрузкой (advisory lock, малый пул) это даёт P2028 и 500.
      transactionOptions: transactionDefaults,
      log:
        process.env.PRISMA_DEBUG === 'true'
          ? [
              { emit: 'stdout', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    });
    this.transactionDefaults = transactionDefaults;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(
      `Prisma подключён к базе данных (транзакции: maxWait ${this.transactionDefaults.maxWait} мс, timeout ${this.transactionDefaults.timeout} мс)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
