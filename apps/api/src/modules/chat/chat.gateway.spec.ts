import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PermissionService } from '../roles/permission.service';
import { SiteStatusService } from '../system/site-status.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ModerationService } from './moderation.service';

function build(opts: { twoFactorEnabled: boolean; authorId?: string }) {
  const findFirst = jest.fn();
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ twoFactorEnabled: opts.twoFactorEnabled }),
    },
    siteSettings: { findFirst },
  } as unknown as PrismaService;
  const config = {
    get: (name: string, fallback?: unknown) =>
      name === 'NODE_ENV'
        ? 'production'
        : name === 'TWO_FACTOR_ENCRYPTION_KEY'
          ? 'k'.repeat(32)
          : fallback,
  } as unknown as ConfigService;
  const permissions = {
    hasPermission: jest.fn().mockResolvedValue(true),
  } as unknown as PermissionService;
  const moderation = {
    muteUser: jest.fn().mockResolvedValue({ id: 'm1' }),
    banUser: jest.fn().mockResolvedValue({ id: 'b1' }),
  };
  const chatMessage = {
    findUnique: jest.fn().mockResolvedValue({
      id: 'x',
      authorId: opts.authorId ?? 'someone',
      isDeleted: false,
    }),
    update: jest.fn().mockResolvedValue({ id: 'x', channelId: 'c' }),
  };
  (prisma as unknown as { chatMessage: unknown }).chatMessage = chatMessage;
  const chat = new ChatService(
    prisma,
    {} as never,
    permissions,
    {} as never,
    {} as never,
  ) as unknown as ChatService & { setPinned: jest.Mock };
  chat.setPinned = jest.fn().mockResolvedValue({ id: 'x', channelId: 'c' });
  const chatMessageCreate = jest
    .fn()
    .mockResolvedValue({ id: 'm-new', channelId: 'ro' });
  (chatMessage as Record<string, unknown>).create = chatMessageCreate;
  const guards = chat as unknown as Record<string, jest.Mock>;
  guards.requireActiveChannel = jest
    .fn()
    .mockResolvedValue({ id: 'ro', isActive: true, isReadOnly: true });
  guards.requireNotChatBanned = jest.fn().mockResolvedValue(undefined);
  guards.requireNotMuted = jest.fn().mockResolvedValue(undefined);
  guards.requireNotFlooding = jest.fn().mockResolvedValue(undefined);
  const gateway = new ChatGateway(
    {} as JwtService,
    config,
    prisma,
    permissions,
    chat as unknown as ChatService,
    moderation as unknown as ModerationService,
    {
      unavailable: jest.fn().mockResolvedValue(null),
    } as unknown as SiteStatusService,
    {
      client: {
        multi: () => ({
          set() {
            return this;
          },
          incr() {
            return this;
          },
          exec: () => Promise.resolve([null, [null, 1]]),
        }),
      },
    } as unknown as RedisService,
  );
  const emit = jest.fn();
  const sockets = {
    to: () => ({ emit: jest.fn() }),
    in: () => ({ disconnectSockets: jest.fn() }),
    emit: jest.fn(),
  };
  (gateway as unknown as { server: unknown }).server = sockets;
  const client = {
    data: { userId: 'admin1' },
    emit,
  } as unknown as Socket;
  return {
    gateway,
    client,
    emit,
    moderation,
    chat,
    chatMessage,
    chatMessageCreate,
    findFirst,
  };
}

describe('ChatGateway staff-действия и admin-2FA (ADR-0156)', () => {
  it('mute_user без 2FA — отказ', async () => {
    const { gateway, client, emit, moderation } = build({
      twoFactorEnabled: false,
    });
    await gateway.onMuteUser(client, { userId: 'u2' } as never);
    expect(moderation.muteUser).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'mute_user',
        message: expect.stringContaining('admin_2fa_required'),
      }),
    );
  });

  it('ban_user без 2FA — отказ', async () => {
    const { gateway, client, emit, moderation } = build({
      twoFactorEnabled: false,
    });
    await gateway.onBanUser(client, { userId: 'u2' } as never);
    expect(moderation.banUser).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ event: 'ban_user' }),
    );
  });

  it('pin_message без 2FA — отказ', async () => {
    const { gateway, client, chat } = build({
      twoFactorEnabled: false,
    });
    await gateway.onPinMessage(client, { messageId: 'x' } as never);
    expect(chat.setPinned).not.toHaveBeenCalled();
  });

  it('mute_user с 2FA выполняется, siteSettings не читается', async () => {
    const { gateway, client, moderation, findFirst } = build({
      twoFactorEnabled: true,
    });
    await gateway.onMuteUser(client, { userId: 'u2' } as never);
    expect(moderation.muteUser).toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('delete_message чужого без 2FA — отказ', async () => {
    const { gateway, client, emit, chatMessage } = build({
      twoFactorEnabled: false,
    });
    await gateway.onDeleteMessage(client, { messageId: 'x' } as never);
    expect(chatMessage.update).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'delete_message',
        message: expect.stringContaining('admin_2fa_required'),
      }),
    );
  });

  it('delete_message чужого с 2FA выполняется', async () => {
    const { gateway, client, chatMessage } = build({
      twoFactorEnabled: true,
    });
    await gateway.onDeleteMessage(client, { messageId: 'x' } as never);
    expect(chatMessage.update).toHaveBeenCalled();
  });

  it('delete_message автором без 2FA выполняется (2FA не требуется)', async () => {
    const { gateway, client, chatMessage, emit } = build({
      twoFactorEnabled: false,
      authorId: 'admin1',
    });
    await gateway.onDeleteMessage(client, { messageId: 'x' } as never);
    expect(chatMessage.update).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('send_message в read-only канал без 2FA — отказ, сообщение не создаётся', async () => {
    const { gateway, client, emit, chatMessageCreate } = build({
      twoFactorEnabled: false,
    });
    const res = await gateway.onSendMessage(client, {
      channelId: 'ro',
      content: 'привет',
    } as never);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('admin_2fa_required');
    expect(chatMessageCreate).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'send_message',
        message: expect.stringContaining('admin_2fa_required'),
      }),
    );
  });

  it('send_message в read-only канал с 2FA — сообщение создаётся', async () => {
    const { gateway, client, chatMessageCreate } = build({
      twoFactorEnabled: true,
    });
    const res = await gateway.onSendMessage(client, {
      channelId: 'ro',
      content: 'привет',
    } as never);
    expect(res.ok).toBe(true);
    expect(chatMessageCreate).toHaveBeenCalledTimes(1);
  });
});
