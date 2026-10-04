import { TopicCategory, TopicVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsEnum(TopicCategory)
  category?: TopicCategory;

  @IsOptional()
  @IsEnum(TopicVisibility)
  visibility?: TopicVisibility;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100_000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
