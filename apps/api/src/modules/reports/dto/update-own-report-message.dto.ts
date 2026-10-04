import { IsString, Length } from 'class-validator';

export class UpdateOwnReportMessageDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
