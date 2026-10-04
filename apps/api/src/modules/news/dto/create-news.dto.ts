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
  ValidateIf,
} from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 160)
  slug!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  excerpt?: string;

  @IsString()
  @Length(1, 100_000)
  content!: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsEnum(NewsCategory)
  category!: NewsCategory;

  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;

  @ValidateIf((o: CreateNewsDto) => o.status === NewsStatus.SCHEDULED)
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
  ogImage?: string;

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
