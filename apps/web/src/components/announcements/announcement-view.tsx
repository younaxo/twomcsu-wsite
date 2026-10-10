'use client';

import type { AnnouncementKind, PublicAnnouncementDto } from '@twomc/shared';
import {
  CalendarDays,
  CircleAlert,
  Info,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { ANNOUNCEMENT_KIND_META } from '@/lib/site/announcements';

const KIND_ICON: Record<AnnouncementKind, LucideIcon> = {
  info: Info,
  important: CircleAlert,
  warning: TriangleAlert,
  update: Sparkles,
  event: CalendarDays,
  maintenance: Wrench,
};

/// Цвет — только у иконки и метки типа (семантические токены), поверхность
/// solid: объявления не спорят с контентом и оранжевым акцентом.
const TONE_TEXT = {
  info: 'text-info',
  destructive: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  primary: 'text-primary',
} as const;

/// Объявление сайта (ADR-0081) — общее для баннера, дашборда и предпросмотра.
export function AnnouncementView({
  announcement,
  onDismiss,
  className,
}: {
  announcement: Pick<
    PublicAnnouncementDto,
    'title' | 'message' | 'kind' | 'link' | 'isDismissible'
  >;
  onDismiss?: () => void;
  className?: string;
}) {
  const meta = ANNOUNCEMENT_KIND_META[announcement.kind] ?? ANNOUNCEMENT_KIND_META.info;
  const Icon = KIND_ICON[announcement.kind] ?? Info;
  const link = announcement.link;
  const internal = link?.startsWith('/') ?? false;
  return (
    <div
      role="region"
      aria-label={`${meta.label}: ${announcement.title}`}
      data-testid="announcement"
      data-kind={announcement.kind}
      className={cn('flex items-start gap-3 rounded-xl bg-surface px-4 py-3 shadow-sm', className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', TONE_TEXT[meta.tone])} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn('text-xs font-semibold uppercase tracking-wide', TONE_TEXT[meta.tone])}
          >
            {meta.label}
          </span>
          <span className="font-semibold">{announcement.title}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
          {announcement.message}
        </p>
        {link ? (
          internal ? (
            <Link
              href={link}
              className="mt-1 inline-block font-semibold text-primary hover:underline"
            >
              Подробнее
            </Link>
          ) : (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-semibold text-primary hover:underline"
            >
              Подробнее
            </a>
          )
        ) : null}
      </div>
      {announcement.isDismissible && onDismiss ? (
        <IconButton size="sm" aria-label="Скрыть объявление" onClick={onDismiss}>
          <X />
        </IconButton>
      ) : null}
    </div>
  );
}
