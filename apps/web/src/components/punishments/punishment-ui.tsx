'use client';

import type { PunishmentViewStatus } from '@twomc/shared';
import { CircleCheck, CircleSlash, Clock, Globe, Server, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import {
  STATUS_LABELS,
  type ExecutorView,
  type PunishmentViewBase,
  type ScopeView,
} from '@/lib/punishments/view';

/// Общие фрагменты «Бан-листа» и «Моих наказаний на серверах». Весь вывод —
/// обычный текст (React-экранирование); разметка, ссылки и dangerouslySetInnerHTML
/// не используются.

const STATUS_TONE: Record<PunishmentViewStatus, 'warning' | 'neutral' | 'success'> = {
  ACTIVE: 'warning',
  EXPIRED: 'neutral',
  REMOVED: 'success',
};

const STATUS_ICON: Record<PunishmentViewStatus, ReactNode> = {
  ACTIVE: <ShieldOff aria-hidden />,
  EXPIRED: <Clock aria-hidden />,
  REMOVED: <CircleCheck aria-hidden />,
};

export function StatusBadge({ status }: { status: PunishmentViewStatus }) {
  // Иконка + текст: статус читается не только цветом.
  return (
    <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} data-status={status}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ExecutorText({ executor }: { executor: ExecutorView }) {
  if (executor.kind === 'console') {
    return <>Консоль</>;
  }
  if (executor.kind === 'name') {
    return <>{executor.name}</>;
  }
  // `null` у API: скрыт, не известен или не прошёл проверку — причина не различается.
  return <span className="text-muted-foreground">Выдавший не указан</span>;
}

export function ScopeText({ scope }: { scope: ScopeView }) {
  if (scope.kind === 'global') {
    return (
      <span className="inline-flex items-center gap-1">
        <Globe aria-hidden className="size-3.5" />
        Глобально
      </span>
    );
  }
  if (scope.kind === 'server') {
    return (
      <span className="inline-flex items-center gap-1">
        <Server aria-hidden className="size-3.5" />
        <span className="sr-only">Сервер: </span>
        {scope.name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <CircleSlash aria-hidden className="size-3.5" />
      Неизвестный сервер
    </span>
  );
}

/// Срок: «Бессрочно» или «до …»; снятое — отдельно с датой снятия.
export function TermText({
  item,
}: {
  item: Pick<PunishmentViewBase, 'until' | 'permanent' | 'status' | 'removedAt'>;
}) {
  const term = item.permanent || !item.until ? 'Бессрочно' : `до ${formatDateTime(item.until)}`;
  return (
    <>
      {term}
      {item.status === 'REMOVED' && item.removedAt
        ? ` · снят ${formatDateTime(item.removedAt)}`
        : ''}
    </>
  );
}

export function StaleNote({ stale }: { stale: boolean }) {
  if (!stale) {
    return null;
  }
  return (
    <p
      role="status"
      className="rounded bg-warning-soft px-3 py-2 text-sm text-warning"
      data-testid="punishments-stale"
    >
      Данные давно не обновлялись и могут быть неактуальными.
    </p>
  );
}

/// Ошибки API наказаний по статусу (контракт, 5 и 6.3): 401, 404 (раздел
/// выключен или запись не найдена), 429 с Retry-After, 503 (зеркало недоступно).
export function PunishmentsErrorState({
  error,
  onRetry,
  retrying,
  size = 'md',
  unavailableTitle = 'Данные временно недоступны',
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  size?: 'sm' | 'md';
  /// Заголовок при 503 (источник наказаний ещё не загружен).
  unavailableTitle?: string;
}) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return (
        <ErrorState
          size={size}
          title="Нужно войти в аккаунт"
          description="Сессия закончилась. Войдите снова, чтобы увидеть свои наказания."
        />
      );
    }
    if (error.status === 404) {
      return (
        <ErrorState
          size={size}
          title={
            error.code === 'punishments_not_found' ? 'Наказание не найдено' : 'Раздел недоступен'
          }
          description={
            error.code === 'punishments_not_found'
              ? 'Такой записи нет в общем списке.'
              : 'Список наказаний пока не опубликован.'
          }
        />
      );
    }
    if (error.status === 429) {
      const wait = error.retryAfterSeconds;
      return (
        <ErrorState
          size={size}
          title="Слишком много запросов"
          description={
            wait ? `Повторите попытку через ${wait} с.` : 'Подождите немного и повторите попытку.'
          }
          onRetry={onRetry}
          retrying={retrying}
        />
      );
    }
    if (error.status === 503) {
      return (
        <ErrorState
          size={size}
          title={unavailableTitle}
          description="Список наказаний сейчас не загружается. Попробуйте позже."
          onRetry={onRetry}
          retrying={retrying}
        />
      );
    }
  }
  return <ErrorState error={error} size={size} onRetry={onRetry} retrying={retrying} />;
}
