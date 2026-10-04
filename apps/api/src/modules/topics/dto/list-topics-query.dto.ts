import { TopicCategory } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListTopicsQueryDto {
  @IsOptional()
  @IsEnum(TopicCategory)
  category?: TopicCategory;
}
