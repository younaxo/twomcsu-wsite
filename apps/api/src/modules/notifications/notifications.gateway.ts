import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/// Namespace только серверный (docs/technical/06-WEBSOCKET.md): клиент не
/// шлёт никаких событий, только получает `notification:new`. Та же модель
/// аутентификации через namespace-middleware, что и в Chat/DirectMessages
/// гейтвеях (PHASE 10/11) — исключает гонку между connection и обработкой
/// события у клиента, который бы подписался раньше завершения handshake.
@WebSocketGateway({ namespace: '/notifications' })
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    server.use((client: Socket, next: (err?: Error) => void) => {
      this.authenticate(client).then(
        () => next(),
        () => next(new Error('Unauthorized')),
      );
    });
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('Токен не передан');
    }
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.isBanned) {
      throw new Error('Аккаунт недоступен');
    }
    client.data.userId = user.id;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      await client.join(userRoom(client.data.userId));
    } catch (err) {
      this.logger.warn(
        `WS /notifications: ошибка подключения — ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO сам удаляет сокет из всех комнат при дисконнекте.
  }

  emitToUser(userId: string, notification: unknown): void {
    this.server.to(userRoom(userId)).emit('notification:new', notification);
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = (
      client.handshake.auth as Record<string, unknown> | undefined
    )?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }
}
