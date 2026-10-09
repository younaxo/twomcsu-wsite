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

/// `POST /auth/forgot-password` — ответ всегда нейтральный (204), существование
/// аккаунта не раскрывается.
export interface ForgotPasswordRequest {
  email: string;
  captchaToken?: string;
}

/// `POST /auth/reset-password` — токен из письма + новый пароль.
export interface ResetPasswordRequest {
  token: string;
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
  /// Уровень доступа (ADR-0062) — отдельный от priority ролей параметр.
  accessLevel: number;
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

// --- Вход через Discord/Telegram (ADR-0069) ------------------------------------
// Только для уже привязанных аккаунтов: без автосоздания и автопривязки.

export type ExternalProvider = 'discord' | 'telegram';

/// `GET /auth/social/providers` — какие кнопки показывать (без секретов).
export interface SocialProvidersResponse {
  discord: { enabled: boolean };
  telegram: { enabled: boolean };
}

export type SocialAuthMode = 'login' | 'link';

/// Итог входа/привязки (`/auth/result?provider&mode&status&next`, ADR-0071).
/// В URL нет токенов: сессия — только в httpOnly refresh-cookie.
export type SocialResultStatus =
  | 'success'
  | 'linked'
  | 'already_linked'
  | 'not_linked'
  | 'taken'
  | 'slot_taken'
  | 'cancelled'
  | 'expired'
  | 'unavailable'
  | 'error';

/// `GET /auth/linked-accounts`.
export interface LinkedAccountDto {
  provider: ExternalProvider;
  username: string | null;
  displayName: string | null;
  linkedAt: IsoDateString;
  lastLoginAt: IsoDateString | null;
}

// --- Регистрация с подтверждением почты (ADR-0070) -------------------------------

export interface RegisterStartRequest {
  email: string;
  username: string;
  referralCode?: string;
  acceptTerms: boolean;
  acceptPersonalData: boolean;
  captchaToken?: string;
}

export interface RegisterVerificationState {
  verificationId: string;
  /// `yo***@example.com`
  maskedEmail: string;
  expiresAt: IsoDateString;
  resendAvailableAt: IsoDateString;
  resendsLeft: number;
  /// Нужен ли шаг привязки Minecraft (ADR-0072): включается вместе с плагином.
  minecraftRequired?: boolean;
}

export interface RegisterVerifyResponse {
  completionToken: string;
  email: string;
  minecraftRequired?: boolean;
}

// --- Привязка Minecraft при регистрации (ADR-0072) ---------------------------------

export type RegisterStage = 'email' | 'minecraft' | 'create';

/// `POST /auth/register/state` — продолжение после перезагрузки (без пароля).
export interface RegisterStateResponse extends RegisterVerificationState {
  stage: RegisterStage;
  username: string;
  minecraft: {
    required: boolean;
    name: string | null;
    challengePending: boolean;
    challengeExpiresAt: IsoDateString | null;
    confirmed: boolean;
  };
}

/// `POST /auth/register/minecraft/code` и `/challenge`: 5-символьный код для
/// ввода в игре командой `/site-connect <код>` (показывается только здесь).
export interface RegisterMinecraftChallenge {
  name: string | null;
  confirmed: boolean;
  challenge: string | null;
  challengeExpiresAt: IsoDateString | null;
  attempts?: number;
}

/// `POST /minecraft/site-connect/open` — 15-символьный код со страницы ссылки.
export interface SiteConnectOpenResponse {
  code: string;
  name: string;
  expiresAt: IsoDateString;
}

export interface RegisterCompleteRequest {
  verificationId: string;
  completionToken: string;
  password: string;
}
