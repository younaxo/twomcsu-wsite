import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  discordEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  /// Показывать в системных push имя отправителя и текст (ADR-0097).
  @IsOptional()
  @IsBoolean()
  pushPreview?: boolean;

  /// Уведомления в интерфейсе (тост + звук), когда сайт открыт.
  @IsOptional()
  @IsBoolean()
  foregroundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'quietHoursStart должен быть в формате HH:mm',
  })
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'quietHoursEnd должен быть в формате HH:mm',
  })
  quietHoursEnd?: string;
}
