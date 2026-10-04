import { IsString, Length } from 'class-validator';

export class CreateModeratorNoteDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
