'use client';

import { Search, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { toast } from '@/components/ui/toast';
import { formatDuration, formatMsk } from './format';
import {
  adminErrorText,
  fromLocalInput,
  LoadView,
  Panel,
  tableClass,
  tdClass,
  thClass,
  toLocalInput,
  useLoad,
} from './admin-ui';
import type { AdminApi, AdminMode, AdminSettings } from './admin-types';
import { prizeImageSrc } from './prize-images';

const PAGE_SIZE = 25;

function PlayerProfile({
  api,
  uuid,
  mode,
  onClose,
}: {
  api: AdminApi;
  uuid: string;
  mode: AdminMode;
  onClose: () => void;
}) {
  const { state, reload } = useLoad(() => api.player(uuid, mode), [api, uuid, mode]);
  return (
    <Panel
      title="Профиль игрока"
      mode={mode}
      actions={
        <Button variant="secondary" onClick={onClose}>
          К списку
        </Button>
      }
    >
      <LoadView state={state} reload={reload}>
        {(p) => (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-foreground">
              {p.playerName ?? 'Ник неизвестен'}{' '}
              <span className="font-mono text-base text-muted-foreground">
                {p.ticket ?? 'без билета'}
              </span>
            </p>
            <p className="text-foreground" data-testid="player-total">
              Всего: {formatDuration(p.totalMinutes)} ({p.totalMinutes} мин) из порога{' '}
              {formatDuration(p.thresholdMinutes)}
            </p>
            <table className={tableClass}>
              <caption className="sr-only">Время по дням (МСК)</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    День (МСК)
                  </th>
                  <th scope="col" className={thClass}>
                    Минуты
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.days.map((d) => (
                  <tr key={d.day}>
                    <td className={tdClass}>{d.day}</td>
                    <td className={`${tdClass} tabular-nums`}>{d.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadView>
    </Panel>
  );
}

export function TicketsSection({ api, mode }: { api: AdminApi; mode: AdminMode }) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [player, setPlayer] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () => api.tickets({ mode, q, page, pageSize: PAGE_SIZE }),
    [api, mode, q, page],
  );

  if (player)
    return <PlayerProfile api={api} uuid={player} mode={mode} onClose={() => setPlayer(null)} />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQ(input.trim());
  };
  return (
    <Panel title="Билеты" mode={mode}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-56 flex-1">
          <Field label="Ник или билет">
            <Input
              value={input}
              maxLength={32}
              onChange={(e) => setInput(e.target.value)}
              leading={<Search />}
            />
          </Field>
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <LoadView state={state} reload={reload}>
        {(data) => (
          <>
            <p className="text-sm text-muted-foreground" data-testid="tickets-total">
              Найдено: {data.total}
            </p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <caption className="sr-only">Выданные билеты</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>
                      Билет
                    </th>
                    <th scope="col" className={thClass}>
                      Игрок
                    </th>
                    <th scope="col" className={thClass}>
                      Выдан (МСК)
                    </th>
                    <th scope="col" className={thClass}>
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.ticket}>
                      <td className={`${tdClass} font-mono`}>{t.ticket}</td>
                      <td className={tdClass}>{t.playerName}</td>
                      <td className={tdClass}>{formatMsk(t.issuedAt)}</td>
                      <td className={tdClass}>
                        <Button size="sm" variant="ghost" onClick={() => setPlayer(t.playerUuid)}>
                          <UserRound />
                          Профиль<span className="sr-only"> {t.playerName}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > data.pageSize ? (
              <Pagination
                label="Страницы билетов"
                page={data.page}
                totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </LoadView>
    </Panel>
  );
}

function SettingsForm({
  api,
  initial,
  onSaved,
}: {
  api: AdminApi;
  initial: AdminSettings;
  onSaved: () => void;
}) {
  const [threshold, setThreshold] = useState(String(initial.thresholdMinutes));
  const [cutoff, setCutoff] = useState(toLocalInput(initial.cutoffAtUtc));
  const [start, setStart] = useState(toLocalInput(initial.startAtUtc));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frozen = initial.drawFrozen;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: { thresholdMinutes?: number; startAt?: string; cutoffAt?: string } = {};
    if (Number(threshold) !== initial.thresholdMinutes) body.thresholdMinutes = Number(threshold);
    if (!initial.started && start !== toLocalInput(initial.startAtUtc))
      body.startAt = fromLocalInput(start);
    if (cutoff !== toLocalInput(initial.cutoffAtUtc)) body.cutoffAt = fromLocalInput(cutoff);
    if (Object.keys(body).length === 0) {
      setError('Нечего сохранять: значения не изменились.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patchSettings(body);
      toast.success('Настройки сохранены');
      onSaved();
    } catch (e) {
      setError(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <Field
        label="Порог, минут"
        hint={initial.started ? 'После старта порог можно только уменьшить.' : undefined}
      >
        <Input
          type="number"
          min={1}
          value={threshold}
          disabled={frozen}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </Field>
      <Field
        label="Старт (UTC)"
        hint={`По МСК: ${initial.startAtMsk || formatMsk(initial.startAtUtc)}`}
      >
        <Input
          type="datetime-local"
          value={start}
          disabled={frozen || initial.started}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>
      <Field
        label="Отсечка (UTC)"
        hint={`По МСК: ${initial.cutoffAtMsk || formatMsk(initial.cutoffAtUtc)}`}
      >
        <Input
          type="datetime-local"
          value={cutoff}
          disabled={frozen}
          onChange={(e) => setCutoff(e.target.value)}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {frozen ? (
        <p className="text-sm text-muted-foreground">Розыгрыш заморожен: настройки не меняются.</p>
      ) : null}
      <div>
        <Button type="submit" loading={busy} disabled={frozen}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

export function SettingsSection({ api }: { api: AdminApi }) {
  const { state, reload } = useLoad(() => api.settings(), [api]);
  return (
    <Panel title="Настройки">
      <LoadView state={state} reload={reload}>
        {(s) => <SettingsForm key={JSON.stringify(s)} api={api} initial={s} onSaved={reload} />}
      </LoadView>
    </Panel>
  );
}

export function PrizesSection({ api }: { api: AdminApi }) {
  const { state, reload } = useLoad(() => api.prizes(), [api]);
  return (
    <Panel title="Призы">
      <p className="text-sm text-muted-foreground">
        Призы задаются конфигом <code>giveaway/config/prizes.json</code> и в админке только
        просматриваются.
      </p>
      <LoadView state={state} reload={reload}>
        {(data) => (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Призы">
            {data.items.map((p) => {
              const src = p.imageFile ? prizeImageSrc(p.imageFile) : null;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded border border-border p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold tabular-nums">
                    {p.place}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                  </div>
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      width={64}
                      height={48}
                      unoptimized
                      className="h-auto w-16"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </LoadView>
    </Panel>
  );
}

export function AuditSection({ api }: { api: AdminApi }) {
  const [page, setPage] = useState(1);
  const { state, reload } = useLoad(() => api.audit(page, 50), [api, page]);
  return (
    <Panel title="Аудит">
      <LoadView state={state} reload={reload}>
        {(data) => (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <caption className="sr-only">Журнал действий</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>
                      Время (МСК)
                    </th>
                    <th scope="col" className={thClass}>
                      Кто
                    </th>
                    <th scope="col" className={thClass}>
                      Действие
                    </th>
                    <th scope="col" className={thClass}>
                      Режим
                    </th>
                    <th scope="col" className={thClass}>
                      Подробности
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td className={tdClass}>{formatMsk(a.at)}</td>
                      <td className={`${tdClass} font-mono`}>{a.actor}</td>
                      <td className={tdClass}>{a.action}</td>
                      <td className={tdClass}>{a.mode === 'test' ? 'ТЕСТ' : (a.mode ?? '')}</td>
                      <td className={tdClass}>{a.detail ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.items.length === 0 ? (
              <p className="text-muted-foreground">Записей пока нет.</p>
            ) : null}
            {data.total > data.pageSize ? (
              <Pagination
                label="Страницы аудита"
                page={data.page}
                totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </LoadView>
    </Panel>
  );
}
