/// Единственное поле — sub. Permissions/бан проверяются по БД (позже — по
/// Redis-кешу, PHASE 06), не хранятся в токене, чтобы отзыв действовал мгновенно
/// (см. docs/technical/10-RBAC-PERMISSIONS.md §B.5, ADR-0004).
export interface AccessTokenPayload {
  sub: string;
}
