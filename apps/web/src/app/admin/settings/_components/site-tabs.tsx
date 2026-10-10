'use client';

import type { SiteSettingsDto } from '@twomc/shared';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { useDashboard } from '@/lib/admin/hooks';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  SettingsAside,
  SettingsIsland,
  SettingsLayout,
  SummaryRow,
} from '@/components/admin/islands';
import type { BoolKey, SiteSettingsFormApi } from './use-site-settings-form';

interface TabProps {
  settings: SiteSettingsDto;
  api: SiteSettingsFormApi;
  editable: boolean;
}

function OnOff({ value }: { value: boolean }) {
  return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Вкл.' : 'Выкл.'}</Badge>;
}

function BoolSwitch({
  api,
  editable,
  field,
  label,
  description,
}: {
  api: SiteSettingsFormApi;
  editable: boolean;
  field: BoolKey;
  label: string;
  description?: string;
}) {
  return (
    <SwitchField
      label={label}
      description={description}
      checked={api.form[field]}
      disabled={!editable}
      onCheckedChange={(value) => api.setBool(field, value)}
    />
  );
}

/* ---------------- Общие ---------------- */

export function GeneralTab({ settings, api, editable }: TabProps) {
  const { form } = api;
  return (
    <SettingsLayout
      main={
        <>
          <SettingsIsland
            title="Регистрация"
            description="Кто и как может создать аккаунт twomc.su."
          >
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              <BoolSwitch
                api={api}
                editable={editable}
                field="registrationEnabled"
                label="Регистрация открыта"
              />
              <BoolSwitch
                api={api}
                editable={editable}
                field="registrationRequiresApproval"
                label="Требуется одобрение"
                description="Новые аккаунты ждут подтверждения администрацией"
              />
            </div>
            <Field label="Лимит аккаунтов" hint="Пусто — без лимита" className="max-w-xs">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.maxUsersLimit ?? ''}
                disabled={!editable}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  api.setLimit(digits === '' ? null : Number(digits));
                }}
              />
            </Field>
          </SettingsIsland>

          <SettingsIsland
            title="SEO и аналитика"
            description="Мета-теги главной страницы и счётчики посещаемости."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Meta title">
                <Input
                  value={form.metaTitle ?? ''}
                  disabled={!editable}
                  onChange={(e) => api.setText('metaTitle', e.target.value)}
                />
              </Field>
              <Field label="Ключевые слова" hint="Через запятую">
                <Input
                  value={form.metaKeywords}
                  disabled={!editable}
                  onChange={(e) => api.setText('metaKeywords', e.target.value)}
                />
              </Field>
              <Field label="Meta description" className="md:col-span-2">
                <Textarea
                  rows={2}
                  value={form.metaDescription ?? ''}
                  disabled={!editable}
                  onChange={(e) => api.setText('metaDescription', e.target.value)}
                />
              </Field>
              <Field label="Google Analytics ID">
                <Input
                  className="font-mono"
                  value={form.googleAnalyticsId ?? ''}
                  disabled={!editable}
                  onChange={(e) => api.setText('googleAnalyticsId', e.target.value)}
                />
              </Field>
              <Field label="Яндекс.Метрика ID">
                <Input
                  className="font-mono"
                  value={form.yandexMetrikaId ?? ''}
                  disabled={!editable}
                  onChange={(e) => api.setText('yandexMetrikaId', e.target.value)}
                />
              </Field>
            </div>
          </SettingsIsland>

          <SettingsIsland title="Безопасность админ-панели">
            <BoolSwitch
              api={api}
              editable={editable}
              field="requireAdmin2fa"
              label="Требовать 2FA у администраторов"
              description="Флаг сохраняется; сам механизм 2FA ещё не реализован (ADR-0050)"
            />
          </SettingsIsland>
        </>
      }
      aside={
        <>
          <SettingsAside title="Сводка">
            <SummaryRow label="Регистрация" value={<OnOff value={form.registrationEnabled} />} />
            <SummaryRow
              label="Одобрение"
              value={<OnOff value={form.registrationRequiresApproval} />}
            />
            <SummaryRow
              label="Лимит аккаунтов"
              value={form.maxUsersLimit === null ? 'без лимита' : formatNumber(form.maxUsersLimit)}
            />
            <SummaryRow
              label="Аналитика"
              value={
                [form.googleAnalyticsId && 'GA', form.yandexMetrikaId && 'Метрика']
                  .filter(Boolean)
                  .join(' · ') || 'не подключена'
              }
            />
          </SettingsAside>
          <SettingsAside title="Бренд">
            <p className="text-muted-foreground">
              Название, логотип и favicon twomc.su фиксированы и здесь не меняются. Контакты
              поддержки — в футере сайта, соцсети — на вкладке «Соцсети».
            </p>
            <p className="text-xs text-subtle-foreground">
              Обновлено {formatDateTime(settings.updatedAt)}
            </p>
          </SettingsAside>
        </>
      }
    />
  );
}

/* ---------------- Модерация ---------------- */

function ModerationQueue() {
  const { can } = usePermissions();
  const dashboard = useDashboard();
  if (!can('dashboard.view')) {
    return <p className="text-muted-foreground">Очередь видна с правом просмотра дашборда.</p>;
  }
  if (dashboard.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  const moderation = dashboard.data?.moderation;
  if (!moderation) {
    return <p className="text-muted-foreground">Не удалось загрузить очередь.</p>;
  }
  const rows = [
    { label: 'Обращения', value: moderation.pendingReports },
    { label: 'Жалобы на комментарии', value: moderation.pendingCommentReports },
    { label: 'Жалобы на профили', value: moderation.pendingProfileReports },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="moderation-queue">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg bg-background-subtle px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{row.label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular">{formatNumber(row.value)}</p>
        </div>
      ))}
    </div>
  );
}

export function ModerationTab({ api, editable }: TabProps) {
  return (
    <SettingsLayout
      main={
        <>
          <SettingsIsland
            title="Очередь модерации"
            description="Сколько обращений и жалоб ждут решения прямо сейчас."
          >
            <ModerationQueue />
          </SettingsIsland>

          <SettingsIsland
            title="Автоматическая модерация"
            description="Фильтрация пользовательского текста: чат, комментарии, профили."
            actions={<Badge tone="warning">Применение — в разработке</Badge>}
          >
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              <BoolSwitch
                api={api}
                editable={editable}
                field="autoModeration"
                label="Автомодерация"
                description="Автоматическая проверка новых сообщений"
              />
              <BoolSwitch
                api={api}
                editable={editable}
                field="profanityFilter"
                label="Фильтр нецензурной лексики"
                description="Замена или блокировка запрещённых слов"
              />
            </div>
            <p className="text-xs text-subtle-foreground">
              Флаги сохраняются и станут действовать, когда фильтр подключат к чату и комментариям.
              Сейчас они не меняют поведение сайта.
            </p>
          </SettingsIsland>

          <SettingsIsland
            title="Обращения и жалобы"
            description="Приём жалоб от игроков и работа с ними."
          >
            <p className="text-sm text-muted-foreground">
              Модули включаются в разделе «Система → Техработы и модули». Действия над нарушителями
              (предупреждение, мут, бан) — в карточке пользователя; каждое действие пишется в журнал
              аудита.
            </p>
          </SettingsIsland>
        </>
      }
      aside={
        <>
          <SettingsAside title="Как это работает">
            <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-muted-foreground">
              <li>Игрок отправляет жалобу или обращение.</li>
              <li>Оно попадает в очередь со статусом «ожидает».</li>
              <li>Модератор разбирает и выносит решение.</li>
              <li>Наказание фиксируется у пользователя и в аудите.</li>
            </ol>
          </SettingsAside>
          <SettingsAside title="Рабочие разделы">
            <nav className="flex flex-col gap-1">
              {[
                { href: '/admin/users', label: 'Пользователи и наказания' },
                { href: '/admin/content', label: 'Контент и обращения' },
                { href: '/admin/audit-log', label: 'Журнал аудита' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  {link.label}
                  <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </nav>
          </SettingsAside>
        </>
      }
    />
  );
}

/* ---------------- Модули ---------------- */

/// Модули сайта переехали в реестр «Система → Техработы и модули» (ADR-0082);
/// здесь — только умолчания для новых аккаунтов.
export function ModulesTab({ api, editable }: TabProps) {
  const { can } = usePermissions();
  return (
    <SettingsLayout
      main={
        <SettingsIsland title="Умолчания аккаунтов" description="Применяются к новым аккаунтам.">
          <BoolSwitch
            api={api}
            editable={editable}
            field="defaultNotificationsEnabled"
            label="Уведомления по умолчанию"
            description="Включены у новых аккаунтов"
          />
        </SettingsIsland>
      }
      aside={
        <SettingsAside title="Модули сайта">
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            Включение и выключение модулей, защищённые модули и техработы — в отдельном разделе.
          </p>
          {can(['system.modules.view', 'system.maintenance.view']) ? (
            <Link
              href="/admin/system"
              className="flex items-center justify-between rounded-md px-2 py-1.5 font-medium text-primary hover:bg-muted"
            >
              Техработы и модули
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          ) : null}
        </SettingsAside>
      }
    />
  );
}
