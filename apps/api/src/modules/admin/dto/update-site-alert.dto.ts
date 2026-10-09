import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/// Зеркало SITE_ALERT_* из @twomc/shared: api не импортирует shared даже
/// типами (tsc втянул бы исходники пакета и сдвинул `dist/main`).
export const SITE_ALERT_VARIANT_VALUES = [
  'danger',
  'warning',
  'info',
  'success',
] as const;
export type SiteAlertVariant = (typeof SITE_ALERT_VARIANT_VALUES)[number];

export const SITE_ALERT_ICON_VALUES = [
  'alert-triangle',
  'alert-octagon',
  'info',
  'megaphone',
  'wrench',
  'shield-alert',
  'clock',
  'server-crash',
  'sparkles',
  'gift',
  'calendar',
  'check-circle',
] as const;
export type SiteAlertIcon = (typeof SITE_ALERT_ICON_VALUES)[number];

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateSiteAlertDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(SITE_ALERT_VARIANT_VALUES)
  variant?: SiteAlertVariant;

  @IsOptional()
  @IsIn(SITE_ALERT_ICON_VALUES)
  icon?: SiteAlertIcon;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  message?: string;

  /// Только https://… или внутренний путь `/…` — без javascript:/data:.
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  @Matches(/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/, {
    message: 'Ссылка должна начинаться с https:// или / (внутренняя страница)',
  })
  linkUrl?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  linkLabel?: string | null;
}
