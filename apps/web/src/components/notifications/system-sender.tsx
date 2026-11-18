import type { NotificationDto } from '@twomc/shared';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';

/// Уведомления автору обращения о действиях персонала (Q51, ADR-0175, R44):
/// отправитель — система, а не сотрудник. Правило повторяет API
/// (apps/api/src/modules/notifications/report-author-privacy.ts):
/// тип ∈ {REPORT_STATUS_CHANGED, REPORT_VERDICT, SYSTEM} И link начинается с `/support/`.
/// Не вынесено в packages/shared: там этого правила нет.
const REPORT_AUTHOR_TYPES: readonly string[] = [
  'REPORT_STATUS_CHANGED',
  'REPORT_VERDICT',
  'SYSTEM',
];
const REPORT_AUTHOR_LINK_PREFIX = '/support/';

function isReportAuthorNotification(item: Pick<NotificationDto, 'type' | 'link'>): boolean {
  return (
    REPORT_AUTHOR_TYPES.includes(item.type) &&
    typeof item.link === 'string' &&
    item.link.startsWith(REPORT_AUTHOR_LINK_PREFIX)
  );
}

/// Системное сообщение от имени сайта (ADR-0080): тип SYSTEM создаёт только
/// сервер — пользователи не могут отправить уведомление такого вида. Кроме того,
/// от имени системы показываются уведомления автору обращения (Q51).
export function isSystemMessage(item: Pick<NotificationDto, 'type' | 'link'>): boolean {
  return item.type === 'SYSTEM' || isReportAuthorNotification(item);
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
