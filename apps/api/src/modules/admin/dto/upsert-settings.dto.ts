import { IsObject } from 'class-validator';

/// Простая KV-конфигурация (`SiteSetting`, key→value: string). Для
/// структурированных настроек сайта см. UpdateSiteSettingsDto/`SiteSettings`.
export class UpsertSettingsDto {
  @IsObject()
  settings!: Record<string, string>;
}
