'use client';

import { Ban, Calculator, ExternalLink, Radio, Snowflake } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { adminErrorText, LoadView, Panel, tableClass, tdClass, thClass, useLoad } from './admin-ui';
import {
  CALCULATE_PHRASE,
  type AdminApi,
  type AdminDraw,
  type AdminDrawStatus,
  type AdminMode,
  type AdminWinner,
} from './admin-types';

const STATUS_TEXT: Record<AdminDrawStatus, string> = {
  none: 'Не заморожен',
  frozen: 'Заморожен (снимок билетов зафиксирован)',
  calculated: 'Рассчитан (виден только администраторам)',
  broadcast: 'Эфир запущен',
};

function CalculateDialog({
  open,
  onOpenChange,
  draw,
  api,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draw: AdminDraw;
  api: AdminApi;
  onDone: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = phrase === CALCULATE_PHRASE && draw.snapshotHash !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy || draw.snapshotHash === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.calculate(draw.mode, draw.snapshotHash, phrase);
      toast.success('Результат рассчитан');
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setPhrase('');
          setError(null);
          onOpenChange(next);
        }
      }}
    >
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Рассчитать результат{draw.test ? ' (ТЕСТ)' : ''}</DialogTitle>
            <DialogDescription>
              Действие необратимо и выполняется один раз: зерно создаётся сейчас, повторный расчёт
              невозможен.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Хэш снимка ({draw.ticketCount} билетов)
              </p>
              <p className="break-all font-mono text-sm text-foreground" data-testid="calc-hash">
                {draw.snapshotHash}
              </p>
            </div>
            <Field label={`Введите «${CALCULATE_PHRASE}» для подтверждения`} error={error}>
              <Input
                value={phrase}
                autoComplete="off"
                onChange={(e) => setPhrase(e.target.value)}
                aria-label="Фраза подтверждения"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready} loading={busy}>
              <Calculator />
              Рассчитать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisqualifyDialog({
  winner,
  draw,
  api,
  onClose,
  onDone,
}: {
  winner: AdminWinner | null;
  draw: AdminDraw;
  api: AdminApi;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 300;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!winner || !valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.disqualify(draw.mode, winner.id, trimmed);
      const message = result.replacement
        ? `Место ${winner.place}: ${winner.playerName} дисквалифицирован, замена — ${result.replacement.playerName} (билет ${result.replacement.ticket}).`
        : `Место ${winner.place}: ${winner.playerName} дисквалифицирован, замены нет.`;
      toast.success(message);
      setReason('');
      onDone(message);
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={winner !== null}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setReason('');
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Дисквалифицировать победителя</DialogTitle>
            <DialogDescription>
              {winner
                ? `Место ${winner.place}: ${winner.playerName}, билет ${winner.ticket}. `
                : ''}
              Место получит следующий неиспользованный билет порядка.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Причина (3–300 символов)" error={error}>
              <Textarea
                value={reason}
                maxLength={300}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid} loading={busy}>
              <Ban />
              Дисквалифицировать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DrawBody({ api, draw, reload }: { api: AdminApi; draw: AdminDraw; reload: () => void }) {
  const [calc, setCalc] = useState(false);
  const [target, setTarget] = useState<AdminWinner | null>(null);
  const [busy, setBusy] = useState<'freeze' | 'broadcast' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (kind: 'freeze' | 'broadcast') => {
    setBusy(kind);
    try {
      await (kind === 'freeze' ? api.freeze(draw.mode) : api.broadcast(draw.mode));
      toast.success(kind === 'freeze' ? 'Розыгрыш заморожен' : 'Эфир запущен');
      reload();
    } catch (e) {
      toast.error(adminErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const winners = draw.winners ?? [];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Статус</dt>
          <dd className="font-medium text-foreground" data-testid="draw-status">
            {STATUS_TEXT[draw.status]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Билетов</dt>
          <dd className="tabular-nums text-foreground">{draw.ticketCount}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Хэш снимка (snapshotHash)</dt>
          <dd className="break-all font-mono text-foreground" data-testid="draw-hash">
            {draw.snapshotHash ?? 'появится после заморозки'}
          </dd>
        </div>
        {draw.seed ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Зерно ({draw.algorithm})</dt>
            <dd className="break-all font-mono text-foreground">{draw.seed}</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        {draw.status === 'none' ? (
          <Button
            onClick={() => void run('freeze')}
            disabled={!draw.canFreeze}
            loading={busy === 'freeze'}
          >
            <Snowflake />
            Заморозить
          </Button>
        ) : null}
        {draw.status === 'frozen' ? (
          <Button variant="destructive" onClick={() => setCalc(true)}>
            <Calculator />
            Рассчитать…
          </Button>
        ) : null}
        {draw.status === 'calculated' ? (
          <Button onClick={() => void run('broadcast')} loading={busy === 'broadcast'}>
            <Radio />
            Показать в эфире
          </Button>
        ) : null}
        {draw.test && draw.status === 'broadcast' ? (
          <Button asChild variant="secondary">
            <a href="/giveaway?mode=test" target="_blank" rel="noreferrer">
              <ExternalLink />
              Открыть тестовый эфир
            </a>
          </Button>
        ) : null}
      </div>
      {draw.status === 'none' && !draw.canFreeze ? (
        <p className="text-sm text-muted-foreground">
          Заморозка доступна после отсечки и при наличии хотя бы одного билета.
        </p>
      ) : null}
      {note ? (
        <p
          role="status"
          className="rounded border border-border bg-muted p-3 text-sm text-foreground"
        >
          {note}
        </p>
      ) : null}

      {winners.length > 0 ? (
        <div className="overflow-x-auto">
          <table className={tableClass} data-testid="winners-table">
            <caption className="sr-only">Предпросмотр результата</caption>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  Место
                </th>
                <th scope="col" className={thClass}>
                  Игрок
                </th>
                <th scope="col" className={thClass}>
                  Билет
                </th>
                <th scope="col" className={thClass}>
                  Приз
                </th>
                <th scope="col" className={thClass}>
                  Статус
                </th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...winners]
                .sort((a, b) => a.place - b.place || a.orderIndex - b.orderIndex)
                .map((w) => (
                  <tr key={w.id} className={w.status === 'disqualified' ? 'opacity-60' : undefined}>
                    <td className={`${tdClass} tabular-nums`}>{w.place}</td>
                    <td className={tdClass}>{w.playerName}</td>
                    <td className={`${tdClass} font-mono`}>{w.ticket}</td>
                    <td className={tdClass}>{w.prizeName}</td>
                    <td className={tdClass}>
                      {w.status === 'active'
                        ? 'Действует'
                        : `Дисквалифицирован: ${w.disqualifyReason ?? ''}`}
                    </td>
                    <td className={tdClass}>
                      {w.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="destructive-outline"
                          onClick={() => setTarget(w)}
                        >
                          <Ban />
                          Дисквалифицировать<span className="sr-only"> место {w.place}</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <CalculateDialog open={calc} onOpenChange={setCalc} draw={draw} api={api} onDone={reload} />
      <DisqualifyDialog
        winner={target}
        draw={draw}
        api={api}
        onClose={() => setTarget(null)}
        onDone={(message) => {
          setTarget(null);
          setNote(message);
          reload();
        }}
      />
    </div>
  );
}

export function DrawSection({ api, mode }: { api: AdminApi; mode: AdminMode }) {
  const { state, reload } = useLoad(() => api.draw(mode), [api, mode]);
  return (
    <Panel title="Розыгрыш" mode={mode}>
      <LoadView state={state} reload={reload}>
        {(draw) => <DrawBody api={api} draw={draw} reload={reload} />}
      </LoadView>
    </Panel>
  );
}
