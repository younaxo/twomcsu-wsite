import { PunishmentKind, PunishmentStatus } from './punishment.types';

export interface StatusInput {
  kind: PunishmentKind;
  /// Флаг `active` источника.
  active: boolean;
  /// `until` в мс Unix UTC; `<= 0` — бессрочно.
  untilMs: number;
  /// Уже нормализованные значения (null вместо пустых и `#...`).
  removedByUuid: string | null;
  removedByName: string | null;
}

/// Статус наказания (раздел 3.3). Поправку на расхождение часов (4.5) вносит
/// вызывающий (`nowMs` — время источника). `active` не используется как статус
/// истечения: LiteBans обновляет его пачками раз в ~20 часов, поэтому `until`
/// проверяется сайтом сам.
///
///   kick                                    -> EXPIRED (разовое событие)
///   заполнено removed_by_uuid/removed_by_name -> REMOVED
///   active = 0                              -> EXPIRED
///   until > 0 и until <= now                -> EXPIRED
///   иначе                                   -> ACTIVE
export function computePunishmentStatus(
  input: StatusInput,
  nowMs: number,
): Exclude<PunishmentStatus, 'DELETED_AT_SOURCE'> {
  if (input.kind === 'KICK') return 'EXPIRED';
  if (input.removedByUuid !== null || input.removedByName !== null) {
    return 'REMOVED';
  }
  if (!input.active) return 'EXPIRED';
  if (input.untilMs > 0 && input.untilMs <= nowMs) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}
