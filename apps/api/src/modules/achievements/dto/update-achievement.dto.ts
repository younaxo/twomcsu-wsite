import { AchievementCategory, AchievementRarity } from '@prisma/client';
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

  @IsOptional()
  @IsString()
  rewardBadgeType?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  rewardTitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  rewardMessage?: string;
}
