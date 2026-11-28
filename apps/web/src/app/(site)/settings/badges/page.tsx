'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Award } from 'lucide-react';
import type { DisplayBadge } from '@twomc/shared';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { USER_BADGE_META } from '@/components/profile/profile-badges';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { RadioField, RadioGroup } from '@/components/ui/radio-group';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { canMove, moveItem, type MoveDirection } from '@/lib/profile/reorder';

/// Порядок бейджей и наград, бейдж у ника (J-07-6). Перестановка кнопками
/// «выше/ниже» (без drag-and-drop); оформление ника не затрагивается.

const NONE = 'none';
const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

interface MyBadge {
  id: string;
  type: string;
  grantedAt: string;
}
interface MyAward {
  id: string;
  slug: string;
  name: string;
  grantedAt: string;
}
interface MeView {
  displayBadge?: DisplayBadge | null;
}

class SaveStepError extends Error {
  constructor(
    readonly step: string,
    readonly index: number,
    readonly original: unknown,
  ) {
    super(step);
  }
}

/// Бейдж мог истечь или быть отозван, пока страница была открыта: сервер
/// отвечает 4xx на запрос с таким id.
const isStaleBadgeError = (cause: unknown) =>
  cause instanceof ApiError && [400, 404, 409, 410, 422].includes(cause.status);

function describeSaveError(error: unknown): string {
  if (!(error instanceof SaveStepError)) {
    return `Не удалось сохранить: ${getErrorMessage(error)}`;
  }
  const done = error.index > 0 ? ` Предыдущие шаги (${error.index} из 3) уже сохранены.` : '';
  const stale =
    error.index !== 1 && isStaleBadgeError(error.original)
      ? ' Один из бейджей истёк или отозван.'
      : '';
  return `Не удалось сохранить: ${error.step} — ${getErrorMessage(error.original)}.${stale}${done} Данные обновлены, проверьте порядок и попробуйте ещё раз.`;
}

const badgeLabel = (type: string) =>
  (USER_BADGE_META as Record<string, { label: string }>)[type]?.label ?? type;

function OrderList({
  title,
  items,
  onMove,
  testId,
}: {
  title: string;
  items: { id: string; label: string }[];
  onMove: (index: number, dir: MoveDirection) => void;
  testId: string;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ id: string; dir: MoveDirection } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // После перестановки DOM-узел кнопки переносится и фокус теряется: возвращаем
  // его на кнопку того же элемента. Если направление стало недоступным (край
  // списка) — на соседнюю кнопку того же элемента.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const same = buttons.current.get(`${pending.id}:${pending.dir}`);
    const other = buttons.current.get(`${pending.id}:${pending.dir === 'up' ? 'down' : 'up'}`);
    const target = same && !same.disabled ? same : other && !other.disabled ? other : null;
    target?.focus();
  }, [items]);

  const move = (index: number, dir: MoveDirection) => {
    const item = items[index];
    if (!item) return;
    const next = dir === 'up' ? index - 1 : index + 1;
    pendingFocus.current = { id: item.id, dir };
    setAnnouncement(`${item.label}: позиция ${next + 1} из ${items.length}`);
    onMove(index, dir);
  };

  const setButtonRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(key, node);
    else buttons.current.delete(key);
  };

  return (
    <section className={island} aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="sr-only" aria-live="polite" data-testid={`${testId}-live`}>
        {announcement}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока ничего нет.</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid={testId}>
          {items.map((item, index) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <IconButton
                ref={setButtonRef(`${item.id}:up`)}
                size="sm"
                aria-label={`Выше: ${item.label}`}
                disabled={!canMove(items.length, index, 'up')}
                onClick={() => move(index, 'up')}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                ref={setButtonRef(`${item.id}:down`)}
                size="sm"
                aria-label={`Ниже: ${item.label}`}
                disabled={!canMove(items.length, index, 'down')}
                onClick={() => move(index, 'down')}
              >
                <ArrowDown />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BadgesSettings() {
  const client = useQueryClient();
  const badgesQ = useQuery({
    queryKey: ['users', 'me', 'badges'],
    queryFn: () => api.get<MyBadge[]>('/users/me/badges'),
  });
  const awardsQ = useQuery({
    queryKey: ['users', 'me', 'awards'],
    queryFn: () => api.get<MyAward[]>('/users/me/awards'),
  });
  const meQ = useQuery({
    queryKey: ['users', 'me', 'display-badge'],
    queryFn: () => api.get<MeView>('/users/me/profile'),
  });
  const [badges, setBadges] = useState<MyBadge[] | null>(null);
  const [awards, setAwards] = useState<MyAward[] | null>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (badgesQ.data && badges === null) setBadges(badgesQ.data);
  }, [badgesQ.data, badges]);
  useEffect(() => {
    if (awardsQ.data && awards === null) setAwards(awardsQ.data);
  }, [awardsQ.data, awards]);
  useEffect(() => {
    if (meQ.data && display === null) setDisplay(meQ.data.displayBadge?.id ?? NONE);
  }, [meQ.data, display]);

  // Единого эндпоинта нет: три запроса подряд. Упавший шаг называем, а после
  // ошибки перечитываем данные с сервера (часть шагов могла уже примениться).
  const save = useMutation({
    mutationFn: async () => {
      const steps: { name: string; run: () => Promise<unknown> }[] = [
        {
          name: 'порядок бейджей',
          run: () => api.put('/users/me/badges/order', { ids: (badges ?? []).map((b) => b.id) }),
        },
        {
          name: 'порядок наград',
          run: () => api.put('/users/me/awards/order', { ids: (awards ?? []).map((a) => a.id) }),
        },
        {
          name: 'бейдж у ника',
          run: () =>
            api.put('/users/me/display-badge', { userBadgeId: display === NONE ? null : display }),
        },
      ];
      for (const [index, step] of steps.entries()) {
        try {
          await step.run();
        } catch (cause) {
          throw new SaveStepError(step.name, index, cause);
        }
      }
    },
    onMutate: () => setStatus('Сохраняем…'),
    onSuccess: () => {
      setStatus('Сохранено');
      return client.invalidateQueries({ queryKey: ['users'] });
    },
    onError: async (error) => {
      setStatus(describeSaveError(error));
      const [b, a, m] = await Promise.all([badgesQ.refetch(), awardsQ.refetch(), meQ.refetch()]);
      if (b.data) setBadges(b.data);
      if (a.data) setAwards(a.data);
      if (m.data) setDisplay(m.data.displayBadge?.id ?? NONE);
    },
  });

  const error = badgesQ.error ?? awardsQ.error ?? meQ.error;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void badgesQ.refetch();
          void awardsQ.refetch();
          void meQ.refetch();
        }}
      />
    );
  }
  if (badges === null || awards === null || display === null) return <SkeletonRows rows={4} />;
  if (badges.length === 0 && awards.length === 0) {
    return (
      <EmptyState
        icon={<Award />}
        title="Пока нет бейджей и наград"
        description="Когда они появятся, здесь можно будет расставить их порядок."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <OrderList
        title="Порядок бейджей"
        testId="badges-order"
        items={badges.map((b) => ({ id: b.id, label: badgeLabel(b.type) }))}
        onMove={(index, dir) => {
          setStatus('');
          setBadges((current) => moveItem(current ?? [], index, dir));
        }}
      />
      <OrderList
        title="Порядок наград"
        testId="awards-order"
        items={awards.map((a) => ({ id: a.id, label: a.name }))}
        onMove={(index, dir) => {
          setStatus('');
          setAwards((current) => moveItem(current ?? [], index, dir));
        }}
      />
      <section className={island} aria-label="Бейдж у ника">
        <h3 className="text-sm font-semibold">Бейдж у ника</h3>
        <RadioGroup
          aria-label="Бейдж у ника"
          value={display}
          onValueChange={(value) => {
            setStatus('');
            setDisplay(value);
          }}
        >
          <RadioField value={NONE} label="Нет" />
          {badges.map((b) => (
            <RadioField key={b.id} value={b.id} label={badgeLabel(b.type)} />
          ))}
        </RadioGroup>
      </section>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {status}
        </p>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

export default function BadgesSettingsPage() {
  return (
    <>
      <PageHeader
        title="Бейджи и награды"
        description="Порядок в профиле и бейдж, который показывается рядом с ником."
      />
      <RequireSession>
        <BadgesSettings />
      </RequireSession>
    </>
  );
}
