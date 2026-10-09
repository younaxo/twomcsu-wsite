'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';

export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /// Скелетон на первую загрузку (по умолчанию — 5 строк).
  skeleton?: ReactNode;
  /// Компактный вид состояний (внутри карточки).
  size?: 'sm' | 'md';
}

/// Единая обработка состояний запроса: первая загрузка → скелетон,
/// 403 → ForbiddenState (backend — источник истины о правах), прочие
/// ошибки → ErrorState с повтором, данные → render-prop. Фоновые
/// перезапросы не меняют разметку (данные уже есть).
export function QueryBoundary<T>({
  query,
  children,
  skeleton,
  size = 'md',
}: QueryBoundaryProps<T>) {
  if (query.isPending) {
    return <>{skeleton ?? <SkeletonRows rows={5} />}</>;
  }
  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ForbiddenState
          title="Недостаточно прав"
          description="Сервер отклонил запрос: у вашей роли нет нужного permission."
        />
      );
    }
    return (
      <ErrorState
        error={error}
        size={size}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <>{children(query.data)}</>;
}
