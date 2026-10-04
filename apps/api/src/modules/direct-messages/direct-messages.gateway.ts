import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationIdDto } from './dto/socket/conversation-id.dto';
import { EditMessageSocketDto } from './dto/socket/edit-message-socket.dto';
import { MessageIdDto } from './dto/socket/message-id.dto';
import { ReactMessageSocketDto } from './dto/socket/react-message-socket.dto';
import { SendMessageSocketDto } from './dto/socket/send-message-socket.dto';
import { DirectMessagesService } from './direct-messages.service';

interface AckResponse {
  ok: boolean;
  message?: unknown;
  error?: string;
}

function userRoom(userId: string): string {
  return `messages:user:${userId}`;
}

function conversationRoom(conversationId: string): string {
  return `messages:conversation:${conversationId}`;
}

/// Модель аутентификации соответствует docs/technical/06-WEBSOCKET.md:
/// токен берётся из handshake.auth.token либо заголовка Authorization,
/// проверяется один раз при подключении (истёкший access-token уже
/// открытое соединение не разрывает — переподключение клиент делает сам
/// после обновления токена через REST /auth/refresh).
///
/// Проверка токена вынесена в namespace-middleware (afterInit → server.use),
/// а не в handleConnection: Nest привязывает @SubscribeMessage-обработчики
/// к сокету уже в момент события 'connection', не дожидаясь завершения
/// асинхронного тела handleConnection. Если бы client.data.userId
/// устанавливался только внутри handleConnection, быстрый клиент (подключился
/// и тут же отправил событие) мог бы вызвать обработчик ДО того, как userId
/// успел бы записаться — гонка, пойманная e2e-тестом typing:start. Socket.IO
/// гарантированно прогоняет все middleware (и ждёт их) до события
/// 'connection', поэтому к моменту, когда обработчик события вообще может
/// быть вызван, client.data.userId уже точно установлен.
@WebSocketGateway({ namespace: '/messages' })
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class DirectMessagesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DirectMessagesGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dm: DirectMessagesService,
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

      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId: client.data.userId },
        select: { conversationId: true },
      });
      await Promise.all(
        memberships.map((m) => client.join(conversationRoom(m.conversationId))),
      );
    } catch (err) {
      this.logger.warn(
        `WS /messages: ошибка автоподключения к комнатам — ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO сам удаляет сокет из всех комнат при дисконнекте.
  }

  @SubscribeMessage('conversation:join')
  async onConversationJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ): Promise<void> {
    try {
      await this.dm.requireMember(client.data.userId, dto.conversationId);
      await client.join(conversationRoom(dto.conversationId));
    } catch {
      // не участник беседы — комната не присоединяется молча
    }
  }

  @SubscribeMessage('conversation:leave')
  async onConversationLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ): Promise<void> {
    await client.leave(conversationRoom(dto.conversationId));
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageSocketDto,
  ): Promise<AckResponse> {
    try {
      const message = await this.dm.sendMessage(
        client.data.userId,
        dto.conversationId,
        {
          content: dto.content,
          parentId: dto.parentId,
        },
      );
      this.server
        .to(conversationRoom(dto.conversationId))
        .emit('message:new', message);
      await this.broadcastConversationChanged(dto.conversationId);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:edit')
  async onMessageEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: EditMessageSocketDto,
  ): Promise<void> {
    try {
      const message = await this.dm.editMessage(
        client.data.userId,
        dto.messageId,
        {
          content: dto.content,
        },
      );
      this.server
        .to(conversationRoom(message.conversationId))
        .emit('message:updated', message);
    } catch (err) {
      client.emit('error', {
        event: 'message:edit',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('message:delete')
  async onMessageDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MessageIdDto,
  ): Promise<void> {
    try {
      const message = await this.dm.deleteMessage(
        client.data.userId,
        dto.messageId,
      );
      this.server
        .to(conversationRoom(message.conversationId))
        .emit('message:updated', message);
    } catch (err) {
      client.emit('error', {
        event: 'message:delete',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('message:react')
  async onMessageReact(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ReactMessageSocketDto,
  ): Promise<void> {
    try {
      const result = await this.dm.react(client.data.userId, dto.messageId, {
        emoji: dto.emoji,
      });
      this.server
        .to(conversationRoom(result.conversationId))
        .emit('message:updated', { messageId: dto.messageId, ...result });
    } catch (err) {
      client.emit('error', {
        event: 'message:react',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('conversation:read')
  async onConversationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ): Promise<void> {
    try {
      await this.dm.markRead(client.data.userId, dto.conversationId);
      this.server
        .to(conversationRoom(dto.conversationId))
        .emit('conversation:read', {
          conversationId: dto.conversationId,
          userId: client.data.userId,
          lastReadAt: new Date().toISOString(),
        });
    } catch (err) {
      client.emit('error', {
        event: 'conversation:read',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ): Promise<void> {
    await this.broadcastTyping(client, dto.conversationId, 'typing:start');
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ): Promise<void> {
    await this.broadcastTyping(client, dto.conversationId, 'typing:stop');
  }

  private async broadcastTyping(
    client: Socket,
    conversationId: string,
    event: 'typing:start' | 'typing:stop',
  ): Promise<void> {
    try {
      await this.dm.requireMember(client.data.userId, conversationId);
      client.to(conversationRoom(conversationId)).emit(event, {
        conversationId,
        userId: client.data.userId,
      });
    } catch {
      // не участник беседы — событие молча игнорируется
    }
  }

  private async broadcastConversationChanged(
    conversationId: string,
  ): Promise<void> {
    this.server
      .to(conversationRoom(conversationId))
      .emit('conversation:changed', { conversationId });
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    for (const member of members) {
      this.server
        .to(userRoom(member.userId))
        .emit('conversation:changed', { conversationId });
    }
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
