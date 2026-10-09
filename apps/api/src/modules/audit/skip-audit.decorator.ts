import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/// Отключает автоматическую запись AuditInterceptor для хендлера, который
/// пишет audit сам (с обогащённым payload — diff настроек, запись на каждую
/// цель bulk-операции и т.п.). Без декоратора каждая staff-мутация с
/// @RequirePermissions логируется автоматически (PHASE 22, ADR-0056).
export const SkipAudit = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SKIP_AUDIT_KEY, true);
