'use client';

import type {
  PublicSiteAlert,
  SiteAlertIcon,
  SiteAlertStyle,
  SiteAlertVariant,
} from '@twomc/shared';
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
export const SITE_ALERT_ICON_COMPONENTS: Record<Exclude<SiteAlertIcon, 'custom'>, LucideIcon> = {
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
  custom: 'Свой SVG',
};

export const SITE_ALERT_VARIANT_LABELS: Record<SiteAlertVariant, string> = {
  danger: 'Важно (красный)',
  warning: 'Предупреждение',
  info: 'Информация',
  success: 'Успех',
};

/// Цвета типа — один набор для обоих режимов (семантические токены «Полдня»,
/// не bootstrap-оттенки). info в режиме «заливка» — фирменный оранжевый.
/// Фон ВСЕГДА плотный: outline — solid `bg-surface` (цвет только в обводке и
/// иконке), filled — сплошная заливка. Никаких полупрозрачных оттенков —
/// плашка лежит поверх контента sticky-шапки и не должна его просвечивать.
const VARIANT_TONE: Record<SiteAlertVariant, { icon: string; outline: string; filled: string }> = {
  danger: {
    icon: 'text-destructive',
    outline: 'border-destructive/60',
    filled: 'bg-destructive text-destructive-foreground',
  },
  warning: {
    icon: 'text-warning',
    outline: 'border-warning/60',
    filled: 'bg-warning text-warning-foreground',
  },
  info: {
    icon: 'text-primary',
    outline: 'border-primary/55',
    filled: 'bg-primary text-primary-foreground',
  },
  success: {
    icon: 'text-success',
    outline: 'border-success/60',
    filled: 'bg-success text-success-foreground',
  },
};

export const SITE_ALERT_STYLE_LABELS: Record<SiteAlertStyle, string> = {
  outline: 'Обводка',
  filled: 'Заливка',
};

/// Свой SVG — только как <img> из data URI: скрипты и внешние ресурсы внутри
/// SVG в таком контексте не выполняются (плюс проверка на backend).
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function SiteAlertIconView({
  alert,
  className,
}: {
  alert: Pick<PublicSiteAlert, 'icon' | 'customIcon' | 'variant'> & {
    displayStyle?: SiteAlertStyle;
  };
  className?: string;
}) {
  if (alert.icon === 'custom' && alert.customIcon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- проверенный SVG как изображение
      <img
        src={svgDataUri(alert.customIcon)}
        alt=""
        aria-hidden
        draggable={false}
        className={cn('size-5 shrink-0 select-none object-contain', className)}
      />
    );
  }
  const Icon =
    SITE_ALERT_ICON_COMPONENTS[alert.icon as Exclude<SiteAlertIcon, 'custom'>] ?? TriangleAlert;
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-5 shrink-0',
        // В заливке иконка наследует контрастный цвет текста.
        alert.displayStyle === 'filled'
          ? 'text-current'
          : (VARIANT_TONE[alert.variant] ?? VARIANT_TONE.danger).icon,
        className,
      )}
    />
  );
}

/// Представление плашки — общее для сайта, preview в админке и design-lab.
/// Режим (outline/filled) и тип (danger/warning/info/success) независимы.
/// `attached` — «язычок» из-под шапки: верх без скругления и без обводки.
export function SiteAlertView({
  alert,
  attached = false,
  className,
}: {
  alert: PublicSiteAlert;
  attached?: boolean;
  className?: string;
}) {
  const tone = VARIANT_TONE[alert.variant] ?? VARIANT_TONE.danger;
  const filled = alert.displayStyle === 'filled';
  const internal = alert.linkUrl?.startsWith('/') ?? false;
  const linkClass = cn(
    'shrink-0 rounded-sm text-sm font-semibold underline-offset-2 hover:underline',
    filled ? 'text-current underline' : 'text-primary',
  );
  return (
    <div
      role="region"
      aria-label="Объявление сайта"
      data-testid="site-alert"
      data-variant={alert.variant}
      data-style={alert.displayStyle}
      className={cn(
        'flex min-h-10 items-center gap-3 px-4 py-2 text-sm',
        attached ? 'rounded-b-xl' : 'rounded-xl',
        filled
          ? cn(tone.filled, 'shadow-md')
          : cn(
              'border bg-surface text-foreground shadow-sm',
              tone.outline,
              attached && 'border-t-0',
            ),
        className,
      )}
    >
      <SiteAlertIconView alert={alert} />
      <p className="min-w-0 flex-1 leading-snug">
        {alert.title ? <span className="font-semibold">{alert.title}. </span> : null}
        <span className={cn('break-words', filled ? 'opacity-90' : 'text-muted-foreground')}>
          {alert.message}
        </span>
      </p>
      {alert.linkUrl && alert.linkLabel ? (
        internal ? (
          <Link href={alert.linkUrl} className={linkClass}>
            {alert.linkLabel}
          </Link>
        ) : (
          <a href={alert.linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {alert.linkLabel}
          </a>
        )
      ) : null}
    </div>
  );
}

/// Глобальная плашка (ADR-0066): «выезжает» из нижней кромки шапки — чуть
/// уже её, скругление только снизу, тот же sticky-контейнер (HeaderStack),
/// поэтому двигается вместе с шапкой. Пользователь её не закрывает.
export function GlobalAlertBar({
  alert: override,
}: {
  /// Черновик для предпросмотра в админке; по умолчанию — опубликованная плашка.
  alert?: PublicSiteAlert | null;
} = {}) {
  const settings = usePublicSiteSettings();
  const alert = override === undefined ? settings.data?.alert : override;
  if (!alert) {
    return null;
  }
  return (
    // Та же ширина, что у поверхности шапки (max-w 1440), с отступами по
    // бокам — плашка визуально вложена и чуть уже шапки.
    <div data-testid="site-alert-stack" className="mx-auto max-w-[1440px]">
      <SiteAlertView alert={alert} attached className="mx-5 md:mx-10" />
    </div>
  );
}
