import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { PunishmentOrder } from './api/punishments-api.types';
import { canonicalJson } from './punishments-view';

/// Курсорная пагинация (контракт 2.1): `base64url(JSON {t, i, o, f})`.
/// t - startedAt в мс, i - id зеркала, o - порядок, f - хэш фильтров.

export const INVALID_CURSOR_CODE = 'punishments_invalid_cursor';
const MAX_CURSOR_LENGTH = 200;

export interface CursorPosition {
  t: number;
  i: string;
}

export function invalidCursor(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: INVALID_CURSOR_CODE,
    message: 'Курсор недействителен.',
    error: 'Bad Request',
  });
}

/// Короткий хэш нормализованного набора фильтров (без cursor, limit, order).
/// `scope` различает эндпоинты: курсор публичного списка не годится персоналу.
export function filterHash(
  scope: string,
  filters: Record<string, unknown>,
): string {
  return createHash('sha256')
    .update(canonicalJson({ scope, filters }))
    .digest('hex')
    .slice(0, 16);
}

export function encodeCursor(
  position: CursorPosition,
  order: PunishmentOrder,
  hash: string,
): string {
  return Buffer.from(
    JSON.stringify({ t: position.t, i: position.i, o: order, f: hash }),
    'utf8',
  ).toString('base64url');
}

/// Строгий разбор: любое отклонение (длина, алфавит, форма, порядок, хэш
/// фильтров) - 400 `punishments_invalid_cursor`.
export function decodeCursor(
  raw: string,
  order: PunishmentOrder,
  hash: string,
): CursorPosition {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  ) {
    throw invalidCursor();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidCursor();
  }
  const keys = Object.keys(parsed).sort().join(',');
  if (keys !== 'f,i,o,t') throw invalidCursor();
  const { t, i, o, f } = parsed as Record<string, unknown>;
  if (
    typeof t !== 'number' ||
    !Number.isSafeInteger(t) ||
    t < 0 ||
    t > 8.64e15 ||
    typeof i !== 'string' ||
    !/^[A-Za-z0-9_-]{1,40}$/.test(i) ||
    (o !== 'asc' && o !== 'desc') ||
    typeof f !== 'string' ||
    !/^[0-9a-f]{16}$/.test(f)
  ) {
    throw invalidCursor();
  }
  if (o !== order || f !== hash) throw invalidCursor();
  return { t, i };
}
