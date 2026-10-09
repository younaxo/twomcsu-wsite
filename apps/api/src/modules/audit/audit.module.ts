import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/// Глобальный модуль audit log (PHASE 22): сервис записи/чтения/ретенции и
/// interceptor, автоматически логирующий все staff-мутации с
/// @RequirePermissions (ADR-0056).
@Global()
@Module({
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
