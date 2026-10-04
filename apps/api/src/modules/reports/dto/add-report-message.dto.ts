import { IsString, Length } from 'class-validator';

export class AddReportMessageDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
