'use client';

import type { PublicSiteStatus, SiteUnavailableCode } from '@twomc/shared';
import { PowerOff, ShieldCheck, Wrench } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';
import { useModuleAvailability } from '@/lib/site/status';

type Maintenance = PublicSiteStatus['maintenance'];

const endFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function expected(maintenance: Maintenance): string | null {
  return maintenance?.estimatedEnd
    ? `Ожидаемое окончание — ${endFormat.format(new Date(maintenance.estimatedEnd))}.`
    : null;
}

/// «Раздел временно недоступен» (ADR-0082): вместо 500, пустого экрана или
/// битых ссылок — понятное состояние и путь назад.
export function ModuleUnavailable({
  reason,
  maintenance,
  className,
}: {
  reason: SiteUnavailableCode;
  maintenance?: Maintenance;
  className?: string;
}) {
  const works = reason === 'MAINTENANCE';
  const Icon = works ? Wrench : PowerOff;
  return (
    <section
      role="status"
      data-testid="module-unavailable"
      data-reason={reason}
      className={cn(
        'mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl bg-surface px-6 py-10 text-center shadow-sm',
        className,
      )}
    >
      <Icon aria-hidden className="size-8 text-warning" />
      <h1 className="font-display text-xl font-bold">
        {works ? 'Идут технические работы' : 'Раздел временно недоступен'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {works && maintenance?.message
          ? maintenance.message
          : 'Мы уже работаем над этим разделом. Остальной сайт доступен.'}
      </p>
      {works && expected(maintenance ?? null) ? (
        <p className="text-xs text-subtle-foreground">{expected(maintenance ?? null)}</p>
      ) : null}
      <Button asChild variant="secondary">
        <Link href="/">На главную</Link>
      </Button>
    </section>
  );
}

/// Плашка для сотрудника с правом обхода: он видит раздел, но знает, что
/// игрокам он сейчас закрыт.
export function StaffBypassNotice({ reason }: { reason: SiteUnavailableCode }) {
  return (
    <p
      data-testid="staff-bypass-notice"
      className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning"
    >
      <ShieldCheck aria-hidden className="size-4" />
      {reason === 'MAINTENANCE'
        ? 'Идут техработы — вы видите раздел как сотрудник'
        : 'Раздел выключен — вы видите его как сотрудник'}
    </p>
  );
}

/// Обёртка страницы модуля: недоступен — состояние вместо содержимого.
export function ModuleGate({ module, children }: { module: string; children: ReactNode }) {
  const { reason, bypass, maintenance } = useModuleAvailability(module);
  if (!reason) return children;
  if (bypass) {
    return (
      <>
        <StaffBypassNotice reason={reason} />
        {children}
      </>
    );
  }
  return (
    <div className="px-3 py-10 md:px-6">
      <ModuleUnavailable reason={reason} maintenance={maintenance} />
    </div>
  );
}

/// Экран полных техработ — вместо всего сайта (кроме входа и админки).
export function MaintenanceScreen({ maintenance }: { maintenance: Maintenance }) {
  return (
    <main
      id="main"
      data-testid="maintenance-screen"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <section className="flex w-full max-w-lg flex-col items-center gap-4 rounded-xl bg-surface px-6 py-10 text-center shadow-lg">
        <Image
          src={SITE_LOGO_URL}
          alt={SITE_NAME}
          width={64}
          height={64}
          quality={90}
          priority
          draggable={false}
          className="select-none rounded-lg"
        />
        <Wrench aria-hidden className="size-6 text-warning" />
        <h1 className="font-display text-2xl font-bold">
          {maintenance?.title || 'Технические работы'}
        </h1>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {maintenance?.message || 'Сайт временно недоступен. Скоро всё заработает!'}
        </p>
        {expected(maintenance) ? (
          <p className="text-xs text-subtle-foreground">{expected(maintenance)}</p>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Вход для сотрудников</Link>
        </Button>
      </section>
    </main>
  );
}
