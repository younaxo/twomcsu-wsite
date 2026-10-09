import type { HTMLAttributes, ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /// Крошки над заголовком (первый элемент «Админ-панель» добавляется сам).
  breadcrumbs?: BreadcrumbItem[];
  /// Кнопки справа (primary-действие + secondary).
  actions?: ReactNode;
  /// Бейджи/статус рядом с заголовком.
  meta?: ReactNode;
}

/// Шапка страницы админки: крошки, заголовок, подзаголовок-счётчик,
/// действия. На узких экранах действия переносятся под заголовок.
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  const items: BreadcrumbItem[] = [
    { label: 'Админ-панель', href: '/admin' },
    ...(breadcrumbs ?? []),
  ];
  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={items} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface PageSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/// Секция страницы с собственным заголовком (h2) — таблица, форма, блок.
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: PageSectionProps) {
  return (
    <section className={cn('flex flex-col gap-4', className)} {...props}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: number | string | null | undefined;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  loading?: boolean;
  /// Форматировать число через Intl (по умолчанию да для number).
  format?: boolean;
}

const toneClass: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary-soft-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/// KPI-карточка: подпись, крупное табличное число, пояснение.
export function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'default',
  loading = false,
  format = true,
  className,
  ...props
}: StatCardProps) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'number' && format
        ? formatNumber(value)
        : String(value);
  return (
    <Card className={cn('flex h-full flex-col gap-2', className)} {...props}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{label}</div>
        {icon ? (
          <span aria-hidden className="text-subtle-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <p
          className={cn('font-display text-3xl font-bold tracking-tight tabular', toneClass[tone])}
        >
          {display}
        </p>
      )}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </Card>
  );
}

/// Сетка KPI-карточек: 1 / 2 / 4 колонки.
export function StatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} {...props} />;
}

/// Пара «термин — значение» для карточек объекта (пользователь, роль, заказ).
export function DescriptionList({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)} {...props} />;
}

export function DescriptionItem({
  term,
  children,
  className,
  mono = false,
}: {
  term: ReactNode;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  );
}
