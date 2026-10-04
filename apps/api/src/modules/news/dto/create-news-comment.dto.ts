import { IsOptional, IsString, Length } from 'class-validator';

export class CreateNewsCommentDto {
  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
