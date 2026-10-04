import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BanUserDto } from './dto/ban-user.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MuteUserDto } from './dto/mute-user.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createChannel(dto: CreateChannelDto) {
    const existing = await this.prisma.chatChannel.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Канал с таким slug уже существует');
    }
    return this.prisma.chatChannel.create({ data: dto });
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    return this.prisma.chatChannel.update({ where: { id }, data: dto });
  }

  async removeChannel(id: string): Promise<void> {
    const channel = await this.prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    await this.prisma.chatChannel.delete({ where: { id } });
  }

  async muteUser(mutedBy: string, dto: MuteUserDto) {
    return this.prisma.chatMute.create({
      data: {
        userId: dto.userId,
        channelId: dto.channelId,
        reason: dto.reason,
        reasonNote: dto.reasonNote,
        mutedBy,
        mutedUntil: dto.mutedUntil ? new Date(dto.mutedUntil) : undefined,
      },
    });
  }

  async listMutes(onlyActive = true) {
    const where: Prisma.ChatMuteWhereInput = onlyActive
      ? { isActive: true }
      : {};
    return this.prisma.chatMute.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unmute(id: string): Promise<void> {
    const mute = await this.prisma.chatMute.findUnique({ where: { id } });
    if (!mute) {
      throw new NotFoundException('Мут не найден');
    }
    await this.prisma.chatMute.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async banUser(bannedBy: string, dto: BanUserDto) {
    return this.prisma.chatBan.create({
      data: {
        userId: dto.userId,
        reason: dto.reason,
        bannedBy,
        bannedUntil: dto.bannedUntil ? new Date(dto.bannedUntil) : undefined,
      },
    });
  }

  async listBans(onlyActive = true) {
    const where: Prisma.ChatBanWhereInput = onlyActive
      ? { isActive: true }
      : {};
    return this.prisma.chatBan.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unban(id: string): Promise<void> {
    const ban = await this.prisma.chatBan.findUnique({ where: { id } });
    if (!ban) {
      throw new NotFoundException('Бан не найден');
    }
    await this.prisma.chatBan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async searchMessages(query: string, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { content: { contains: query, mode: 'insensitive' } },
        include: { author: true, channel: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: { content: { contains: query, mode: 'insensitive' } },
      }),
    ]);
    return { items, total, page, limit };
  }

  async getMessageById(id: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id },
      include: { author: true, channel: true },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return message;
  }
}
