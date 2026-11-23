import { Injectable } from '@nestjs/common';
import { StorageService } from '../files/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from './public-user';

export interface UserSearchItem {
  username: string;
  tag: string | null;
  avatar: string | null;
}

export interface UserSearchResult {
  items: UserSearchItem[];
  page: number;
  limit: number;
  hasMore: boolean;
}

/// Поиск игроков по нику (Q73, ADR-0192). Только публичные поля; в выдачу
/// попадают лишь профили с `profileVisibility = EVERYONE`, не заблокированные
/// и не системные. `contains` в Prisma экранирует `%` и `_` сам.
@Injectable()
export class UsersSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async search(
    q: string,
    page: number,
    limit: number,
  ): Promise<UserSearchResult> {
    const rows = await this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        profileVisibility: 'EVERYONE',
        isBanned: false,
        accountType: { not: 'SYSTEM' },
      },
      select: PUBLIC_USER_SELECT,
      orderBy: { username: 'asc' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    // Префикс важнее вхождения: внутри страницы сортируем стабильно.
    const needle = q.toLowerCase();
    const pageRows = rows.slice(0, limit).sort((a, b) => {
      const pa = a.username.toLowerCase().startsWith(needle) ? 0 : 1;
      const pb = b.username.toLowerCase().startsWith(needle) ? 0 : 1;
      return pa - pb;
    });
    return {
      items: pageRows.map((row) => ({
        username: row.username,
        tag: row.tag,
        avatar: this.storage.publicUrl(row.avatar),
      })),
      page,
      limit,
      hasMore: rows.length > limit,
    };
  }
}
