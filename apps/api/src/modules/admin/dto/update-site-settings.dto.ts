import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/// Частичное обновление singleton-строки `SiteSettings`. Поля зеркалят
/// схему 1:1 — см. apps/api/prisma/schema.prisma модель SiteSettings.
export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteDescription?: string;

  @IsOptional()
  @IsString()
  siteLogo?: string;

  @IsOptional()
  @IsString()
  siteFavicon?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  discordInvite?: string;

  @IsOptional()
  @IsString()
  vkGroup?: string;

  @IsOptional()
  @IsString()
  telegramChannel?: string;

  @IsOptional()
  @IsString()
  youtubeChannel?: string;

  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  registrationRequiresApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsersLimit?: number;

  @IsOptional()
  @IsBoolean()
  autoModeration?: boolean;

  @IsOptional()
  @IsBoolean()
  profanityFilter?: boolean;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metaKeywords?: string[];

  @IsOptional()
  @IsString()
  googleAnalyticsId?: string;

  @IsOptional()
  @IsString()
  yandexMetrikaId?: string;

  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  friendsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  storeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  newsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reportsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  defaultNotificationsEnabled?: boolean;

  /// Поле есть в схеме, но фактического 2FA-механизма ещё нет (нет
  /// TOTP/OTP-модели) — переключатель сохраняется, но ничего пока не
  /// обеспечивает принудительно. Честно задокументировано в ADR PHASE 20.
  @IsOptional()
  @IsBoolean()
  requireAdmin2fa?: boolean;
}
