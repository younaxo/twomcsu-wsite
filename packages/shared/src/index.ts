/// `@twomc/shared` — API-контракт между apps/api и apps/web (ADR-0051).
/// Только типы и чистые константы: никаких зависимостей от NestJS/Prisma/Next,
/// чтобы frontend не зависел от внутренних классов backend, а будущий вынос
/// API в отдельный репозиторий (twomcsu-api) не ломал frontend.
export const SHARED_PACKAGE_NAME = '@twomc/shared';

export * from './permissions';
export * from './role-prefixes';
export * from './api/common';
export * from './api/auth';
export * from './api/roles';
export * from './api/users';
export * from './api/moderation';
export * from './api/admin';
export * from './api/site';
export * from './api/communications';
export * from './api/announcements';
export * from './api/system';
export * from './api/account';
export * from './privacy';
