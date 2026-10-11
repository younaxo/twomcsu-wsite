import {
  AchievementCategory,
  AchievementRarity,
  UserBadgeType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/// conditionType здесь не меняется — у пользователей уже может быть
/// накоплен currentProgress по старому типу условия, смена типа
/// обесценила бы его без миграции данных; для другого условия создаётся
/// новое достижение.
export class UpdateAchievementDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  iconUrl?: string;

  @IsOptional()
  @IsEnum(AchievementCategory)
  category?: AchievementCategory;

  @IsOptional()
  @IsEnum(AchievementRarity)
  rarity?: AchievementRarity;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  conditionValue?: number;

  @IsOptional()
  @IsObject()
  conditionParams?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardRubies?: number;

  /// Значок-награда — только существующий тип (ADR-0138): опечатка раньше
  /// молча терялась при выдаче. null снимает награду.
  @IsOptional()
  @IsEnum(UserBadgeType)
  rewardBadgeType?: UserBadgeType | null;

  /// null очищает текст награды.
  @IsOptional()
  @IsString()
  @Length(0, 200)
  rewardTitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  rewardMessage?: string | null;
}
