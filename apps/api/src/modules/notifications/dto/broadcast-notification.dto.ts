import { NotificationPriority } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

/// Массовая рассылка ограничена тремя типами, не привязанными к конкретному
/// доменному событию (ANNOUNCEMENT/MAINTENANCE/SYSTEM) — остальные значения
/// NotificationType создаются только доменными сервисами (друзья, комментарии
/// и т.д.), не вручную админом через broadcast.
export class BroadcastNotificationDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  message?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  link?: string;

  @IsOptional()
  @IsEnum(['ANNOUNCEMENT', 'MAINTENANCE', 'SYSTEM'])
  type?: 'ANNOUNCEMENT' | 'MAINTENANCE' | 'SYSTEM';

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  /// Если не задано — рассылка всем пользователям.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userIds?: string[];
}
