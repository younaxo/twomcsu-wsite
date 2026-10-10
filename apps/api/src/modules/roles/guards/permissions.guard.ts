import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

/// `SiteSettings.requireAdmin2fa` — кэш на 15 с (флаг меняется редко, а guard
/// стоит на каждом запросе персонала).
let requireCache: { value: boolean; until: number } | null = null;

/// Сбросить кэш флага (после сохранения настроек и в тестах).
export function resetAdmin2faCache(): void {
  requireCache = null;
}

/// Применяется после JwtAuthGuard (требует req.user). Пропускает без проверки,
/// если на хендлере/контроллере нет @RequirePermissions — в этом случае доступ
/// регулируется только аутентификацией (JwtAuthGuard/@Public()).
///
/// ADR-0109: при включённом `requireAdmin2fa` любое действие по праву
/// (админка, модерация) требует включённой 2FA — 403 `admin_2fa_required`.
/// Без ключа 2FA на сервере требование не применяется: выполнить его нельзя.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async requireAdmin2fa(): Promise<boolean> {
    const key = this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY', '') ?? '';
    if (key.length < 32) return false;
    const now = Date.now();
    if (requireCache && requireCache.until > now) return requireCache.value;
    const settings = await this.prisma.siteSettings.findFirst({
      select: { requireAdmin2fa: true },
    });
    const value = settings?.requireAdmin2fa ?? false;
    requireCache = { value, until: now + 15_000 };
    return value;
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
    if (!request.user.twoFactorEnabled && (await this.requireAdmin2fa())) {
      throw new ForbiddenException({
        code: 'admin_2fa_required',
        message:
          'Для действий администрации включите двухфакторную аутентификацию в «Настройки → Безопасность».',
      });
    }
    return true;
  }
}
