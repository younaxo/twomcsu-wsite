import { IsString, Length } from 'class-validator';

export class UpdateNewsCommentDto {
  @IsString()
  @Length(1, 2000)
  content!: string;
}
