'use client';

import type { PublicSiteAlert, SiteAlertIcon, SiteAlertVariant } from '@twomc/shared';
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Gift,
  Info,
  Megaphone,
  OctagonAlert,
  ServerCrash,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { usePublicSiteSettings } from '@/lib/site/hooks';

/// Набор иконок плашки — ключи с backend (без SVG-кода от клиента, ADR-0066).
export const SITE_ALERT_ICON_COMPONENTS: Record<SiteAlertIcon, LucideIcon> = {
  'alert-triangle': TriangleAlert,
  'alert-octagon': OctagonAlert,
  info: Info,
  megaphone: Megaphone,
  wrench: Wrench,
  'shield-alert': ShieldAlert,
  clock: Clock,
  'server-crash': ServerCrash,
  sparkles: Sparkles,
  gift: Gift,
  calendar: CalendarDays,
  'check-circle': CircleCheck,
};

export const SITE_ALERT_ICON_LABELS: Record<SiteAlertIcon, string> = {
  'alert-triangle': 'Предупреждение',
  'alert-octagon': 'Стоп',
  info: 'Информация',
  megaphone: 'Объявление',
  wrench: 'Технические работы',
  'shield-alert': 'Безопасность',
  clock: 'Время',
  'server-crash': 'Сбой сервера',
  sparkles: 'Новое',
  gift: 'Подарок',
  calendar: 'Событие',
  'check-circle': 'Готово',
};

export const SITE_ALERT_VARIANT_LABELS: Record<SiteAlertVariant, string> = {
  danger: 'Важно (красный)',
  warning: 'Предупреждение',
  info: 'Информация',
  success: 'Успех',
};

/// Solid-заливка по семантическим токенам (не случайные цвета), без blur.
const VARIANT_CLASS: Record<SiteAlertVariant, string> = {
  danger: 'bg-destructive text-destructive-foreground',
  warning: 'bg-warning text-warning-foreground',
  info: 'bg-info text-info-foreground',
  success: 'bg-success text-success-foreground',
};

/// Представление плашки — общее для сайта и preview в админке.
export function SiteAlertView({
  alert,
  className,
}: {
  alert: PublicSiteAlert;
  className?: string;
}) {
  const Icon = SITE_ALERT_ICON_COMPONENTS[alert.icon] ?? TriangleAlert;
  const internal = alert.linkUrl?.startsWith('/') ?? false;
  return (
    <div
      role="region"
      aria-label="Объявление сайта"
      data-testid="site-alert"
      data-variant={alert.variant}
      className={cn(
        'flex items-start gap-3 rounded-lg px-4 py-3 shadow-sm sm:items-center',
        VARIANT_CLASS[alert.variant] ?? VARIANT_CLASS.danger,
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 sm:mt-0" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {alert.title ? <span className="font-semibold">{alert.title}. </span> : null}
        <span className="break-words">{alert.message}</span>
      </p>
      {alert.linkUrl && alert.linkLabel ? (
        internal ? (
          <Link
            href={alert.linkUrl}
            className="shrink-0 self-center rounded-sm text-sm font-semibold underline underline-offset-2"
          >
            {alert.linkLabel}
          </Link>
        ) : (
          <a
            href={alert.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 self-center rounded-sm text-sm font-semibold underline underline-offset-2"
          >
            {alert.linkLabel}
          </a>
        )
      ) : null}
    </div>
  );
}

/// Глобальная плашка под шапкой: показывается, пока включена в админке.
/// Пользователь её не закрывает (ни крестика, ни dismiss в storage).
export function GlobalAlertBar() {
  const settings = usePublicSiteSettings();
  const alert = settings.data?.alert;
  if (!alert) {
    return null;
  }
  return (
    <div className="px-3 pt-3 md:px-6">
      <SiteAlertView alert={alert} className="mx-auto max-w-[1440px]" />
    </div>
  );
}
