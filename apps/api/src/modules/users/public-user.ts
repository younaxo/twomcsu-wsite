import type { Prisma } from '@prisma/client';

/// Поля пользователя, которые можно отдавать посторонним (ADR-0107): id, ник,
/// публичный тег и аватар. Всё остальное — email, IP последнего входа, причина
/// бана, дата рождения, флаги приватности, роли доступа — только владельцу и
/// администрации. Для связей в публичных ответах вместо `include: { author:
/// true }` — `include: { author: { select: PUBLIC_USER_SELECT } }`: глобальный
/// omit скрывает только хеш пароля.
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  tag: true,
  avatar: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_SELECT;
}>;
