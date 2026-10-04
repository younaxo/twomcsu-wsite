import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/// Backend всегда повторно проверяет permission, даже если frontend уже
/// скрыл недоступную функцию в UI (MASTER PROMPT §47).
export const RequirePermissions = (
  ...keys: string[]
): ReturnType<typeof SetMetadata> => SetMetadata(PERMISSIONS_KEY, keys);
