import type { IsoDateString } from './common';

/// Объявления (ADR-0081): семантические типы, расписание по времени сервера,
/// аудитория и места показа.

export const ANNOUNCEMENT_KINDS = [
  'info',
  'important',
  'warning',
  'update',
  'event',
  'maintenance',
] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

/// banner — сайт под шапкой; notifications — центр уведомлений (рассылка при
/// наступлении начала показа); dashboard — главная админки.
export const ANNOUNCEMENT_PLACEMENTS = ['banner', 'notifications', 'dashboard'] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

/// all — все посетители; users — вошедшие; role — обладатели роли.
export type AnnouncementAudience = 'all' | 'users' | 'role';

/// Вычисляется сервером по флагу публикации и окну показа.
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'unpublished';

export const ANNOUNCEMENT_LIMITS = { title: 120, message: 2000 } as const;

export interface AdminAnnouncementDto {
  id: string;
  title: string;
  message: string;
  kind: AnnouncementKind;
  link: string | null;
  isDismissible: boolean;
  showFrom: IsoDateString | null;
  showUntil: IsoDateString | null;
  audience: AnnouncementAudience;
  /// Имя роли (`Role.name`) для `audience = role`.
  targetRole: string | null;
  placements: AnnouncementPlacement[];
  status: AnnouncementStatus;
  publishedAt: IsoDateString | null;
  notifiedAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/// `POST /admin/communications/announcements` и `PATCH …/:id` — сохраняется
/// без публикации; публикация — отдельное действие.
export interface UpsertAnnouncementRequest {
  title: string;
  message: string;
  kind: AnnouncementKind;
  link?: string | null;
  isDismissible?: boolean;
  showFrom?: IsoDateString | null;
  showUntil?: IsoDateString | null;
  audience?: AnnouncementAudience;
  targetRole?: string | null;
  placements?: AnnouncementPlacement[];
}

/// `GET /site/announcements?placement=banner|dashboard` — активные для зрителя.
export interface PublicAnnouncementDto {
  id: string;
  title: string;
  message: string;
  kind: AnnouncementKind;
  link: string | null;
  isDismissible: boolean;
  showUntil: IsoDateString | null;
}
