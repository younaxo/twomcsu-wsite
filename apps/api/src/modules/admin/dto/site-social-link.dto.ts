import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/// Зеркало SITE_SOCIAL_PLATFORMS из @twomc/shared: api не импортирует shared
/// даже типами — иначе tsc втягивает исходники пакета и сборка Nest
/// кладёт `main.js` не в `dist/` (ломает `node dist/main`).
export const SITE_SOCIAL_PLATFORM_VALUES = [
  'telegram',
  'discord',
  'youtube',
  'tiktok',
  'vk',
  'twitch',
  'instagram',
  'x',
  'facebook',
] as const;
export type SiteSocialPlatform = (typeof SITE_SOCIAL_PLATFORM_VALUES)[number];

/// Допустимые домены платформ — ссылка «Telegram» не может вести на чужой сайт.
export const SITE_SOCIAL_HOSTS: Record<SiteSocialPlatform, string[]> = {
  telegram: ['t.me', 'telegram.me'],
  discord: ['discord.gg', 'discord.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  vk: ['vk.com', 'vk.ru'],
  twitch: ['twitch.tv'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  facebook: ['facebook.com', 'fb.com'],
};

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const URL_OPTIONS = { protocols: ['https'], require_protocol: true };
const URL_MESSAGE = { message: 'Ссылка должна быть корректным https-адресом' };

export class CreateSiteSocialLinkDto {
  @IsIn(SITE_SOCIAL_PLATFORM_VALUES)
  platform!: SiteSocialPlatform;

  @Transform(trim)
  @IsUrl(URL_OPTIONS, URL_MESSAGE)
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateSiteSocialLinkDto {
  @IsOptional()
  @IsIn(SITE_SOCIAL_PLATFORM_VALUES)
  platform?: SiteSocialPlatform;

  @IsOptional()
  @Transform(trim)
  @IsUrl(URL_OPTIONS, URL_MESSAGE)
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class ReorderSiteSocialLinksDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids!: string[];
}
