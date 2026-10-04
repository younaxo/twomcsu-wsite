import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { isValidDiscordWebhookUrl } from './discord-webhook-url.util';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// true — запрос реально ушёл и Discord принял его (2xx). Ошибки сети/
  /// Discord не бросают исключение — отправка уведомления не должна падать
  /// из-за недоступности стороннего вебхука.
  async sendToWebhook(url: string, content: string): Promise<boolean> {
    if (!isValidDiscordWebhookUrl(url)) {
      throw new BadRequestException('Недопустимый Discord webhook URL');
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      return response.ok;
    } catch (err) {
      this.logger.warn(
        `Ошибка отправки в Discord webhook: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async broadcastToSystemWebhooks(
    type: NotificationType,
    content: string,
  ): Promise<void> {
    const webhooks = await this.prisma.discordWebhook.findMany({
      where: { isActive: true, eventTypes: { has: type } },
    });
    await Promise.all(webhooks.map((w) => this.sendToWebhook(w.url, content)));
  }

  async listWebhooks() {
    return this.prisma.discordWebhook.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhook(createdBy: string, dto: CreateWebhookDto) {
    if (!isValidDiscordWebhookUrl(dto.url)) {
      throw new BadRequestException('Недопустимый Discord webhook URL');
    }
    return this.prisma.discordWebhook.create({
      data: {
        name: dto.name,
        url: dto.url,
        eventTypes: dto.eventTypes,
        isActive: dto.isActive ?? true,
        createdBy,
      },
    });
  }

  async updateWebhook(id: string, dto: UpdateWebhookDto) {
    const webhook = await this.prisma.discordWebhook.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException('Вебхук не найден');
    }
    if (dto.url && !isValidDiscordWebhookUrl(dto.url)) {
      throw new BadRequestException('Недопустимый Discord webhook URL');
    }
    return this.prisma.discordWebhook.update({ where: { id }, data: dto });
  }

  async deleteWebhook(id: string): Promise<void> {
    const webhook = await this.prisma.discordWebhook.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException('Вебхук не найден');
    }
    await this.prisma.discordWebhook.delete({ where: { id } });
  }
}
