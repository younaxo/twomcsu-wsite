import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionService } from '../permission.service';

/// Применяется после JwtAuthGuard (требует req.user). Пропускает без проверки,
/// если на хендлере/контроллере нет @RequirePermissions — в этом случае доступ
/// регулируется только аутентификацией (JwtAuthGuard/@Public()).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

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
    return true;
  }
}
