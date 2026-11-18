import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/// Проверка существования ника получателя (ADR-0186, Proposed; подэтап 0.5).
/// Минимум: только источники, известные сайту, — привязанные Minecraft-аккаунты
/// (ADR-0072). Зеркала наказаний по нику в БД нет, внешних запросов (Mojang,
/// Bridge) нет: они появятся с 0.12/0.13 как дополнительные источники здесь же.
/// Результат — только «известен/неизвестен» и каноническое написание ника;
/// причина отказа и принадлежность аккаунта наружу не раскрываются.
@Injectable()
export class NickResolver {
  constructor(private readonly prisma: PrismaService) {}

  /// Каноническое написание известного ника или null. Регистр не важен
  /// (в Minecraft ники регистронезависимо уникальны).
  async resolve(nick: string): Promise<string | null> {
    const trimmed = nick.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const account = await this.prisma.minecraftAccount.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
      select: { name: true },
    });
    return account?.name ?? null;
  }

  /// Привязанный ник пользователя (по умолчанию для вошедшего) или null.
  async linkedNickOf(userId: string): Promise<string | null> {
    const account = await this.prisma.minecraftAccount.findUnique({
      where: { userId },
      select: { name: true },
    });
    return account?.name ?? null;
  }
}
