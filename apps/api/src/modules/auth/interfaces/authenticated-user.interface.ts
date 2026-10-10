export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  /// Текущая сессия (из access-токена); у старых токенов без sid — null.
  sessionId?: string | null;
}
