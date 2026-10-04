import { TopicCategory, TopicVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateTopicDto {
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

  @IsEnum(TopicCategory)
  category!: TopicCategory;

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

  @IsString()
  @Length(1, 100_000)
  content!: string;
}
