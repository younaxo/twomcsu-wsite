/// Единственное поле — sub. Permissions/бан проверяются по БД (позже — по
/// Redis-кешу, PHASE 06), не хранятся в токене, чтобы отзыв действовал мгновенно
/// (см. docs/technical/10-RBAC-PERMISSIONS.md §B.5, ADR-0004).
export interface AccessTokenPayload {
  sub: string;
  /// Сессия (id refresh-токена), из которой выдан access-токен (срез 1.2): для
  /// метки «Это устройство» и чтобы не отозвать собственную сессию. Не право.
  sid?: string;
}
