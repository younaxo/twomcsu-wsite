import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/// Известные кампании (зеркало реестра web `lib/site/seasonal.ts`; api не
/// импортирует @twomc/shared — ADR про сборку api).
export const SEASONAL_CAMPAIGN_IDS = [
  'new-year',
  'valentine',
  'defender-day',
  'womens-day',
  'victory-day',
  'knowledge-day',
  'halloween',
  'black-friday',
] as const;

/// Эффекты сезонного движка (зеркало `SeasonalEffectId` из shared).
export const SEASONAL_EFFECT_IDS = [
  'snow',
  'hearts',
  'leaves',
  'rain',
  'blossom',
  'sun',
  'stars',
] as const;
export const SEASONAL_FALLING_MODES = ['season', 'always', 'off'] as const;
export const SEASONAL_MAX_EFFECTS = 3;

export class UpdateSeasonalDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['auto', 'forced'])
  mode?: 'auto' | 'forced';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(SEASONAL_CAMPAIGN_IDS as unknown as string[])
  forcedCampaignId?: string | null;

  @IsOptional()
  @IsBoolean()
  showWordmarkO?: boolean;

  @IsOptional()
  @IsBoolean()
  showDecoration?: boolean;

  @IsOptional()
  @IsBoolean()
  showEffects?: boolean;

  @IsOptional()
  @IsBoolean()
  showBanners?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  effectIntensity?: number;

  /// Падающий эффект независимо от сезона (ADR-0090).
  @IsOptional()
  @IsIn(SEASONAL_FALLING_MODES as unknown as string[])
  fallingMode?: (typeof SEASONAL_FALLING_MODES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(SEASONAL_EFFECT_IDS as unknown as string[])
  fallingEffect?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  effectSpeed?: number;

  /// `{ [campaignId]: { enabled?, startsAt?: ISO|null, endsAt?: ISO|null, effects?: id[]|null } }`
  /// — проверяется в сервисе.
  @IsOptional()
  @IsObject()
  campaigns?: Record<string, unknown>;
}
