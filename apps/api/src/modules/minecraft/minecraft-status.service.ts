import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { pingServer, SlpResult } from './slp/slp-client';

export interface ServerStatusSnapshot {
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  motd: string | null;
  ping: number | null;
}

/// Сколько секунд снапшот статуса считается свежим (ADR-0130).
export const STATUS_TTL_SEC = 30;
const statusKey = (serverId: string) => `mc:status:${serverId}`;

/// Server List Ping с коротким кэшем (ADR-0130, пересмотр ADR-0041): раньше
/// каждый запрос статуса (главная опрашивает раз в минуту у каждого
/// посетителя) пинговал сервер и писал строку в ServerStatusLog — нагрузка
/// росла с числом посетителей. Теперь снапшот живёт в Redis 30 с, пинг и
/// строка истории — не чаще раза в окно на сервер. Фоновый сборщик — 8.6.
@Injectable()
export class MinecraftStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async cached(serverId: string): Promise<ServerStatusSnapshot | null> {
    try {
      const raw = await this.redis.client.get(statusKey(serverId));
      return raw ? (JSON.parse(raw) as ServerStatusSnapshot) : null;
    } catch {
      return null;
    }
  }

  /// true — этот запрос первым положил снапшот окна и пишет историю. Redis
  /// недоступен — пишем (как до кэша), статус не ломается.
  private async storeFirst(
    serverId: string,
    snapshot: ServerStatusSnapshot,
  ): Promise<boolean> {
    try {
      const stored = await this.redis.client.set(
        statusKey(serverId),
        JSON.stringify(snapshot),
        'EX',
        STATUS_TTL_SEC,
        'NX',
      );
      return stored === 'OK';
    } catch {
      return true;
    }
  }

  /// Сервер изменили или удалили — следующий запрос пингует заново.
  async invalidate(serverId: string): Promise<void> {
    try {
      await this.redis.client.del(statusKey(serverId));
    } catch {
      // кэш истечёт сам через STATUS_TTL_SEC
    }
  }

  private toSnapshot(result: SlpResult): ServerStatusSnapshot {
    if (!result.online) {
      return {
        online: false,
        playerCount: 0,
        maxPlayers: 0,
        version: null,
        motd: null,
        ping: null,
      };
    }
    return {
      online: true,
      playerCount: result.playerCount,
      maxPlayers: result.maxPlayers,
      version: result.versionName,
      motd: result.motd,
      ping: result.ping,
    };
  }

  async fetchAndLog(
    serverId: string,
    address: string,
    port: number,
  ): Promise<ServerStatusSnapshot> {
    const cached = await this.cached(serverId);
    if (cached) {
      return cached;
    }
    const result = await pingServer(address, port);
    const snapshot = this.toSnapshot(result);
    if (!(await this.storeFirst(serverId, snapshot))) {
      return snapshot;
    }
    await this.prisma.serverStatusLog.create({
      data: {
        serverId,
        online: snapshot.online,
        playerCount: snapshot.playerCount,
        maxPlayers: snapshot.maxPlayers,
        players: result.online ? result.players.map((p) => p.name) : [],
        version: snapshot.version,
        motd: snapshot.motd,
        ping: snapshot.ping,
      },
    });
    return snapshot;
  }

  async fetchPlayers(address: string, port: number): Promise<string[]> {
    const result = await pingServer(address, port);
    return result.online ? result.players.map((p) => p.name) : [];
  }
}
