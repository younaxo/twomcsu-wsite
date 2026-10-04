import { AchievementCategory, AchievementRarity } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class ListAchievementsQueryDto {
  @IsOptional()
  @IsEnum(AchievementCategory)
  category?: AchievementCategory;

  @IsOptional()
  @IsEnum(AchievementRarity)
  rarity?: AchievementRarity;

  @IsOptional()
  @IsIn(['all', 'completed', 'incomplete'])
  filter?: 'all' | 'completed' | 'incomplete';

  @IsOptional()
  @IsString()
  search?: string;
}
