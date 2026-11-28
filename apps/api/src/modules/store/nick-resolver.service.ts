import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/// Допустимый формат ника получателя в quick-buy (допущение Q-номер в
/// QUESTIONS-FOR-OWNER: 3-16 символов, [A-Za-z0-9_]; ADR-0186 п. 1 говорил 1-16).
export const NICK_FORMAT = /^[A-Za-z0-9_]{3,16}$/;

/// Проверка существования ника получателя (ADR-0186; подэтап 0.5, R158).
/// Источники только из БД сайта, без сети: привязанные Minecraft-аккаунты
/// (ADR-0072) и зеркало наказаний LiteBans (`MinecraftPunishment.subjectName`).
/// Ни одного совпадения — null (fail closed). Результат — только каноническое
/// написание; причина отказа и принадлежность аккаунта наружу не раскрываются.
@Injectable()
export class NickResolver {
  constructor(private readonly prisma: PrismaService) {}

  /// Каноническое написание известного ника или null. Регистр не важен
  /// (в Minecraft ники регистронезависимо уникальны). Оба источника всегда
  /// опрашиваются (без раннего возврата), чтобы время не выдавало источник.
  /// minecraft_accounts.name без индекса по lower(): таблица ограничена числом
  /// привязанных игроков (одна строка на пользователя), seq scan малой таблицы
  /// дёшев; миграция не нужна (ADR-0158), пересмотреть при росте до сотен тысяч.
  async resolve(nick: string): Promise<string | null> {
    const trimmed = nick.trim();
    if (!NICK_FORMAT.test(trimmed)) {
      return null;
    }
    const [account, mirrored] = await Promise.all([
      this.prisma.minecraftAccount.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
        select: { name: true },
      }),
      // lower("subjectName") = lower($1): точное равенство, использует индекс
      // minecraft_punishments_subjectName_lower_idx (миграция 20261117040000);
      // mode:"insensitive" в Prisma даёт ILIKE без индекса. Параметр привязан.
      this.prisma.$queryRaw<Array<{ subjectName: string | null }>>`
        SELECT "subjectName" FROM "minecraft_punishments"
        WHERE lower("subjectName") = lower(${trimmed})
        LIMIT 1`,
    ]);
    return account?.name ?? mirrored[0]?.subjectName ?? null;
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
