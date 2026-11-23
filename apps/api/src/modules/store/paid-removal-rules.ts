import { MinecraftPunishmentKind, ProductType } from '@prisma/client';

/// Ключ настройки сайта с правилами платного снятия наказаний (0.12b, ADR-0186
/// пп. 6-7, ADR-0190). Значение — JSON. Меняет только владелец (без деплоя).
export const PAID_REMOVAL_SETTING = 'punishments.paidRemoval';

export interface PaidRemovalRules {
  /// Версия правил (попадает в журнал снятия).
  version: string;
  enabled: boolean;
  unbanEnabled: boolean;
  unmuteEnabled: boolean;
  /// Подстроки причины наказания (без учёта регистра), за которые снятие за
  /// деньги допускается. ПУСТО = снятие не допускается (fail closed).
  allowedReasons: string[];
  /// Подстроки причины, при которых снятие запрещено всегда (приоритетнее allowed).
  deniedReasons: string[];
  /// Лимит платных снятий на ник за период; null — без лимита.
  maxPerNick: number | null;
  periodDays: number;
  /// Минимальный возраст наказания в часах (0 — без ограничения).
  minAgeHours: number;
  /// Id системной учётной записи (accountType = SYSTEM) «магазин от имени владельца».
  /// Создаёт владелец; без неё снятие не записывается и не исполняется.
  actorUserId: string | null;
}

export const PAID_REMOVAL_EMPTY_RULES: PaidRemovalRules = {
  version: '0',
  enabled: false,
  unbanEnabled: false,
  unmuteEnabled: false,
  allowedReasons: [],
  deniedReasons: [],
  maxPerNick: null,
  periodDays: 30,
  minAgeHours: 0,
  actorUserId: null,
};

function strings(value: unknown, maxItems = 200): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const t = v.trim().toLowerCase();
    if (t.length > 0 && t.length <= 200) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function posInt(value: unknown, fallback: number | null): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/// Разбор значения настройки. Любая ошибка JSON или формы — пустые правила
/// (снятие недоступно). Булевы флаги принимаются только как явный `true`.
export function parsePaidRemovalRules(
  raw: string | null | undefined,
): PaidRemovalRules {
  if (!raw) return PAID_REMOVAL_EMPTY_RULES;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return PAID_REMOVAL_EMPTY_RULES;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return PAID_REMOVAL_EMPTY_RULES;
  }
  const d = data as Record<string, unknown>;
  const version =
    typeof d.version === 'string' && d.version.trim()
      ? d.version.trim().slice(0, 32)
      : typeof d.version === 'number'
        ? String(d.version).slice(0, 32)
        : '1';
  return {
    version,
    enabled: d.enabled === true,
    unbanEnabled: d.unbanEnabled === true,
    unmuteEnabled: d.unmuteEnabled === true,
    allowedReasons: strings(d.allowedReasons),
    deniedReasons: strings(d.deniedReasons),
    maxPerNick: posInt(d.maxPerNick, null),
    periodDays: posInt(d.periodDays, 30) ?? 30,
    minAgeHours:
      typeof d.minAgeHours === 'number' && d.minAgeHours >= 0
        ? Math.min(Math.floor(d.minAgeHours), 24 * 365)
        : 0,
    actorUserId:
      typeof d.actorUserId === 'string' && d.actorUserId.trim()
        ? d.actorUserId.trim().slice(0, 64)
        : null,
  };
}

/// Какой вид наказания снимает товар этого типа; null — товар не про снятие.
export function removalKindOf(
  type: ProductType,
): MinecraftPunishmentKind | null {
  if (type === ProductType.UNBAN) return MinecraftPunishmentKind.BAN;
  if (type === ProductType.UNMUTE) return MinecraftPunishmentKind.MUTE;
  return null;
}

/// Правила сконфигурированы настолько, чтобы вообще что-то продавать.
export function rulesAllowKind(
  rules: PaidRemovalRules,
  kind: MinecraftPunishmentKind,
): boolean {
  if (!rules.enabled || rules.allowedReasons.length === 0) return false;
  return kind === MinecraftPunishmentKind.BAN
    ? rules.unbanEnabled
    : rules.unmuteEnabled;
}

/// Подпадает ли причина наказания под правила (чистая функция).
export function reasonAllowed(
  rules: PaidRemovalRules,
  reason: string | null | undefined,
): boolean {
  const r = (reason ?? '').toLowerCase();
  if (!r) return false;
  if (rules.deniedReasons.some((d) => r.includes(d))) return false;
  return rules.allowedReasons.some((a) => r.includes(a));
}
