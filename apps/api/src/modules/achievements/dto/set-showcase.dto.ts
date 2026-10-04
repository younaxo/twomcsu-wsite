import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/// Полная замена набора "витрины" (showcase) — список id завершённых
/// UserAchievement в желаемом порядке отображения на профиле.
export class SetShowcaseDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  achievementIds!: string[];
}
