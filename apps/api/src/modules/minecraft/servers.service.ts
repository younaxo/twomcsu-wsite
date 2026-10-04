import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerDto } from './dto/create-server.dto';
import { ListServerLogsQueryDto } from './dto/list-server-logs-query.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import {
  MinecraftStatusService,
  ServerStatusSnapshot,
} from './minecraft-status.service';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: MinecraftStatusService,
  ) {}

  async listActive() {
    return this.prisma.server.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async listAllAdmin() {
    return this.prisma.server.findMany({
      include: { category: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  private async requireActiveBySlug(slug: string) {
    const server = await this.prisma.server.findUnique({
      where: { slug },
      include: { category: true },
    });
    if (!server || !server.isActive) {
      throw new NotFoundException('Сервер не найден');
    }
    return server;
  }

  async getBySlug(slug: string) {
    return this.requireActiveBySlug(slug);
  }

  async getStatus(slug: string): Promise<ServerStatusSnapshot> {
    const server = await this.requireActiveBySlug(slug);
    return this.status.fetchAndLog(server.id, server.address, server.port);
  }

  async getPlayers(slug: string): Promise<string[]> {
    const server = await this.requireActiveBySlug(slug);
    return this.status.fetchPlayers(server.address, server.port);
  }

  async getHistory(slug: string, limit = 50) {
    const server = await this.requireActiveBySlug(slug);
    return this.prisma.serverStatusLog.findMany({
      where: { serverId: server.id },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /// Реальный опрос всех активных серверов параллельно — не моковая
  /// агрегация (каждый сервер реально пингуется по SLP).
  async getOverview() {
    const servers = await this.listActive();
    const snapshots = await Promise.all(
      servers.map(async (server) => ({
        server,
        status: await this.status.fetchAndLog(
          server.id,
          server.address,
          server.port,
        ),
      })),
    );
    return {
      totalServers: servers.length,
      onlineServers: snapshots.filter((s) => s.status.online).length,
      totalPlayers: snapshots.reduce((sum, s) => sum + s.status.playerCount, 0),
      servers: snapshots.map((s) => ({
        id: s.server.id,
        slug: s.server.slug,
        name: s.server.name,
        ...s.status,
      })),
    };
  }

  /// Простой HTML-бейдж для встраивания на форумы — реальные данные, без
  /// внешних шаблонизаторов (один маленький фрагмент, не нужна зависимость).
  async widget(slug?: string): Promise<string> {
    const servers = slug
      ? [await this.requireActiveBySlug(slug)]
      : await this.listActive();
    const rows = await Promise.all(
      servers.map(async (server) => {
        const snap = await this.status.fetchAndLog(
          server.id,
          server.address,
          server.port,
        );
        const statusLabel = snap.online
          ? `online (${snap.playerCount}/${snap.maxPlayers})`
          : 'offline';
        return `<div class="twomc-server-widget-row"><strong>${server.name}</strong>: ${statusLabel}</div>`;
      }),
    );
    return `<div class="twomc-server-widget">${rows.join('')}</div>`;
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.serverCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
  }

  async create(dto: CreateServerDto) {
    const existing = await this.prisma.server.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Сервер с таким slug уже существует');
    }
    if (dto.categoryId) {
      await this.requireCategory(dto.categoryId);
    }
    return this.prisma.server.create({
      data: dto,
      include: { category: true },
    });
  }

  private async requireServer(id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Сервер не найден');
    }
    return server;
  }

  async update(id: string, dto: UpdateServerDto) {
    await this.requireServer(id);
    if (dto.categoryId) {
      await this.requireCategory(dto.categoryId);
    }
    return this.prisma.server.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async remove(id: string): Promise<void> {
    await this.requireServer(id);
    await this.prisma.server.delete({ where: { id } });
  }

  async logs(id: string, query: ListServerLogsQueryDto) {
    await this.requireServer(id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await Promise.all([
      this.prisma.serverStatusLog.findMany({
        where: { serverId: id },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serverStatusLog.count({ where: { serverId: id } }),
    ]);
    return { items, total, page, limit };
  }
}
