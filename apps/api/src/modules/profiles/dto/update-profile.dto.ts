import {
  CommentPolicy,
  DirectMessagePolicy,
  FriendRequestPolicy,
  Gender,
  ProfileVisibility,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @IsOptional()
  @IsEnum(FriendRequestPolicy)
  friendRequestPolicy?: FriendRequestPolicy;

  @IsOptional()
  @IsEnum(DirectMessagePolicy)
  directMessagePolicy?: DirectMessagePolicy;

  @IsOptional()
  @IsEnum(CommentPolicy)
  commentPolicy?: CommentPolicy;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  statusText?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  showBirthDate?: boolean;

  @IsOptional()
  @IsBoolean()
  hideEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  hideCountry?: boolean;

  @IsOptional()
  @IsBoolean()
  hideCity?: boolean;

  @IsOptional()
  @IsBoolean()
  hideBirthDate?: boolean;

  @IsOptional()
  @IsBoolean()
  hideGender?: boolean;

  @IsOptional()
  @IsBoolean()
  hideStatistics?: boolean;

  @IsOptional()
  @IsBoolean()
  hideSocials?: boolean;

  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnComment?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnMention?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnFriendRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnGift?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnOrder?: boolean;
}
