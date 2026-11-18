import type { ReportStatus, ReportType } from './admin';
import type { IsoDateString, Paginated } from './common';
import type { PunishmentType } from './moderation';

/// Система обращений (`/reports`, `/moderation/reports`, `/admin/reports`).
/// `ReportType`/`ReportStatus` и их константы уже экспортируются из `admin.ts`.

export const REPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
/// Вычисляется на сервере (в БД не хранится), отдаётся только персоналу.
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export interface ReportPublicUserDto {
  id: string;
  username: string;
  tag: string | null;
  avatar: string | null;
}

export interface ReportTargetDto {
  id: string;
  reportId: string;
  username: string;
  /// Только персоналу; игроку не отдаётся.
  userId?: string | null;
  order: number;
  createdAt: IsoDateString;
}

export interface ReportEvidenceLinkDto {
  id: string;
  url: string;
  title: string | null;
  type: string | null;
  order: number;
  createdAt: IsoDateString;
}

/// Обжалуемое наказание: без `issuedBy` и прочих служебных полей.
export interface ReportAppealedPunishmentDto {
  id: string;
  punishmentType: PunishmentType;
  reason: string;
  issuedAt: IsoDateString;
  expiresAt: IsoDateString | null;
  isActive: boolean;
  isAppealable: boolean;
}

export interface ReportMessageAttachmentDto {
  id: string;
  messageId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: IsoDateString;
}

export interface ReportMessageDto {
  id: string;
  reportId: string;
  authorId: string;
  content: string;
  contentHtml: string | null;
  isStaff: boolean;
  isSystem: boolean;
  isPinned: boolean;
  /// Автору удалённые сообщения не отдаются; персоналу — с признаком.
  isDeleted: boolean;
  createdAt: IsoDateString;
  attachments?: ReportMessageAttachmentDto[];
}

export interface ReportModeratorNoteDto {
  id: string;
  reportId: string;
  authorId: string;
  content: string;
  contentHtml: string | null;
  isPinned: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/// Базовые поля обращения, общие для игрока и персонала.
export interface ReportSummaryDto {
  id: string;
  reportNumber: string;
  type: ReportType;
  status: ReportStatus;
  authorId: string;
  appealedPunishmentId: string | null;
  server: string | null;
  incidentDate: IsoDateString | null;
  description: string;
  descriptionHtml: string | null;
  additionalText: string | null;
  verdict: string | null;
  verdictHtml: string | null;
  isLocked: boolean;
  lockedReason: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  resolvedAt: IsoDateString | null;
  targets?: ReportTargetDto[];
}

/// Служебные поля обращения, видимые только персоналу (игрок их не получает).
export interface ReportStaffFieldsDto {
  assignedToId: string | null;
  isArchived: boolean;
  archivedAt: IsoDateString | null;
  archivedBy: string | null;
  archiveReason: string | null;
  lockedBy: string | null;
  internalNote: string | null;
}

/// `GET /reports` (игрок): только свои, без служебных полей персонала
/// (`internalNote`, `assignedToId`, `lockedBy`, архивация) и `priority`.
export type ReportListResponse = Paginated<ReportSummaryDto>;
export interface ReportListQuery {
  page?: number;
  limit?: number;
  status?: ReportStatus;
  type?: ReportType;
}

/// `GET /reports/:reportNumber` для автора (без заметок, `internalNote`, `priority`).
export interface ReportDetailDto extends ReportSummaryDto {
  evidenceLinks: ReportEvidenceLinkDto[];
  messages: ReportMessageDto[];
  appealedPunishment: ReportAppealedPunishmentDto | null;
}

/// `GET /reports/:reportNumber` для персонала (`reports.view`).
export interface StaffReportDetailDto extends ReportDetailDto, ReportStaffFieldsDto {
  priority: ReportPriority;
  moderatorNotes: ReportModeratorNoteDto[];
  author: ReportPublicUserDto;
  assignedTo: ReportPublicUserDto | null;
}

/// `POST /reports`. `appealedPunishmentId` обязателен для PUNISHMENT_APPEAL
/// и запрещён для остальных типов; `targets` обязателен (>= 1) только для
/// PLAYER_COMPLAINT и ADMIN_COMPLAINT.
export interface CreateReportRequest {
  type: ReportType;
  targets?: Array<{ username: string }>;
  appealedPunishmentId?: string;
  server?: string;
  incidentDate?: IsoDateString;
  description: string;
  additionalText?: string;
  contactEmail?: string;
  contactPhone?: string;
  evidenceLinks?: Array<{ url: string; title?: string; type?: string }>;
}

/// `POST /reports/:reportNumber/messages` и `PATCH .../messages/:messageId`.
export interface ReportMessageRequest {
  content: string;
}

/// `GET /moderation/reports` и `GET /admin/reports/archived`.
export interface StaffListReportsQuery extends ReportListQuery {
  priority?: ReportPriority;
  /// `me` | `unassigned` | id пользователя.
  assignedToId?: string;
  /// Поиск: номер, описание, ник цели, ник автора (до 100 символов).
  q?: string;
}

export interface StaffReportListItemDto extends ReportSummaryDto, ReportStaffFieldsDto {
  priority: ReportPriority;
  author: ReportPublicUserDto;
  assignedTo?: ReportPublicUserDto | null;
}
export type StaffReportListResponse = Paginated<StaffReportListItemDto>;

/// `GET /moderation/reports/:reportNumber/history` (`reports.view`).
export interface ReportHistoryQuery {
  page?: number;
  limit?: number;
}

export interface ReportHistoryItemDto {
  id: string;
  /// Ключ права, по которому выполнено действие (например `reports.status`).
  action: string;
  targetType: string | null;
  targetId: string | null;
  /// Очищенное тело запроса (без секретов).
  changes: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'critical';
  createdAt: IsoDateString;
  actor: ReportPublicUserDto;
}
export type ReportHistoryResponse = Paginated<ReportHistoryItemDto>;

/// `PATCH /moderation/reports/:reportNumber/assign`; `null` — снять исполнителя.
export interface AssignReportRequest {
  assignedToId?: string | null;
}
