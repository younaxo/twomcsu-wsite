export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  /// Текущая сессия (из access-токена); у старых токенов без sid — null.
  sessionId?: string | null;
  /// Включена ли 2FA — для требования 2FA персоналу (ADR-0109).
  twoFactorEnabled?: boolean;
}
