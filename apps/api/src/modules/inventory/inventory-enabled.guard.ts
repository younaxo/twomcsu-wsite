import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/// Fail-closed (ADR-0168, раздел 7.6): без `BRIDGE_ENABLED=true` весь раздел
/// инвентаря отвечает `503 inventory_unavailable`. Пустое и незаданное
/// значение — выключено. Тестового режима нет.
@Injectable()
export class InventoryEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const raw = this.config.get<string | boolean>('BRIDGE_ENABLED');
    const enabled = raw === true || String(raw ?? '').toLowerCase() === 'true';
    if (!enabled) {
      throw new ServiceUnavailableException({
        code: 'inventory_unavailable',
        message: 'Раздел временно недоступен',
      });
    }
    return true;
  }
}
