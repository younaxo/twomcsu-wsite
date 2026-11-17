import { Prisma, ReportStatus } from '@prisma/client';

/// Статусы, в которых обращение считается завершённым: автор не может
/// писать/править сообщения, по наказанию можно подать новое обращение.
export const CLOSED_REPORT_STATUSES: ReportStatus[] = [
  ReportStatus.RESOLVED,
  ReportStatus.REJECTED,
  ReportStatus.CLOSED,
];

export const REPORT_STATUS_LABEL_RU: Record<ReportStatus, string> = {
  PENDING: 'Ожидает рассмотрения',
  IN_REVIEW: 'На рассмотрении',
  WAITING_RESPONSE: 'Ожидает вашего ответа',
  RESOLVED: 'Решено',
  REJECTED: 'Отклонено',
  CLOSED: 'Закрыто',
};

/// Верхняя граница `page` в списках: защита от огромного `skip` в запросе к БД.
export const MAX_REPORT_PAGE = 10_000;

/// Лимиты злоупотреблений по пользователю (SEC-01). Считаются по данным БД, а
/// не по IP: за прокси IP общий, а глобальные guards идут до авторизации.
export const REPORT_CREATE_LIMIT = 5;
export const REPORT_CREATE_WINDOW_MS = 10 * 60 * 1000;
export const REPORT_MESSAGE_LIMIT = 20;
export const REPORT_MESSAGE_WINDOW_MS = 60 * 1000;

/// Заметки: закреплённые первыми, внутри групп — по времени создания.
export const MODERATOR_NOTES_ORDER = [
  { isPinned: 'desc' },
  { createdAt: 'asc' },
] satisfies Prisma.ReportModeratorNoteOrderByWithRelationInput[];
