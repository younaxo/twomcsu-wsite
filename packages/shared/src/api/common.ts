/// Общие примитивы API-контракта (ADR-0051). Все даты передаются как ISO-8601
/// строки (так их сериализует JSON), денежные суммы (Prisma Decimal) — как
/// строки, чтобы не терять точность.
export type IsoDateString = string;
export type DecimalString = string;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/// Единый формат списков с пагинацией: `{ items, total, page, limit }`
/// (UsersController, AuditService.list, OrdersService.listAdmin и т.д.).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SuccessResponse {
  success: true;
}

/// Формат ошибки backend. Сейчас — стандартный NestJS (`statusCode`, `message`,
/// `error`); поля `code`/`details`/`requestId` появятся с единым
/// ExceptionFilter (ADR-0007, PHASE 27) — клиент уже готов их читать.
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}
