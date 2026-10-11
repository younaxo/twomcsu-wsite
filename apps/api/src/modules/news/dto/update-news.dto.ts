import { NewsCategory, NewsStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { SITE_IMAGE_MESSAGE, SITE_IMAGE_URL } from './site-image';

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100_000)
  content?: string;

  /// null убирает обложку.
  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(SITE_IMAGE_URL, { message: SITE_IMAGE_MESSAGE })
  coverImage?: string | null;

  @IsOptional()
  @IsEnum(NewsCategory)
  category?: NewsCategory;

  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  metaKeywords?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(SITE_IMAGE_URL, { message: SITE_IMAGE_MESSAGE })
  ogImage?: string | null;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}
