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
] as const;
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

  /// `{ [campaignId]: { enabled?, startsAt?: ISO|null, endsAt?: ISO|null, effects?: id[]|null } }`
  /// — проверяется в сервисе.
  @IsOptional()
  @IsObject()
  campaigns?: Record<string, unknown>;
}
