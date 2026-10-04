import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStreamChannelDto } from './dto/create-stream-channel.dto';
import { UpdateStreamChannelDto } from './dto/update-stream-channel.dto';

@Injectable()
export class StreamingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list() {
    return this.prisma.streamChannel.findMany({
      orderBy: { displayName: 'asc' },
    });
  }

  async create(dto: CreateStreamChannelDto) {
    const existing = await this.prisma.streamChannel.findUnique({
      where: {
        platform_channelKey: {
          platform: dto.platform,
          channelKey: dto.channelKey,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Канал с таким platform+channelKey уже добавлен',
      );
    }
    return this.prisma.streamChannel.create({ data: dto });
  }

  async update(id: string, dto: UpdateStreamChannelDto) {
    const channel = await this.prisma.streamChannel.findUnique({
      where: { id },
    });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    return this.prisma.streamChannel.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    const channel = await this.prisma.streamChannel.findUnique({
      where: { id },
    });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    await this.prisma.streamChannel.delete({ where: { id } });
  }

  /// Без TWITCH_CLIENT_ID/SECRET и YOUTUBE_API_KEY реальный опрос платформ
  /// не выполняется — честно сообщает об этом вместо того, чтобы молча
  /// ничего не делать или падать. См. RISKS.md R6.
  async refresh(): Promise<{ refreshed: boolean; reason?: string }> {
    const twitchConfigured =
      this.config.get<string>('TWITCH_CLIENT_ID', '').length > 0 &&
      this.config.get<string>('TWITCH_CLIENT_SECRET', '').length > 0;
    const youtubeConfigured =
      this.config.get<string>('YOUTUBE_API_KEY', '').length > 0;

    if (!twitchConfigured && !youtubeConfigured) {
      return { refreshed: false, reason: 'no_platform_credentials_configured' };
    }

    // Реальный опрос Twitch Helix / YouTube Data API и периодический cron —
    // PHASE 18 (Minecraft servers, тот же паттерн внешнего API) / PHASE 29
    // (Background jobs); здесь только честная проверка наличия credentials.
    return { refreshed: false, reason: 'not_implemented' };
  }
}
