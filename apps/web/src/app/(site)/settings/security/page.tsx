'use client';

import type { SessionSummary } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import { TwoFactorSettings } from '@/components/auth/two-factor-settings';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { describeDevice } from '@/lib/account/device';
import { formatDateTime } from '@/lib/format';

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';
const SESSIONS_KEY = ['account', 'sessions'] as const;

type SessionDto = SessionSummary;

function ChangePassword() {
  const client = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api.post(
        '/auth/change-password',
        { currentPassword: current, newPassword: next },
        // Неверный текущий пароль — 401 по смыслу формы, а не истёкшая сессия.
        { retryOn401: false },
      ),
  });
  const mismatch = repeat.length > 0 && next !== repeat;
  const tooShort = next.length > 0 && next.length < 8;
  const valid = current.length > 0 && next.length >= 8 && next.length <= 72 && next === repeat;

  const submit = async () => {
    try {
      await change.mutateAsync();
      toast.success('Пароль изменён');
      // Обязательная смена выполнена — снять флаг сразу (сервер уже сбросил его),
      // иначе оболочка продолжит возвращать на эту страницу.
      useAuthStore.setState((state) =>
        state.user ? { user: { ...state.user, mustChangePassword: false } } : state,
      );
      void client.invalidateQueries({ queryKey: SESSIONS_KEY });
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <section className={island} aria-label="Смена пароля">
      <h3 className="text-sm font-semibold">Смена пароля</h3>
      <Field label="Текущий пароль" required>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Новый пароль"
          required
          hint="От 8 до 72 символов"
          error={tooShort ? 'Минимум 8 символов' : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field
          label="Повторите пароль"
          required
          error={mismatch ? 'Пароли не совпадают' : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button onClick={submit} loading={change.isPending} disabled={!valid}>
          Изменить пароль
        </Button>
      </div>
    </section>
  );
}

function Sessions() {
  const client = useQueryClient();
  const router = useRouter();
  const clear = useAuthStore((state) => state.clear);
  const [confirmAll, setConfirmAll] = useState(false);
  const query = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api.get<SessionDto[]>('/auth/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  const revokeAll = useMutation({ mutationFn: () => api.delete('/auth/sessions') });
  const revokeOthers = useMutation({
    mutationFn: () => api.delete<{ count: number }>('/auth/sessions/others'),
    onSuccess: () => void client.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });

  return (
    <section className={island} aria-label="Сессии">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Где выполнен вход</h3>
          <p className="text-xs text-muted-foreground">
            Незнакомое устройство — завершите сессию и смените пароль.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={revokeOthers.isPending}
            disabled={(query.data?.filter((session) => !session.current).length ?? 0) === 0}
            onClick={() =>
              revokeOthers.mutate(undefined, {
                onSuccess: () => toast.success('Остальные сессии завершены'),
                onError: (error) => toast.error(getErrorMessage(error)),
              })
            }
          >
            <LogOut />
            Завершить все остальные
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmAll(true)}>
            Выйти на всех устройствах
          </Button>
        </div>
      </div>
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={3} />}>
        {(sessions) =>
          sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Активных сессий нет.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle" data-testid="sessions">
              {sessions.map((session) => {
                const device = describeDevice(session.userAgent);
                const Icon = device.mobile ? Smartphone : Monitor;
                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                    data-current={session.current || undefined}
                  >
                    <Icon aria-hidden className="size-5 shrink-0 text-subtle-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {device.label}
                        {session.current ? <Badge tone="success">Это устройство</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.ipAddress ? `${session.ipAddress} · ` : ''}вход{' '}
                        {formatDateTime(session.createdAt)}
                      </p>
                    </div>
                    {/* Своё устройство отсюда не завершается — для этого «Выйти». */}
                    {session.current ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={revoke.isPending && revoke.variables === session.id}
                        onClick={() =>
                          revoke.mutate(session.id, {
                            onSuccess: () => toast.success('Сессия завершена'),
                            onError: (error) => toast.error(getErrorMessage(error)),
                          })
                        }
                      >
                        Завершить
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Выйти на всех устройствах?"
        description="Все сессии будут завершены, включая эту, — потребуется войти заново."
        confirmLabel="Выйти везде"
        destructive
        loading={revokeAll.isPending}
        onConfirm={async () => {
          try {
            await revokeAll.mutateAsync();
          } catch (error) {
            toast.error(getErrorMessage(error));
            throw error;
          }
          clear();
          router.replace('/login');
        }}
      />
    </section>
  );
}

/// Аккаунту нужно сменить пароль (mustChangePassword) — понятное объяснение.
function RequiredChangeNotice() {
  const required = useAuthStore((state) => Boolean(state.user?.mustChangePassword));
  if (!required) return null;
  return (
    <p
      className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning"
      role="status"
      data-testid="password-change-required"
    >
      Смените пароль, чтобы продолжить пользоваться twomc.su. После смены другие устройства будут
      разлогинены.
    </p>
  );
}

/// «Настройки → Безопасность»: пароль, двухфакторная аутентификация и сессии.
export default function SecuritySettingsPage() {
  return (
    <>
      <PageHeader
        title="Безопасность"
        description="Пароль, двухфакторная аутентификация и устройства, где выполнен вход."
      />
      <RequiredChangeNotice />
      <RequireSession>
        <div className="flex flex-col gap-5">
          <ChangePassword />
          <TwoFactorSettings />
          <Sessions />
        </div>
      </RequireSession>
    </>
  );
}
