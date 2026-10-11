import { TopicCategory, TopicVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
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

  /// null очищает иконку, цвет и описание (ADR-0145).
  @IsOptional()
  @IsString()
  @Length(0, 100)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Цвет — в формате #RRGGBB' })
  color?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100_000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
