import { IsString, Length } from 'class-validator';

export class UpdateModeratorNoteDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
