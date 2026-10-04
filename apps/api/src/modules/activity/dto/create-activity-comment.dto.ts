import { IsString, Length } from 'class-validator';

export class CreateActivityCommentDto {
  @IsString()
  @Length(1, 2000)
  content!: string;
}
