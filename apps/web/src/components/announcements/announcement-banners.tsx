'use client';

import { cn } from '@/lib/cn';
import { useDismissedAnnouncements, usePublicAnnouncements } from '@/lib/site/announcements';
import { AnnouncementView } from './announcement-view';

/// Активные объявления места `placement` (ADR-0081): на сайте — под шапкой в
/// обычном потоке (не в sticky-шапке), на главной админки — блоком.
/// Закрываемые можно скрыть — запоминается в этом браузере.
export function AnnouncementBanners({
  placement = 'banner',
  className,
}: {
  placement?: 'banner' | 'dashboard';
  className?: string;
}) {
  const query = usePublicAnnouncements(placement);
  const { dismissed, dismiss } = useDismissedAnnouncements();
  const visible = (query.data ?? []).filter(
    (item) => !(item.isDismissible && dismissed.includes(item.id)),
  );
  if (visible.length === 0) return null;
  return (
    <section
      aria-label="Объявления"
      data-testid={`announcements-${placement}`}
      className={cn('flex flex-col gap-2', className)}
    >
      {visible.map((item) => (
        <AnnouncementView key={item.id} announcement={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </section>
  );
}
