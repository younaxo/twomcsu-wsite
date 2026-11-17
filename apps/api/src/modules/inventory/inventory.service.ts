import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  InventoryGroupViewDto,
  InventoryMeResponseDto,
  InventoryServerViewDto,
} from './inventory-contract';
import { PrismaService } from '../prisma/prisma.service';
import { noDataGroup, toGroupView } from './inventory-dto';
import { SERVER_SLUG } from './inventory-limits';
import {
  INVENTORY_STORE,
  type InventoryStore,
  type StoredInventoryRow,
} from './inventory.store';

/// Чтение собственного инвентаря (ADR-0168, раздел 5; срез 2).
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_STORE) private readonly store: InventoryStore,
  ) {}

  /// `GET /inventory/me`: по серверам и группам. Нет привязки Minecraft —
  /// `404 not_found`; привязка есть, снимков нет — `state: no_data`.
  /// `server` — необязательный фильтр (`^[a-z0-9-]{1,32}$`, иначе
  /// `422 invalid_param`).
  async getMine(
    userId: string,
    server?: string,
    now: Date = new Date(),
  ): Promise<InventoryMeResponseDto> {
    if (server !== undefined && !SERVER_SLUG.test(server)) {
      throw new UnprocessableEntityException({
        code: 'invalid_param',
        message: 'Недопустимый параметр server',
      });
    }
    const account = await this.prisma.minecraftAccount.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Не найдено',
      });
    }

    const rows = await this.store.listForUser(userId, server);
    const bySlug = new Map<string, StoredInventoryRow[]>();
    for (const row of rows) {
      const list = bySlug.get(row.serverSlug) ?? [];
      list.push(row);
      bySlug.set(row.serverSlug, list);
    }
    if (server !== undefined && !bySlug.has(server)) bySlug.set(server, []);

    const slugs = [...bySlug.keys()].sort();
    const names = await this.serverNames(slugs);
    const servers: InventoryServerViewDto[] = slugs.map((slug) => {
      const list = bySlug.get(slug) ?? [];
      const groups: InventoryGroupViewDto[] = (['main', 'ender'] as const).map(
        (group) => {
          const row = list.find((r) => r.group === group);
          return row ? toGroupView(row, now) : noDataGroup(group);
        },
      );
      return {
        server: { slug, name: names.get(slug) ?? slug },
        groups,
      };
    });
    const hasData = servers.some((s) => s.groups.some((g) => g.state === 'ok'));
    return {
      state: hasData ? 'ok' : 'no_data',
      servers,
      viewer: { relation: 'owner' },
    };
  }

  /// Удаление всех рядов пользователя: вызывается путём отвязки Minecraft
  /// (когда он появится) в той же логической операции, что и удаление
  /// `MinecraftAccount`. При удалении аккаунта работает каскад БД.
  deleteForUser(userId: string): Promise<number> {
    return this.store.deleteForUser(userId);
  }

  /// Название сервера для показа: `Server.name` по `slug` (публичный список
  /// серверов сайта); без совпадения — сам `slug`. Таблицы Bridge-серверов
  /// (`bridge_servers`, этап 03) пока нет.
  private async serverNames(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const servers = await this.prisma.server.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, name: true },
    });
    return new Map(servers.map((s) => [s.slug, s.name]));
  }
}
