'use client';

import { ANNOUNCEMENT_TYPES, type AnnouncementType, type BroadcastResult } from '@twomc/shared';
import { Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlobalAlertEditor } from './_components/global-alert-editor';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-group';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useBroadcast, useRoles } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatNumber } from '@/lib/format';

const TYPE_META: Record<
  AnnouncementType,
  { label: string; tone: 'info' | 'success' | 'warning' | 'destructive' }
> = {
  info: { label: 'Информация', tone: 'info' },
  success: { label: 'Хорошие новости', tone: 'success' },
  warning: { label: 'Предупреждение', tone: 'warning' },
  danger: { label: 'Важно / опасность', tone: 'destructive' },
};

/// Рассылка объявления-уведомления (backend broadcast).
function BroadcastPanel() {
  const { can } = usePermissions();
  const roles = useRoles(can('roles.view'));
  const broadcast = useBroadcast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AnnouncementType>('info');
  const [link, setLink] = useState('');
  const [dismissible, setDismissible] = useState(true);
  const [showUntil, setShowUntil] = useState<IsoDate | null>(null);
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const valid = title.trim().length >= 3 && message.trim().length >= 5;
  const roleOptions = (roles.data ?? []).map((r) => ({
    value: r.name,
    label: r.displayName,
    keywords: [r.slug],
  }));

  const send = async () => {
    try {
      const res = await broadcast.mutateAsync({
        title: title.trim(),
        message: message.trim(),
        type,
        link: link.trim() || undefined,
        isDismissible: dismissible,
        showUntil: showUntil ? new Date(`${showUntil}T23:59:59`).toISOString() : undefined,
        targetRole: targetRole ?? undefined,
      });
      setResult(res);
      setConfirm(false);
      toast.success(
        `Отправлено ${formatNumber(res.delivered)} из ${formatNumber(res.usersTargeted)}`,
      );
      setTitle('');
      setMessage('');
      setLink('');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-4">
          <Field label="Заголовок" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Текст" required hint="Коротко и по делу; ссылка — отдельным полем">
            <Textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </Field>
          <Field label="Тип">
            <RadioCards
              value={type}
              onValueChange={(v) => setType(v as AnnouncementType)}
              options={ANNOUNCEMENT_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ссылка" hint="Необязательно">
              <Input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Показывать до" hint="Пусто — бессрочно">
              <DatePicker value={showUntil} onChange={setShowUntil} clearable />
            </Field>
          </div>
          <Field
            label="Кому"
            hint={
              can('roles.view')
                ? 'Пусто — всем пользователям'
                : 'Введите имя роли или оставьте пустым'
            }
          >
            {can('roles.view') ? (
              <Combobox
                options={roleOptions}
                value={targetRole}
                onValueChange={setTargetRole}
                placeholder="Всем"
                clearable
                loading={roles.isPending}
              />
            ) : (
              <Input
                value={targetRole ?? ''}
                onChange={(e) => setTargetRole(e.target.value || null)}
              />
            )}
          </Field>
          <SwitchField
            label="Можно закрыть"
            description="Пользователь может скрыть объявление"
            checked={dismissible}
            onCheckedChange={setDismissible}
          />
          <div>
            <Button onClick={() => setConfirm(true)} disabled={!valid}>
              <Send />
              Отправить
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Предпросмотр</p>
            <div className="flex items-start gap-3 rounded border bg-surface-raised p-3">
              <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {title.trim() || 'Заголовок'}
                  <Badge tone={TYPE_META[type].tone}>{TYPE_META[type].label}</Badge>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {message.trim() || 'Текст объявления появится здесь.'}
                </p>
                {link.trim() ? (
                  <p className="mt-1 truncate text-xs text-primary-soft-foreground">{link}</p>
                ) : null}
              </div>
            </div>
          </Card>
          {result ? (
            <Card className="text-sm">
              <p className="font-medium">Последняя отправка</p>
              <p className="text-muted-foreground">
                «{result.announcement.title}»: доставлено {formatNumber(result.delivered)} из{' '}
                {formatNumber(result.usersTargeted)}
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Отправить объявление?"
        description={
          targetRole
            ? `Получат пользователи с ролью «${targetRole}».`
            : 'Получат все пользователи сайта.'
        }
        confirmLabel="Отправить"
        loading={broadcast.isPending}
        onConfirm={send}
      />
    </>
  );
}

/// «Объявления» (Коммуникации): рассылка уведомлений и верхняя
/// информационная плашка сайта (ADR-0066).
export default function AnnouncementsPage() {
  const { can } = usePermissions();
  const tabs = [
    can('broadcast.create') && {
      value: 'broadcast',
      label: 'Рассылка',
      content: <BroadcastPanel />,
    },
    can('settings.alert.view') && {
      value: 'alert',
      label: 'Верхняя плашка',
      content: <GlobalAlertEditor />,
    },
  ].filter((tab): tab is { value: string; label: string; content: JSX.Element } => Boolean(tab));
  return (
    <PermissionGate requirement={['broadcast.create', 'settings.alert.view']}>
      <PageHeader
        title="Объявления"
        breadcrumbs={[{ label: 'Объявления' }]}
        description="Уведомления пользователям и информационная плашка под шапкой сайта."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Разделы объявлений">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </PermissionGate>
  );
}
