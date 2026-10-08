'use client';

import { CircleCheck, Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton, SkeletonRows, SkeletonText } from '@/components/ui/skeleton';
import { LoadingBlock, Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { NetworkError } from '@/lib/api/errors';
import { DemoBlock, DemoGrid, DemoResult, DemoRow, useTimers } from './shared';

/// Группа «Состояния»: загрузка, пусто, ошибка, нет прав.
export function StateDemos() {
  return (
    <DemoGrid>
      <SkeletonDemo />
      <SpinnerDemo />
      <EmptyStateDemo />
      <ErrorStateDemo />
      <ForbiddenStateDemo />
    </DemoGrid>
  );
}

/* ------------------------------------ Skeleton ----------------------------------- */

function SkeletonDemo() {
  return (
    <DemoBlock
      title="Skeleton / SkeletonText / SkeletonRows"
      use="Заглушка под форму будущего контента при первичной загрузке: карточка, абзац, строки таблицы."
      avoid="повторных обновлений уже показанных данных — там приглушение (opacity) или Spinner у кнопки."
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={4} />
      <div className="rounded border bg-surface">
        <SkeletonRows rows={3} />
      </div>
    </DemoBlock>
  );
}

/* ------------------------------------- Spinner ----------------------------------- */

function SpinnerDemo() {
  return (
    <DemoBlock
      title="Spinner / LoadingBlock"
      use="Ожидание без оценки длительности: отправка формы (в кнопке), догрузка списка. LoadingBlock — первичная загрузка секции."
      avoid="долгих операций с прогрессом (Progress, DynamicIsland)."
    >
      <DemoRow>
        <Spinner size="sm" label="Загрузка, маленький" />
        <Spinner size="md" label="Загрузка, средний" />
        <Spinner size="lg" label="Загрузка, большой" />
        <Button loading variant="secondary" size="sm">
          Сохраняем
        </Button>
      </DemoRow>
      <div className="rounded border bg-surface">
        <LoadingBlock label="Загружаем список игроков…" className="min-h-28" />
      </div>
    </DemoBlock>
  );
}

/* ----------------------------------- EmptyState ---------------------------------- */

function EmptyStateDemo() {
  const [created, setCreated] = useState(0);
  return (
    <DemoBlock
      title="EmptyState"
      use="Пустой список или раздел: говорит, почему пусто, и приглашает действовать. С иконкой и основной кнопкой."
      avoid="ошибок (ErrorState) и результатов поиска без действия — там достаточно короткой строки."
    >
      <div className="rounded border bg-surface">
        <EmptyState
          icon={<Inbox />}
          title="Ролей пока нет"
          description="Создайте первую роль, чтобы раздавать права игрокам и модераторам."
          action={
            <Button
              size="sm"
              onClick={() => {
                setCreated((value) => value + 1);
                toast.success('Роль создана');
              }}
            >
              <Plus />
              Создать роль
            </Button>
          }
        />
      </div>
      <DemoResult>Нажатий на действие: {created}</DemoResult>
    </DemoBlock>
  );
}

/* ----------------------------------- ErrorState ---------------------------------- */

type ErrorKind = 'server' | 'network';

const ERROR_KINDS: { value: ErrorKind; label: string }[] = [
  { value: 'server', label: 'Сервер' },
  { value: 'network', label: 'Сеть' },
];

const SERVER_ERROR = new Error('Сервер вернул 500 при загрузке списка игроков.');
const NETWORK_ERROR = new NetworkError();

function ErrorStateDemo() {
  const [kind, setKind] = useState<ErrorKind>('server');
  const [retrying, setRetrying] = useState(false);
  const [resolved, setResolved] = useState(false);
  const { after } = useTimers();

  const retry = () => {
    setRetrying(true);
    after(1200, () => {
      setRetrying(false);
      setResolved(true);
    });
  };

  return (
    <DemoBlock
      title="ErrorState"
      use="Запрос не удался: что случилось и что делать. Кнопка «Повторить» показывает loading, пока идёт повтор."
      avoid="ошибок валидации формы и отсутствия прав (ForbiddenState)."
    >
      <SegmentedControl
        aria-label="Тип ошибки"
        size="sm"
        options={ERROR_KINDS}
        value={kind}
        onValueChange={(value) => {
          setKind(ERROR_KINDS.find((item) => item.value === value)?.value ?? 'server');
          setResolved(false);
        }}
      />
      <div className="min-h-56 rounded border bg-surface">
        {resolved ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <CircleCheck aria-hidden className="size-6 text-success" />
            <p className="font-medium">Данные загружены</p>
            <Button size="sm" variant="secondary" onClick={() => setResolved(false)}>
              Сломать снова
            </Button>
          </div>
        ) : (
          <ErrorState
            error={kind === 'network' ? NETWORK_ERROR : SERVER_ERROR}
            onRetry={retry}
            retrying={retrying}
          />
        )}
      </div>
    </DemoBlock>
  );
}

/* --------------------------------- ForbiddenState -------------------------------- */

function ForbiddenStateDemo() {
  return (
    <DemoBlock
      title="ForbiddenState"
      use="У роли нет права на раздел: честно показываем, какие права требуются, и даём путь запросить доступ."
      avoid="маскировки под «не найдено» — это запутывает и модераторов, и поддержку."
    >
      <div className="rounded border bg-surface">
        <ForbiddenState
          requiredPermissions={['users.ban', 'users.view']}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toast.info('Запрос отправлен администратору')}
            >
              Запросить доступ
            </Button>
          }
        />
      </div>
    </DemoBlock>
  );
}
