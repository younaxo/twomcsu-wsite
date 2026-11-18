import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaExceptionFilter } from '../../common/filters/prisma-exception.filter';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    // Единое отображение P2028/P2024/P2034 в 503 busy (ADR-0183); через
    // APP_FILTER, поэтому действует и в e2e (Test.createTestingModule).
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
