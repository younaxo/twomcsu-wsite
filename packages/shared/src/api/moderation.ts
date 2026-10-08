import type { IsoDateString } from './common';

export type PunishmentType = 'WARN' | 'MUTE' | 'KICK' | 'TEMPBAN' | 'PERMBAN';

/// `UserPunishment` — история наказаний (`GET /admin/users/:username/punishments`).
export interface PunishmentDto {
  id: string;
  userId: string;
  punishmentType: PunishmentType;
  reason: string;
  duration: string | null;
  server: string | null;
  issuedBy: string;
  issuedAt: IsoDateString;
  expiresAt: IsoDateString | null;
  isActive: boolean;
  isAppealable: boolean;
}

export interface IssuePunishmentRequest {
  punishmentType: PunishmentType;
  reason: string;
  duration?: string;
  server?: string;
  expiresAt?: IsoDateString;
  isAppealable?: boolean;
}

export interface UpdatePunishmentRequest {
  reason?: string;
  expiresAt?: IsoDateString;
  isActive?: boolean;
  isAppealable?: boolean;
}

/// Quick moderation (`POST /moderation/users/:userId/*`).
export interface MuteUserRequest {
  reason: string;
  durationMinutes?: number;
}

export interface WarnUserRequest {
  reason: string;
}

export interface KickUserRequest {
  reason?: string;
}

/// Без `durationHours` — перманентный бан.
export interface BanUserRequest {
  reason: string;
  durationHours?: number;
}
