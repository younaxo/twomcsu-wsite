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
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelIdDto } from './dto/socket/channel-id.dto';
import { EditMessageSocketDto } from './dto/socket/edit-message-socket.dto';
import { MessageIdDto } from './dto/socket/message-id.dto';
import { PinMessageDto } from './dto/socket/pin-message.dto';
import { SendMessageSocketDto } from './dto/socket/send-message-socket.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { MuteUserDto } from './dto/mute-user.dto';
import { ChatService } from './chat.service';
import { ModerationService } from './moderation.service';
import { SiteStatusService } from '../system/site-status.service';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

/// Namespace/события/комнаты соответствуют docs/technical/06-WEBSOCKET.md
/// (раздел `/chat`). Та же модель аутентификации через namespace-middleware,
/// что и в DirectMessagesGateway (PHASE 10) — см. его комментарий и
/// PHASE-10-direct-messages.md про гонку handleConnection/@SubscribeMessage.
///
/// Отличие от старого проекта (29-SECURITY.md S12): join_channel проверяет
/// существование и активность канала (не 404 — событие просто не выполняет
/// join, тихо); chat-бан проверяется один раз на подключении (ChatBan не
/// привязан к каналу — блокирует весь namespace), а не на каждое действие;
/// mute_user/ban_user рассылают только минимальный публичный payload без
/// причины — причина/детали уходят только в личную комнату цели.
@WebSocketGateway({ namespace: '/chat' })
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly chat: ChatService,
    private readonly moderation: ModerationService,
    private readonly status: SiteStatusService,
  ) {}

  /// Модуль «Чат» выключен или идут техработы (ADR-0113) — WS тоже закрыт, как
  /// REST (`SiteModuleGuard`); сотрудники с `system.maintenance.bypass` проходят.
  private async moduleRefusal(userId: string): Promise<string | null> {
    const reason = await this.status.unavailable('chat');
    if (!reason) return null;
    if (
      await this.permissions.hasPermission(userId, 'system.maintenance.bypass')
    ) {
      return null;
    }
    return reason === 'MAINTENANCE'
      ? 'Идут технические работы. Чат скоро заработает.'
      : 'Чат временно недоступен.';
  }

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
    const chatBan = await this.chat.findActiveBan(user.id);
    if (chatBan) {
      throw new Error('Забанен в чате');
    }
    const refusal = await this.moduleRefusal(user.id);
    if (refusal) {
      throw new Error(refusal);
    }
    client.data.userId = user.id;
    client.data.username = user.username;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      await client.join(userRoom(client.data.userId));
    } catch (err) {
      this.logger.warn(
        `WS /chat: ошибка подключения — ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO сам удаляет сокет из всех комнат при дисконнекте; presence
    // (chat:online:{channelId} в Redis) не чистится автоматически для
    // каналов, в которых сокет не вызвал leave_channel — приемлемо для MVP
    // (следующий join/leave восстановит консистентность), полноценный TTL-
    // based presence — возможное улучшение будущей фазы.
  }

  @SubscribeMessage('join_channel')
  async onJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChannelIdDto,
  ): Promise<void> {
    try {
      await this.chat.requireActiveChannel(dto.channelId);
      await client.join(channelRoom(dto.channelId));
      await this.chat.markOnline(dto.channelId, client.data.userId);
      this.server.to(channelRoom(dto.channelId)).emit('user:online', {
        userId: client.data.userId,
        username: client.data.username,
        channelId: dto.channelId,
      });
    } catch {
      // канал не существует/отключён — join молча не выполняется
    }
  }

  @SubscribeMessage('leave_channel')
  async onLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChannelIdDto,
  ): Promise<void> {
    // emit до leave: иначе вышедший сокет не попадёт в рассылку по комнате и
    // не получит подтверждение собственного выхода (симметрично join_channel,
    // где join выполняется до emit, чтобы включить себя в рассылку).
    await this.chat.markOffline(dto.channelId, client.data.userId);
    this.server.to(channelRoom(dto.channelId)).emit('user:offline', {
      userId: client.data.userId,
      username: client.data.username,
      channelId: dto.channelId,
    });
    await client.leave(channelRoom(dto.channelId));
  }

  @SubscribeMessage('send_message')
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageSocketDto,
  ): Promise<{ ok: boolean; message?: unknown; error?: string }> {
    try {
      // Модуль выключили, пока сокет подключён, — отправка тоже закрыта.
      const refusal = await this.moduleRefusal(client.data.userId);
      if (refusal) {
        throw new Error(refusal);
      }
      const message = await this.chat.sendMessage(
        client.data.userId,
        dto.channelId,
        {
          content: dto.content,
          parentId: dto.parentId,
        },
      );
      this.server.to(channelRoom(dto.channelId)).emit('message:new', message);
      return { ok: true, message };
    } catch (err) {
      client.emit('error', {
        event: 'send_message',
        message: (err as Error).message,
      });
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('edit_message')
  async onEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: EditMessageSocketDto,
  ): Promise<void> {
    try {
      const message = await this.chat.editMessage(
        client.data.userId,
        dto.messageId,
        {
          content: dto.content,
        },
      );
      this.server
        .to(channelRoom(message.channelId))
        .emit('message:edited', message);
    } catch (err) {
      client.emit('error', {
        event: 'edit_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('delete_message')
  async onDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MessageIdDto,
  ): Promise<void> {
    try {
      const message = await this.chat.deleteMessage(
        client.data.userId,
        dto.messageId,
      );
      this.server
        .to(channelRoom(message.channelId))
        .emit('message:deleted', message);
    } catch (err) {
      client.emit('error', {
        event: 'delete_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('typing_start')
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChannelIdDto,
  ): Promise<void> {
    client.to(channelRoom(dto.channelId)).emit('user:typing', {
      userId: client.data.userId,
      username: client.data.username,
      channelId: dto.channelId,
    });
  }

  @SubscribeMessage('typing_stop')
  async onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ChannelIdDto,
  ): Promise<void> {
    client.to(channelRoom(dto.channelId)).emit('user:stopped_typing', {
      userId: client.data.userId,
      username: client.data.username,
      channelId: dto.channelId,
    });
  }

  @SubscribeMessage('pin_message')
  async onPinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: PinMessageDto,
  ): Promise<void> {
    try {
      const pinned = !dto.unpin;
      const message = await this.chat.setPinned(
        client.data.userId,
        dto.messageId,
        pinned,
      );
      this.server
        .to(channelRoom(message.channelId))
        .emit(pinned ? 'message:pinned' : 'message:unpinned', message);
    } catch (err) {
      client.emit('error', {
        event: 'pin_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('mute_user')
  async onMuteUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MuteUserDto,
  ): Promise<void> {
    try {
      const allowed = await this.permissions.hasPermission(
        client.data.userId,
        'chat.mutes.create',
      );
      if (!allowed) {
        throw new Error('Недостаточно прав для выдачи мута');
      }
      const mute = await this.moderation.muteUser(client.data.userId, dto);

      this.server.to(userRoom(dto.userId)).emit('user:muted', mute);
      const publicPayload = {
        userId: dto.userId,
        channelId: dto.channelId ?? null,
      };
      if (dto.channelId) {
        this.server
          .to(channelRoom(dto.channelId))
          .emit('user:muted', publicPayload);
      } else {
        this.server.emit('user:muted', publicPayload);
      }
    } catch (err) {
      client.emit('error', {
        event: 'mute_user',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('ban_user')
  async onBanUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: BanUserDto,
  ): Promise<void> {
    try {
      const allowed = await this.permissions.hasPermission(
        client.data.userId,
        'chat.bans.create',
      );
      if (!allowed) {
        throw new Error('Недостаточно прав для бана в чате');
      }
      const ban = await this.moderation.banUser(client.data.userId, dto);

      this.server.to(userRoom(dto.userId)).emit('user:banned', ban);
      this.server.emit('user:banned', { userId: dto.userId });
      this.server.in(userRoom(dto.userId)).disconnectSockets(true);
    } catch (err) {
      client.emit('error', {
        event: 'ban_user',
        message: (err as Error).message,
      });
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
