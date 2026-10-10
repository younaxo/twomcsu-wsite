import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { SITE_MODULE_KEY } from './site-module.decorator';
import { SiteStatusService } from './site-status.service';

export const MAINTENANCE_BYPASS_PERMISSION = 'system.maintenance.bypass';

/// Глобальный guard модулей (ADR-0082): маршрут модуля, выключенного или
/// закрытого техработами, отвечает 503 `{ code: MODULE_DISABLED |
/// MAINTENANCE, module }` — без 500 и без «пустых» ответов. Сотрудники с
/// `system.maintenance.bypass` проходят (глобальные guard'ы срабатывают до
/// JwtAuthGuard, поэтому токен проверяется здесь же). WebSocket не
/// затрагивается — REST-методы тех же модулей закрыты.
@Injectable()
export class SiteModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly status: SiteStatusService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const key = this.reflector.getAllAndOverride<string | null | undefined>(
      SITE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!key) return true;
    const reason = await this.status.unavailable(key);
    if (!reason) return true;
    if (await this.canBypass(context.switchToHttp().getRequest<Request>())) {
      return true;
    }
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: reason,
      module: key,
      message:
        reason === 'MAINTENANCE'
          ? 'Идут технические работы. Раздел скоро заработает.'
          : 'Раздел временно недоступен.',
    });
  }

  private async canBypass(request: Request): Promise<boolean> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return false;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(
        header.slice('Bearer '.length),
      );
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isBanned: true },
      });
      if (!user || user.isBanned) return false;
      return this.permissions.hasPermission(
        payload.sub,
        MAINTENANCE_BYPASS_PERMISSION,
      );
    } catch {
      return false;
    }
  }
}
