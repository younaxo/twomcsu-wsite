import { ActivityVisibility } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateActivitySettingsDto {
  @IsOptional()
  @IsBoolean()
  showPurchases?: boolean;

  @IsOptional()
  @IsBoolean()
  showAchievements?: boolean;

  @IsOptional()
  @IsBoolean()
  showBadges?: boolean;

  @IsOptional()
  @IsBoolean()
  showAwards?: boolean;

  @IsOptional()
  @IsBoolean()
  showGifts?: boolean;

  @IsOptional()
  @IsBoolean()
  showFriendships?: boolean;

  @IsOptional()
  @IsBoolean()
  showProfileUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  showMilestones?: boolean;

  @IsOptional()
  @IsBoolean()
  showServerActivity?: boolean;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  purchasesVisibility?: ActivityVisibility;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  achievementsVisibility?: ActivityVisibility;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  badgesVisibility?: ActivityVisibility;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  giftsVisibility?: ActivityVisibility;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  friendshipsVisibility?: ActivityVisibility;

  @IsOptional()
  @IsEnum(ActivityVisibility)
  profileUpdatesVisibility?: ActivityVisibility;

  @IsOptional()
  @IsBoolean()
  notifyOnComment?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnReaction?: boolean;
}
