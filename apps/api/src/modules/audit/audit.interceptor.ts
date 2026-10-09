import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SENSITIVE_KEYS = /password|secret|token|key$|captcha/i;
const MAX_CHANGES_LENGTH = 4_000;

type Severity = 'info' | 'warning' | 'critical';

/// Уровень по ключу permission: необратимое/безопасность — critical,
/// удаление/бан/права — warning, остальное — info.
export function severityFor(permissionKey: string): Severity {
  if (
    /^permissions\.manage$|^security\.ip_whitelist|^settings\.|^roles\.(delete|assign)$|^users\.delete$/.test(
      permissionKey,
    )
  ) {
    return 'critical';
  }
  if (
    /\.(delete|ban|unban|refund|cancel|hard_delete|reorder)$|^roles\./.test(
      permissionKey,
    )
  ) {
    return 'warning';
  }
  return 'info';
}

/// Тело запроса без секретов и без гигантских полей — только то, что нужно
/// для восстановления «что именно изменили».
export function sanitizeChanges(
  body: unknown,
): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(key)) {
      result[key] = '[скрыто]';
      continue;
    }
    if (typeof value === 'string' && value.length > 500) {
      result[key] = `${value.slice(0, 500)}… (${value.length} символов)`;
      continue;
    }
    result[key] = value;
  }
  const serialized = JSON.stringify(result);
  if (serialized.length > MAX_CHANGES_LENGTH) {
    return { truncated: true, keys: Object.keys(result) };
  }
  return result;
}

/// Целевой объект: id из параметров маршрута, иначе id созданной сущности.
export function resolveTarget(
  params: Record<string, string | undefined>,
  result: unknown,
): { targetType?: string; targetId?: string } {
  const paramId =
    params.userId ??
    params.roleId ??
    params.id ??
    params.username ??
    params.slug;
  if (paramId) {
    return { targetId: paramId };
  }
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === 'string') {
      return { targetId: id };
    }
  }
  return {};
}

/// Глобальный interceptor: каждая успешная staff-мутация (POST/PATCH/PUT/
/// DELETE на хендлере с @RequirePermissions) попадает в audit log —
/// action = ключ permission, target — из параметров/результата, changes —
/// очищенное тело запроса, IP/User-Agent/длительность. Ретроактивно
/// покрывает все домены (ADR-0056); хендлеры с собственным, более богатым
/// логированием помечаются @SkipAudit().
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!MUTATING_METHODS.has(request.method) || !request.user) {
      return next.handle();
    }
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip || !required || required.length === 0) {
      return next.handle();
    }

    const started = Date.now();
    const actorId = request.user.id;
    const action = required[0];
    const changes = sanitizeChanges(request.body);
    const params = request.params as Record<string, string | undefined>;
    const ipAddress = request.ip;
    const userAgent = request.get('user-agent') ?? undefined;

    return next.handle().pipe(
      tap((result) => {
        const target = resolveTarget(params, result);
        // Запись не блокирует ответ; для critical ошибка записи всплывёт в лог.
        void this.audit.log({
          actorId,
          action,
          targetType: action.split('.')[0],
          ...target,
          changes: changes as Prisma.InputJsonValue | undefined,
          ipAddress,
          userAgent,
          severity: severityFor(action),
          duration: Date.now() - started,
        });
      }),
    );
  }
}
