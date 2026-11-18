import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isProductionLike } from '../../../config/node-env';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

let keyWarned = false;

/// Сбросить предупреждение об отсутствии ключа (в тестах).
export function resetAdmin2faKeyWarning(): void {
  keyWarned = false;
}

/// Единая проверка admin-2FA (ADR-0109, ADR-0156, Q22) для HTTP-guard,
/// WS-gateway и staff-эндпоинтов без @RequirePermissions. Возвращает true,
/// если действие персонала нужно ОТКЛОНИТЬ (`admin_2fa_required`).
/// 2FA персонала обязательна всегда (решение владельца Q22), флага нет.
///
/// - Ключа 2FA (`TWO_FACTOR_ENCRYPTION_KEY` ≥ 32) нет: в production —
///   fail-closed (отклоняем всех: требование есть, выполнить его нельзя);
///   только при явных NODE_ENV=development/test (пустой NODE_ENV = production,
///   ADR-0164) требование не применяется.
/// - Иначе отклоняем пользователя без включённой 2FA.
export function isAdmin2faDenied(
  user: { twoFactorEnabled?: boolean },
  config: ConfigService,
): boolean {
  const key = (
    config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', '') ?? ''
  ).trim();
  if (key.length < 32) {
    return isProductionLike(config.get<string>('NODE_ENV'));
  }
  return !user.twoFactorEnabled;
}

export const ADMIN_2FA_REQUIRED_MESSAGE =
  'Для действий администрации включите двухфакторную аутентификацию в «Настройки → Безопасность».';

/// Бросает 403 `admin_2fa_required`, если по правилам выше действие отклоняется.
export function assertAdmin2fa(
  user: { twoFactorEnabled?: boolean },
  config: ConfigService,
): void {
  if (isAdmin2faDenied(user, config)) {
    throw new ForbiddenException({
      code: 'admin_2fa_required',
      message: ADMIN_2FA_REQUIRED_MESSAGE,
    });
  }
}

/// Применяется после JwtAuthGuard (требует req.user). Пропускает без проверки,
/// если на хендлере/контроллере нет @RequirePermissions — в этом случае доступ
/// регулируется только аутентификацией (JwtAuthGuard/@Public()).
///
/// ADR-0109 / Q22: любое действие по праву (админка, модерация) требует
/// включённой 2FA всегда — 403 `admin_2fa_required`.
/// ADR-0156: без ключа 2FA в production — отказ (fail-closed); вне production
/// требование не применяется (выполнить его нельзя).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {
    this.warnIfKeyMissing();
  }

  /// ADR-0156: без ключа вне production admin-2FA не работает (допустимо только
  /// для dev/test) — один раз предупреждаем при старте.
  private warnIfKeyMissing(): void {
    if (keyWarned) return;
    const key = (
      this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', '') ?? ''
    ).trim();
    if (key.length >= 32) return;
    if (isProductionLike(this.config.get<string>('NODE_ENV'))) return;
    keyWarned = true;
    new Logger(PermissionsGuard.name).warn(
      'TWO_FACTOR_ENCRYPTION_KEY не задан: admin-2FA не работает. Допустимо только вне production; в production NODE_ENV=production обязателен (ADR-0156, ADR-0164).',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const allowed = await this.permissions.hasAllPermissions(
      request.user.id,
      required,
    );
    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав');
    }
    assertAdmin2fa(request.user, this.config);
    return true;
  }
}
