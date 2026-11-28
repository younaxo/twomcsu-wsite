'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Award } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { USER_BADGE_META } from '@/components/profile/profile-badges';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { RadioField, RadioGroup } from '@/components/ui/radio-group';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
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
  displayBadge?: { id: string; type: string } | null;
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
  return (
    <section className={island} aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока ничего нет.</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid={testId}>
          {items.map((item, index) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <IconButton
                size="sm"
                aria-label={`Выше: ${item.label}`}
                disabled={!canMove(items.length, index, 'up')}
                onClick={() => onMove(index, 'up')}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                size="sm"
                aria-label={`Ниже: ${item.label}`}
                disabled={!canMove(items.length, index, 'down')}
                onClick={() => onMove(index, 'down')}
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
    queryFn: () => api.get<MeView>('/users/me'),
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

  const save = useMutation({
    mutationFn: async () => {
      await api.put('/users/me/badges/order', { ids: (badges ?? []).map((b) => b.id) });
      await api.put('/users/me/awards/order', { ids: (awards ?? []).map((a) => a.id) });
      await api.put('/users/me/display-badge', {
        userBadgeId: display === NONE ? null : display,
      });
    },
    onMutate: () => setStatus('Сохраняем…'),
    onSuccess: () => {
      setStatus('Сохранено');
      return client.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => setStatus(`Не удалось сохранить: ${getErrorMessage(error)}`),
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
