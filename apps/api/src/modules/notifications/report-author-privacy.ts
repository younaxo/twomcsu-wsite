/// Приватность уведомлений автору обращения (Q51, ADR-0175, R44).
/// Автор не должен узнавать сотрудника, выполнившего действие, даже если в
/// старой записи сохранён fromUserId. Правило (повторяется в web):
///   type ∈ {REPORT_STATUS_CHANGED, REPORT_VERDICT, SYSTEM}
///   И link начинается с `/support/` (карточка обращения автора).
/// REPORT_ASSIGNED и ссылки `/admin/reports/…` (персонал) правило не затрагивает.

export const REPORT_AUTHOR_NOTIFICATION_TYPES: readonly string[] = [
  'REPORT_STATUS_CHANGED',
  'REPORT_VERDICT',
  'SYSTEM',
];

export const REPORT_AUTHOR_LINK_PREFIX = '/support/';

export function isReportAuthorNotification(n: {
  type: string;
  link?: string | null;
}): boolean {
  return (
    REPORT_AUTHOR_NOTIFICATION_TYPES.includes(n.type) &&
    typeof n.link === 'string' &&
    n.link.startsWith(REPORT_AUTHOR_LINK_PREFIX)
  );
}

/// Для таких уведомлений убирает отправителя: fromUserId = null, fromUser = null
/// (поле fromUser добавляется, только если оно было в исходном объекте).
export function maskReportAuthorSender<
  T extends { type: string; link?: string | null; fromUserId?: string | null },
>(n: T): T {
  if (!isReportAuthorNotification(n)) {
    return n;
  }
  const masked: Record<string, unknown> = { ...n, fromUserId: null };
  if ('fromUser' in n) {
    masked.fromUser = null;
  }
  return masked as T;
}
