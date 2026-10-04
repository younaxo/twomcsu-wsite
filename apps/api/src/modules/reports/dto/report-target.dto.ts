import { IsString, Length } from 'class-validator';

export class ReportTargetDto {
  @IsString()
  @Length(1, 16)
  username!: string;
}
