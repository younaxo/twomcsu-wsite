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
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

/// `SiteSettings.requireAdmin2fa` — кэш на 15 с (флаг меняется редко, а guard
/// стоит на каждом запросе персонала).
let requireCache: { value: boolean; until: number } | null = null;

let keyWarned = false;

/// Сбросить предупреждение об отсутствии ключа (в тестах).
export function resetAdmin2faKeyWarning(): void {
  keyWarned = false;
}

/// Сбросить кэш флага (после сохранения настроек и в тестах).
export function resetAdmin2faCache(): void {
  requireCache = null;
}

/// Единая проверка admin-2FA (ADR-0109, ADR-0156) для HTTP-guard, WS-gateway
/// и staff-эндпоинтов без @RequirePermissions. Возвращает true, если действие
/// персонала нужно ОТКЛОНИТЬ (`admin_2fa_required`).
///
/// - Флаг `SiteSettings.requireAdmin2fa` выключен — не отклоняем.
/// - Ключа 2FA (`TWO_FACTOR_ENCRYPTION_KEY` ≥ 32) нет: в production —
///   fail-closed (отклоняем всех: требование включено, выполнить его нельзя);
///   только при явных NODE_ENV=development/test (пустой NODE_ENV = production, ADR-0164) требование не применяется —
///   dev/test без ключа работают как раньше.
/// - Иначе отклоняем пользователя без включённой 2FA.
export async function isAdmin2faDenied(
  user: { twoFactorEnabled?: boolean },
  prisma: PrismaService,
  config: ConfigService,
): Promise<boolean> {
  const key = (
    config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', '') ?? ''
  ).trim();
  const keyMissing = key.length < 32;
  const production = isProductionLike(config.get<string>('NODE_ENV'));
  if (keyMissing && !production) return false;
  const now = Date.now();
  let required: boolean;
  if (requireCache && requireCache.until > now) {
    required = requireCache.value;
  } else {
    const settings = await prisma.siteSettings.findFirst({
      select: { requireAdmin2fa: true },
    });
    required = settings?.requireAdmin2fa ?? false;
    requireCache = { value: required, until: now + 15_000 };
  }
  if (!required) return false;
  if (keyMissing) return true;
  return !user.twoFactorEnabled;
}

export const ADMIN_2FA_REQUIRED_MESSAGE =
  'Для действий администрации включите двухфакторную аутентификацию в «Настройки → Безопасность».';

/// Бросает 403 `admin_2fa_required`, если по правилам выше действие отклоняется.
export async function assertAdmin2fa(
  user: { twoFactorEnabled?: boolean },
  prisma: PrismaService,
  config: ConfigService,
): Promise<void> {
  if (await isAdmin2faDenied(user, prisma, config)) {
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
/// ADR-0109: при включённом `requireAdmin2fa` любое действие по праву
/// (админка, модерация) требует включённой 2FA — 403 `admin_2fa_required`.
/// ADR-0156: без ключа 2FA в production — отказ (fail-closed); вне production
/// требование не применяется (выполнить его нельзя).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
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
    await assertAdmin2fa(request.user, this.prisma, this.config);
    return true;
  }
}
