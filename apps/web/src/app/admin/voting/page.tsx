'use client';

import { Copy, Plus, Vote } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  useAdminVoteSiteActions,
  useAdminVoteSites,
  type AdminVoteSite,
  type VoteSiteInput,
} from '@/lib/admin/voting';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { plural } from '@/lib/format';

/// Сайты голосования в админке (срез 7.4, ADR-0144): список, создание и
/// правка, удаление. Секрет вебхука показывается один раз — после создания и
/// после замены; API хранит только хеш. Каждое действие — по своему праву
/// `voting.sites.*`.

const SLUG = /^[a-z0-9-]+$/;
const WEB_URL = /^https?:\/\/\S+$/i;
const HTTPS_URL = /^https:\/\/\S+$/i;
const digits = (value: string) => value.replace(/\D/g, '');

function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Секрет скопирован');
    } catch {
      toast.error('Не удалось скопировать — выделите и скопируйте вручную');
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Секрет вебхука</DialogTitle>
          <DialogDescription>
            Покажем один раз — сохраните его в настройках сайта-рейтинга. Потерянный секрет можно
            только заменить.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <code
            className="block break-all rounded-md bg-surface-sunken p-3 font-mono text-sm"
            data-testid="vote-secret"
          >
            {secret}
          </code>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => void copy()}>
            <Copy />
            Скопировать
          </Button>
          <Button onClick={onClose}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SiteDialog({
  site,
  onClose,
  onSecret,
}: {
  site: AdminVoteSite | null;
  onClose: () => void;
  onSecret: (secret: string) => void;
}) {
  const { create, update } = useAdminVoteSiteActions();
  const [form, setForm] = useState(() => ({
    name: site?.name ?? '',
    slug: site?.slug ?? '',
    description: site?.description ?? '',
    url: site?.url ?? '',
    logoUrl: site?.logoUrl ?? '',
    rewardCoins: String(site?.rewardCoins ?? 0),
    cooldownHours: String(site?.cooldownHours ?? 24),
    sortOrder: String(site?.sortOrder ?? 0),
    isActive: site?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Введите название';
    if (!site && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!WEB_URL.test(form.url.trim())) next.url = 'Ссылка вида https://…';
    if (form.logoUrl.trim() && !HTTPS_URL.test(form.logoUrl.trim())) {
      next.logoUrl = 'Ссылка вида https://…';
    }
    if (!(Number(form.cooldownHours) >= 1)) next.cooldownHours = 'Не меньше 1 часа';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const common = {
      name: form.name.trim(),
      description: form.description.trim(),
      url: form.url.trim(),
      rewardCoins: Number(form.rewardCoins) || 0,
      cooldownHours: Number(form.cooldownHours),
      sortOrder: Number(form.sortOrder) || 0,
    };
    const onError = (error: unknown) => toast.error(getErrorMessage(error));
    if (site) {
      update.mutate(
        {
          id: site.id,
          body: { ...common, logoUrl: form.logoUrl.trim() || null, isActive: form.isActive },
        },
        {
          onSuccess: () => {
            toast.success('Сайт сохранён');
            onClose();
          },
          onError,
        },
      );
    } else {
      const body: VoteSiteInput = {
        ...common,
        slug: form.slug,
        ...(form.logoUrl.trim() ? { logoUrl: form.logoUrl.trim() } : {}),
      };
      create.mutate(body, {
        onSuccess: (result) => {
          toast.success('Сайт добавлен');
          onClose();
          onSecret(result.secret);
        },
        onError,
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{site ? 'Изменить сайт' : 'Новый сайт голосования'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={120}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            {site ? null : (
              <Field
                label="Slug"
                required
                error={errors.slug}
                hint="В адресе вебхука, потом не меняется"
              >
                <Input
                  value={form.slug}
                  maxLength={80}
                  spellCheck={false}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            )}
            <Field
              label="Ссылка для голосования"
              required
              error={errors.url}
              className="sm:col-span-2"
            >
              <Input
                value={form.url}
                maxLength={500}
                spellCheck={false}
                onChange={(e) => set({ url: e.target.value })}
              />
            </Field>
            <Field
              label="Логотип"
              error={errors.logoUrl}
              hint="https://…"
              className="sm:col-span-2"
            >
              <Input
                value={form.logoUrl}
                maxLength={500}
                spellCheck={false}
                onChange={(e) => set({ logoUrl: e.target.value })}
              />
            </Field>
            <Field label="Монет за голос">
              <Input
                inputMode="numeric"
                value={form.rewardCoins}
                onChange={(e) => set({ rewardCoins: digits(e.target.value) })}
              />
            </Field>
            <Field label="Раз в, часов" required error={errors.cooldownHours}>
              <Input
                inputMode="numeric"
                value={form.cooldownHours}
                onChange={(e) => set({ cooldownHours: digits(e.target.value) })}
              />
            </Field>
            <Field label="Порядок">
              <Input
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => set({ sortOrder: digits(e.target.value) })}
              />
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={500}
                rows={2}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            {site ? (
              <CheckboxField
                label="Показывать на сайте"
                checked={form.isActive}
                onCheckedChange={(checked) => set({ isActive: checked === true })}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SitesList() {
  const { can } = usePermissions();
  const sites = useAdminVoteSites();
  const { remove, rotate } = useAdminVoteSiteActions();
  const [editing, setEditing] = useState<AdminVoteSite | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminVoteSite | null>(null);
  const [rotating, setRotating] = useState<AdminVoteSite | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <>
      {can('voting.sites.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить сайт
        </Button>
      ) : null}
      {sites.isPending ? (
        <SkeletonRows rows={3} />
      ) : sites.isError ? (
        <ErrorState error={sites.error} onRetry={() => sites.refetch()} />
      ) : sites.data.length === 0 ? (
        <EmptyState
          icon={<Vote />}
          title="Сайтов голосования нет"
          description="Добавьте сайт-рейтинг, чтобы игроки могли голосовать за сервер."
        />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-vote-sites"
        >
          {sites.data.map((site) => (
            <li key={site.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{site.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{site.slug}</span>
                  {site.isActive ? null : <Badge tone="warning">Скрыт</Badge>}
                </div>
                <span className="break-all text-xs text-muted-foreground">
                  +{site.rewardCoins}{' '}
                  {plural(site.rewardCoins, { one: 'монета', few: 'монеты', many: 'монет' })} · раз
                  в {site.cooldownHours} ч · {site.url}
                </span>
              </div>
              <span className="flex flex-wrap gap-1">
                {can('voting.sites.edit') ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(site)}>
                    Изменить
                  </Button>
                ) : null}
                {can('voting.sites.rotate_secret') ? (
                  <Button size="sm" variant="ghost" onClick={() => setRotating(site)}>
                    Новый секрет
                  </Button>
                ) : null}
                {can('voting.sites.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(site)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <SiteDialog
          key={editing?.id ?? 'new'}
          site={editing}
          onClose={() => setEditing(undefined)}
          onSecret={setSecret}
        />
      ) : null}
      {secret ? <SecretDialog secret={secret} onClose={() => setSecret(null)} /> : null}
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(open) => !open && setRotating(null)}
        title={`Заменить секрет «${rotating?.name ?? ''}»?`}
        description="Старый секрет сразу перестанет работать — голоса не засчитаются, пока новый не сохранён на сайте-рейтинге."
        confirmLabel="Заменить"
        destructive
        loading={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(rotating!.id, {
            onSuccess: (result) => {
              setRotating(null);
              setSecret(result.secret);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить сайт «${deleting?.name ?? ''}»?`}
        description="Голоса с него перестанут засчитываться. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Сайт удалён');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminVotingPage() {
  return (
    <PermissionGate requirement="voting.sites.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Голосование" description="Сайты-рейтинги, за которые голосуют игроки." />
        <SitesList />
      </div>
    </PermissionGate>
  );
}
