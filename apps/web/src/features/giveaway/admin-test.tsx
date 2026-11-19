'use client';

import { Eraser, FlaskConical } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { adminErrorText, Panel } from './admin-ui';
import type { AdminApi } from './admin-types';

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

/// Тестовый режим (ADR-G003 п. 5.11): тестовые данные не смешиваются с боевыми.
/// Метка «ТЕСТ» постоянная; сам раздел показывается только при testModeEnabled.
export function TestSection({ api, onChanged }: { api: AdminApi; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('3000');
  const [count, setCount] = useState('20');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const nameOk = NAME_RE.test(name);

  const run = async (kind: string, action: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    try {
      toast.success(await action());
      onChanged();
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const grant = (event: FormEvent) => {
    event.preventDefault();
    if (!nameOk) return;
    void run('time', async () => {
      const r = await api.testTime({ playerName: name, minutes: Number(minutes) });
      return `ТЕСТ: ${r.playerName} — всего ${r.totalMinutes} мин.`;
    });
  };

  return (
    <Panel title="Тестовый режим" mode="test">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Все действия здесь выполняются только с тестовыми данными и не затрагивают боевые билеты и
        розыгрыш. Пробный расчёт и эфир — в разделе «Розыгрыш» в режиме «Тест».
      </p>
      <form onSubmit={grant} className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field
            label="Ник игрока"
            error={name !== '' && !nameOk ? 'Латиница, цифры, «_», до 16 символов' : null}
          >
            <Input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Минуты">
            <Input
              type="number"
              min={1}
              max={100000}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={!nameOk} loading={busy === 'time'}>
          Выдать тестовое время
        </Button>
        <Button
          variant="secondary"
          disabled={!nameOk}
          loading={busy === 'ticket'}
          onClick={() =>
            void run('ticket', async () => {
              const r = await api.testTickets(name);
              return `ТЕСТ: билет ${r.ticket} у ${r.playerName}.`;
            })
          }
        >
          Выдать тестовый билет
        </Button>
      </form>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Сколько билетов">
            <Input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          loading={busy === 'seed'}
          onClick={() =>
            void run('seed', async () => {
              const r = await api.testSeed(Number(count));
              return `ТЕСТ: создано билетов — ${r.created}.`;
            })
          }
        >
          Создать тестовые билеты
        </Button>
        <Button variant="destructive-outline" onClick={() => setConfirmReset(true)}>
          <Eraser />
          Сбросить тест
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить тестовые данные?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут удалены только тестовые время, билеты и тестовый розыгрыш. Боевые данные не
              меняются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run('reset', async () => {
                  await api.testReset();
                  return 'ТЕСТ: данные сброшены.';
                })
              }
            >
              Сбросить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
