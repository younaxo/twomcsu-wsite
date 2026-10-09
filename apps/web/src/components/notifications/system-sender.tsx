import type { NotificationDto } from '@twomc/shared';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';

/// Системное сообщение от имени сайта (ADR-0080): тип SYSTEM создаёт только
/// сервер — пользователи не могут отправить уведомление такого вида.
export function isSystemMessage(item: Pick<NotificationDto, 'type'>): boolean {
  return item.type === 'SYSTEM';
}

/// Защищённый отправитель «twomc.su · Системное» — основной логотип и метка.
export function SystemSender({ className }: { className?: string }) {
  return (
    <span
      data-testid="system-sender"
      className={cn('flex items-center gap-1.5 text-xs font-medium text-foreground', className)}
    >
      <Image
        src={SITE_LOGO_URL}
        alt=""
        width={16}
        height={16}
        quality={90}
        draggable={false}
        className="size-4 shrink-0 select-none rounded-sm"
      />
      {SITE_NAME}
      <Badge tone="primary">Системное</Badge>
    </span>
  );
}
