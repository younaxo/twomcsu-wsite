import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pingServer, SlpResult } from './slp/slp-client';

export interface ServerStatusSnapshot {
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  motd: string | null;
  ping: number | null;
}

/// Реальный Server List Ping на каждый запрос — без фонового job/кеша
/// (нет cron-инфраструктуры до PHASE 29); каждый запрос честно отражает
/// текущее состояние сервера и дополнительно пишет строку в
/// ServerStatusLog для истории/графиков.
@Injectable()
export class MinecraftStatusService {
  constructor(private readonly prisma: PrismaService) {}

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
    const result = await pingServer(address, port);
    const snapshot = this.toSnapshot(result);
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
