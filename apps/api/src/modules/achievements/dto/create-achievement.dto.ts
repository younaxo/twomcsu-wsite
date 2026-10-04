import {
  AchievementCategory,
  AchievementConditionType,
  AchievementRarity,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateAchievementDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 160)
  slug!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 2000)
  description!: string;

  @IsString()
  iconUrl!: string;

  @IsEnum(AchievementCategory)
  category!: AchievementCategory;

  @IsEnum(AchievementRarity)
  rarity!: AchievementRarity;

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

  @IsEnum(AchievementConditionType)
  conditionType!: AchievementConditionType;

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
