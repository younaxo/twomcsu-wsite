import type { PublicSeasonalSettings } from '@twomc/shared';
import { cdnUrl } from '../env';

/// Сезонное оформление — единый реестр кампаний. Компоненты (BrandWordmark,
/// SeasonalHeaderDecoration, …) не знают о конкретных праздниках: они
/// получают активную кампанию и берут из неё нужный ассет, а при его
/// отсутствии — базовый вид twomc.su.
///
/// Выбор активной кампании (resolveSeasonalCampaign):
///   1. система выключена (`off`/`none`) → null (полный default);
///   2. явный override id → эта кампания (preview/ручное включение);
///   3. иначе — кампании, в окно которых попадает дата; при пересечении
///      побеждает больший `priority`, одна кампания за раз (без смешения
///      логотипов и эффектов).
///
/// Сейчас источник — env + даты; управление из админки (расписание по
/// серверному времени, ON/OFF, отдельные флаги O/логотипа/декора/эффектов)
/// подключается через тот же контракт `SeasonalCampaign`.
///
///   NEXT_PUBLIC_SEASONAL_DECORATION=off        — выключить систему полностью;
///   NEXT_PUBLIC_SEASONAL_DECORATION=<id>       — включить кампанию вне окна;
///   NEXT_PUBLIC_SEASONAL_HALLOWEEN_SRC=<url>   — свой ассет декора Halloween.

export type SeasonalCampaignId =
  | 'new-year'
  | 'valentine'
  | 'defender-day'
  | 'womens-day'
  | 'victory-day'
  | 'knowledge-day'
  | 'halloween'
  | 'black-friday';

export interface SeasonalImageAsset {
  src: string;
  /// Натуральные размеры — для пропорций без layout shift.
  width: number;
  height: number;
}

export interface SeasonalCampaign {
  id: SeasonalCampaignId;
  name: string;
  /// Чем больше, тем важнее при пересечении окон.
  priority: number;
  /// Окно показа (включительно). Для «плавающих» дат — функция.
  window:
    | { from: { month: number; day: number }; to: { month: number; day: number } }
    | ((date: Date) => boolean);
  /// Сезонная буква «o» для BrandWordmark (свой файл на каждый сезон).
  /// Это НЕ логотип: основной логотип (SITE_LOGO_URL) сезонами не меняется
  /// никогда (ADR-0065) — у кампании намеренно нет поля логотипа.
  wordmarkO?: string;
  /// Полоса декора над шапкой.
  headerDecoration?: SeasonalImageAsset;
  /// Эффект на фоне сайта (ADR-0079); нет — без эффекта.
  effect?: SeasonalEffect;
}

export type SeasonalEffect = 'snow' | 'hearts' | 'leaves' | 'rain' | 'blossom' | 'sun';

/// Чёрная пятница — последняя пятница ноября и выходные после неё.
function isBlackFridayWindow(date: Date): boolean {
  if (date.getMonth() !== 10) return false;
  const lastDay = new Date(date.getFullYear(), 11, 0);
  const offset = (lastDay.getDay() - 5 + 7) % 7;
  const friday = lastDay.getDate() - offset;
  return date.getDate() >= friday && date.getDate() <= friday + 3;
}

export const SEASONAL_CAMPAIGNS: SeasonalCampaign[] = [
  {
    id: 'new-year',
    effect: 'snow',
    name: 'Новый год',
    priority: 80,
    window: { from: { month: 12, day: 15 }, to: { month: 1, day: 10 } },
  },
  {
    id: 'valentine',
    effect: 'hearts',
    name: '14 февраля',
    priority: 60,
    window: { from: { month: 2, day: 10 }, to: { month: 2, day: 15 } },
  },
  {
    id: 'defender-day',
    effect: 'snow',
    name: '23 февраля',
    priority: 60,
    window: { from: { month: 2, day: 20 }, to: { month: 2, day: 24 } },
  },
  {
    id: 'womens-day',
    effect: 'blossom',
    name: '8 марта',
    priority: 60,
    window: { from: { month: 3, day: 5 }, to: { month: 3, day: 9 } },
  },
  {
    id: 'victory-day',
    effect: 'sun',
    name: 'День Победы',
    priority: 70,
    window: { from: { month: 5, day: 5 }, to: { month: 5, day: 10 } },
  },
  {
    id: 'knowledge-day',
    effect: 'leaves',
    name: '1 сентября',
    priority: 50,
    window: { from: { month: 8, day: 29 }, to: { month: 9, day: 2 } },
  },
  {
    id: 'halloween',
    effect: 'leaves',
    name: 'Хэллоуин',
    priority: 60,
    window: { from: { month: 10, day: 1 }, to: { month: 11, day: 7 } },
    wordmarkO: '/assets/brand/wordmark-o-halloween.svg',
    headerDecoration: {
      src:
        process.env.NEXT_PUBLIC_SEASONAL_HALLOWEEN_SRC ||
        cdnUrl('assets/images/halloween_assets.webp'),
      width: 2728,
      height: 146,
    },
  },
  {
    id: 'black-friday',
    name: 'Чёрная пятница',
    // Короткая коммерческая кампания важнее длинного сезонного окна.
    priority: 90,
    window: isBlackFridayWindow,
  },
];

function inWindow(campaign: SeasonalCampaign, date: Date): boolean {
  if (typeof campaign.window === 'function') {
    return campaign.window(date);
  }
  const value = (date.getMonth() + 1) * 100 + date.getDate();
  const from = campaign.window.from.month * 100 + campaign.window.from.day;
  const to = campaign.window.to.month * 100 + campaign.window.to.day;
  return from <= to ? value >= from && value <= to : value >= from || value <= to;
}

/// Активная кампания на дату. `null` — сезонное оформление отсутствует.
export function resolveSeasonalCampaign(
  date: Date,
  override: string | undefined = process.env.NEXT_PUBLIC_SEASONAL_DECORATION,
): SeasonalCampaign | null {
  const value = override?.trim().toLowerCase();
  if (value === 'off' || value === 'none') {
    return null;
  }
  if (value) {
    return SEASONAL_CAMPAIGNS.find((item) => item.id === value) ?? null;
  }
  return (
    SEASONAL_CAMPAIGNS.filter((item) => inWindow(item, date)).sort(
      (a, b) => b.priority - a.priority,
    )[0] ?? null
  );
}

/// Декор шапки активной кампании (если у неё он есть).
export function resolveSeasonalDecoration(
  date: Date,
  override?: string,
): (SeasonalImageAsset & { id: SeasonalCampaignId }) | null {
  const campaign =
    override === undefined
      ? resolveSeasonalCampaign(date)
      : resolveSeasonalCampaign(date, override);
  return campaign?.headerDecoration ? { id: campaign.id, ...campaign.headerDecoration } : null;
}

/// Кампания по серверным настройкам (ADR-0079): выключено → нет; принудительно
/// → выбранная; авто → реестр с переопределениями (выключенная кампания
/// пропускается, явные даты заменяют окно). `now` — серверное время. Без
/// настроек — прежний fallback на env.
export function resolveSeasonalFromSettings(
  settings: PublicSeasonalSettings | undefined,
  now: Date,
): SeasonalCampaign | null {
  if (!settings) return resolveSeasonalCampaign(now);
  if (!settings.enabled) return null;
  if (settings.mode === 'forced') {
    return SEASONAL_CAMPAIGNS.find((item) => item.id === settings.forcedCampaignId) ?? null;
  }
  const time = now.getTime();
  return (
    SEASONAL_CAMPAIGNS.filter((item) => {
      const override = settings.campaigns?.[item.id];
      if (override?.enabled === false) return false;
      if (override?.startsAt || override?.endsAt) {
        return (
          (!override.startsAt || time >= Date.parse(override.startsAt)) &&
          (!override.endsAt || time <= Date.parse(override.endsAt))
        );
      }
      return inWindow(item, now);
    }).sort((a, b) => b.priority - a.priority)[0] ?? null
  );
}
