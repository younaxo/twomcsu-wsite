import type { IsoDateString } from './common';

export type AccountType = 'DEFAULT' | 'SYSTEM';

/// Минимальное представление пользователя в ответах login/refresh/register.
export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface LoginRequest {
  emailOrUsername: string;
  password: string;
  captchaToken?: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export type RefreshResponse = LoginResponse;

/// Ответ `POST /auth/login` при необходимости пройти captcha (после 3 неудач с IP).
export interface LoginCaptchaRequired {
  requiresCaptcha: true;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  captchaToken?: string;
}

/// Effective permissions пользователя (PermissionService.getEffectivePermissions).
/// `superuser === true` ⇒ wildcard, `permissions` при этом пусто.
/// `maxPriority === null` ⇒ у пользователя нет ни одной роли.
export interface EffectivePermissions {
  superuser: boolean;
  permissions: string[];
  maxPriority: number | null;
}

export interface MeRole {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  color: string | null;
  priority: number;
  isSuperuser: boolean;
}

/// `GET /auth/me` — единственный источник effective permissions для frontend.
export interface MeResponse {
  id: string;
  shortId: number;
  tag: string;
  email: string;
  username: string;
  accountType: AccountType;
  mustChangePassword: boolean;
  roles: MeRole[];
  permissions: EffectivePermissions;
}

/// `GET /auth/sessions` — активные refresh-сессии текущего пользователя.
export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: IsoDateString;
  expiresAt: IsoDateString;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
