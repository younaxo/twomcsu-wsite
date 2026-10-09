'use client';

import {
  SITE_SOCIAL_PLATFORMS,
  type SiteSocialLinkDto,
  type SiteSocialPlatform,
} from '@twomc/shared';
import { ArrowDown, ArrowUp, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button, IconButton } from '@/components/ui/button';
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch, SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { useSocialLinkMutations, useSocialLinks } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { SOCIAL_PLATFORM_LABELS } from '@/lib/site/config';
import { SettingsAside, SettingsIsland, SettingsLayout, SummaryRow } from './layout';

const URL_HINT: Record<SiteSocialPlatform, string> = {
  telegram: 'https://t.me/…',
  discord: 'https://discord.gg/…',
  youtube: 'https://youtube.com/@…',
  tiktok: 'https://tiktok.com/@…',
  vk: 'https://vk.com/…',
  twitch: 'https://twitch.tv/…',
  instagram: 'https://instagram.com/…',
  x: 'https://x.com/…',
  facebook: 'https://facebook.com/…',
};

interface Draft {
  platform: SiteSocialPlatform;
  url: string;
  title: string;
  isEnabled: boolean;
}

function SocialLinkDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Нет — добавление; есть — редактирование.
  initial: SiteSocialLinkDto | null;
}) {
  const { create, update } = useSocialLinkMutations();
  const [draft, setDraft] = useState<Draft>(() => ({
    platform: initial?.platform ?? 'telegram',
    url: initial?.url ?? '',
    title: initial?.title ?? '',
    isEnabled: initial?.isEnabled ?? true,
  }));
  const urlValid = /^https:\/\/\S+$/.test(draft.url.trim());
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const body = {
      platform: draft.platform,
      url: draft.url.trim(),
      title: draft.title.trim() || null,
      isEnabled: draft.isEnabled,
    };
    const done = {
      onSuccess: () => {
        toast.success(initial ? 'Соцсеть обновлена' : 'Соцсеть добавлена');
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (initial) {
      update.mutate({ id: initial.id, ...body }, done);
    } else {
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{initial ? 'Редактировать соцсеть' : 'Добавить соцсеть'}</DialogTitle>
          <DialogDescription>
            Иконка и название подставляются по платформе. Ссылка — только https на домен платформы.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Платформа" required>
            <Select
              value={draft.platform}
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, platform: value as SiteSocialPlatform }))
              }
            >
              <SelectTrigger aria-label="Платформа">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_SOCIAL_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    <span className="inline-flex items-center gap-2">
                      <BrandIcon id={platform} />
                      {SOCIAL_PLATFORM_LABELS[platform]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Ссылка"
            required
            error={draft.url && !urlValid ? 'Нужна ссылка вида https://…' : undefined}
          >
            <Input
              type="url"
              inputMode="url"
              placeholder={URL_HINT[draft.platform]}
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            />
          </Field>
          <Field label="Подпись" hint={`Пусто — «${SOCIAL_PLATFORM_LABELS[draft.platform]}»`}>
            <Input
              maxLength={60}
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </Field>
          <SwitchField
            label="Показывать на сайте"
            checked={draft.isEnabled}
            onCheckedChange={(value) => setDraft((d) => ({ ...d, isEnabled: value }))}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!urlValid || pending} loading={pending}>
            {initial ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SocialLinksList({ links, editable }: { links: SiteSocialLinkDto[]; editable: boolean }) {
  const { update, remove, reorder } = useSocialLinkMutations();
  const [dialog, setDialog] = useState<{ open: boolean; link: SiteSocialLinkDto | null }>({
    open: false,
    link: null,
  });
  const [deleting, setDeleting] = useState<SiteSocialLinkDto | null>(null);

  const move = (index: number, delta: -1 | 1) => {
    const ids = links.map((link) => link.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved as string);
    reorder.mutate(ids, { onError: (error) => toast.error(getErrorMessage(error)) });
  };

  return (
    <SettingsIsland
      title="Соцсети проекта"
      description="Показываются в футере, боковой панели и блоке «Сообщество» — в этом порядке."
      actions={
        editable ? (
          <Button size="sm" onClick={() => setDialog({ open: true, link: null })}>
            <Plus />
            Добавить соцсеть
          </Button>
        ) : null
      }
      data-testid="social-links"
    >
      {links.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Link2 />}
          title="Соцсетей пока нет"
          description="Добавьте Telegram, Discord, YouTube, TikTok, VK или другую платформу."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {links.map((link, index) => (
            <li
              key={link.id}
              className="flex items-center gap-3 py-2.5"
              data-platform={link.platform}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-subtle [&_svg]:size-[18px]">
                <BrandIcon id={link.platform} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {link.title || SOCIAL_PLATFORM_LABELS[link.platform]}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{link.url}</p>
              </div>
              <Tooltip content={link.isEnabled ? 'Показывается на сайте' : 'Скрыта'}>
                <span className="inline-flex">
                  <Switch
                    aria-label={`Показывать ${SOCIAL_PLATFORM_LABELS[link.platform]} на сайте`}
                    checked={link.isEnabled}
                    disabled={!editable || update.isPending}
                    onCheckedChange={(value) =>
                      update.mutate(
                        { id: link.id, isEnabled: value },
                        { onError: (error) => toast.error(getErrorMessage(error)) },
                      )
                    }
                  />
                </span>
              </Tooltip>
              {editable ? (
                <div className="flex shrink-0 items-center">
                  <IconButton
                    size="sm"
                    aria-label="Выше"
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label="Ниже"
                    disabled={index === links.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label="Редактировать"
                    onClick={() => setDialog({ open: true, link })}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton size="sm" aria-label="Удалить" onClick={() => setDeleting(link)}>
                    <Trash2 />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {dialog.open ? (
        <SocialLinkDialog
          key={dialog.link?.id ?? 'new'}
          open
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          initial={dialog.link}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить соцсеть?"
        description={
          deleting
            ? `${deleting.title || SOCIAL_PLATFORM_LABELS[deleting.platform]} пропадёт с сайта.`
            : undefined
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={() =>
          deleting
            ? remove
                .mutateAsync(deleting.id)
                .then(() => {
                  toast.success('Соцсеть удалена');
                })
                .catch((error) => {
                  toast.error(getErrorMessage(error));
                  throw error;
                })
            : undefined
        }
      />
    </SettingsIsland>
  );
}

export function SocialLinksTab() {
  const { can } = usePermissions();
  const links = useSocialLinks();
  const editable = can('settings.site.edit');
  return (
    <QueryBoundary query={links}>
      {(data) => {
        const enabled = data.filter((link) => link.isEnabled);
        return (
          <SettingsLayout
            main={<SocialLinksList links={data} editable={editable} />}
            aside={
              <>
                <SettingsAside title="Как увидят игроки">
                  {enabled.length === 0 ? (
                    <p className="text-muted-foreground">Ни одна соцсеть не показывается.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Предпросмотр соцсетей">
                      {enabled.map((link) => (
                        <li
                          key={link.id}
                          title={link.title || SOCIAL_PLATFORM_LABELS[link.platform]}
                          className="flex size-10 items-center justify-center rounded bg-background text-muted-foreground [&_svg]:size-5"
                        >
                          <BrandIcon id={link.platform} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <SummaryRow label="На сайте" value={enabled.length} />
                  <SummaryRow label="Скрыто" value={data.length - enabled.length} />
                </SettingsAside>
                <SettingsAside title="Правила">
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                    <li>Только https-ссылки на домен выбранной платформы.</li>
                    <li>Скрытые соцсети не видны на сайте, но сохраняются.</li>
                    <li>Каждое изменение пишется в журнал аудита.</li>
                  </ul>
                </SettingsAside>
              </>
            }
          />
        );
      }}
    </QueryBoundary>
  );
}
